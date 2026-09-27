'use strict';

const text = require('./text');
let paintingCache = {};
let unusedTextures = [];
let activePlayback = null;

function galleryUrl(from, count) {
	const params = new URLSearchParams({ from: String(from), count: String(count) });
	if (window.SHALOOM_SHUFFLE_SEED) params.set('shuffle', window.SHALOOM_SHUFFLE_SEED);
	return `/api/gallery-media?${params}`;
}

function playMark(ctx, width, height) {
	const radius = Math.min(width, height) * 0.095;
	const centerX = width / 2;
	const centerY = height / 2;
	ctx.fillStyle = 'rgba(8, 18, 16, 0.76)';
	ctx.beginPath();
	ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#f3e7d0';
	ctx.beginPath();
	ctx.moveTo(centerX - radius * 0.23, centerY - radius * 0.42);
	ctx.lineTo(centerX + radius * 0.46, centerY);
	ctx.lineTo(centerX - radius * 0.23, centerY + radius * 0.42);
	ctx.closePath();
	ctx.fill();
}

async function loadImage(regl, painting, resolution = 'high') {
	let image;
	try {
		const response = await fetch(painting.posterUrl || painting.url, { cache: 'force-cache' });
		if (!response.ok) throw new Error(`Media request failed (${response.status})`);
		image = await createImageBitmap(await response.blob());
	} catch (error) {
		console.warn('Gallery artwork could not be loaded.', error);
		return emptyImage(regl);
	}

	const maxEdge = resolution === 'high' ? 2048 : 1024;
	const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) return emptyImage(regl);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(image, 0, 0, width, height);
	if (painting.isVideo) playMark(ctx, width, height);
	image.close?.();

	const texture = (unusedTextures.pop() || regl.texture)({
		data: canvas,
		min: 'linear',
		mag: 'linear',
		wrapS: 'clamp',
		wrapT: 'clamp',
		flipY: true,
	});
	return [texture, (paintingWidth) => text.init((unusedTextures.pop() || regl.texture), painting.title, paintingWidth), width / height, width, height, painting.isVideo ? canvas : null];
}

function emptyImage(regl) {
	return [
		(unusedTextures.pop() || regl.texture)([[[200, 200, 200]]]),
		() => (unusedTextures.pop() || regl.texture)([[[0, 0, 0, 0]]]),
		1,
		1,
		1,
		null,
	];
}

function dispatchPlaybackState() {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new Event('shaloom:video-state'));
}

function stopPlayback(restorePoster = true) {
	if (!activePlayback) return;
	const { video, painting, canvas } = activePlayback;
	video.pause();
	if (restorePoster && painting.tex && painting.posterCanvas) {
		try { painting.tex.subimage(painting.posterCanvas); } catch {}
	}
	video.removeAttribute('src');
	video.load();
	canvas.width = 1;
	canvas.height = 1;
	activePlayback = null;
	dispatchPlaybackState();
}

function playMedia(painting) {
	if (!painting?.isVideo) return Promise.resolve(false);
	if (activePlayback?.painting.key === painting.key) {
		if (!activePlayback.video.paused) return Promise.resolve(true);
		return activePlayback.video.play().then(() => { dispatchPlaybackState(); return true; });
	}
	stopPlayback();
	const video = document.createElement('video');
	video.src = painting.url;
	video.preload = 'auto';
	video.playsInline = true;
	video.controls = false;
	video.muted = false;
	const canvas = document.createElement('canvas');
	canvas.width = painting.textureWidth || 1;
	canvas.height = painting.textureHeight || 1;
	const ctx = canvas.getContext('2d', { alpha: false });
	activePlayback = { video, painting, canvas, ctx, lastFrameAt: 0 };
	const play = video.play();
	dispatchPlaybackState();
	return play.then(() => true).catch((error) => {
		if (activePlayback?.painting.key === painting.key) stopPlayback();
		throw error;
	});
}

function updateVideoTexture() {
	if (!activePlayback || !activePlayback.ctx || !activePlayback.painting.tex) return;
	const { video, painting, canvas, ctx } = activePlayback;
	if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
	const now = performance.now();
	if (now - activePlayback.lastFrameAt < 33) return;
	activePlayback.lastFrameAt = now;
	try {
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		painting.tex.subimage(canvas);
	} catch (error) {
		console.warn('The gallery could not update the video frame.', error);
	}
}

function playbackState() {
	if (!activePlayback) return null;
	const { video, painting } = activePlayback;
	return {
		key: painting.key,
		currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
		duration: Number.isFinite(video.duration) ? video.duration : 0,
		paused: video.paused,
	};
}

module.exports = {
	fetch: (regl, count = 10, resolution = 'low', onOne, onAll) => {
		const from = Object.keys(paintingCache).length;
		fetch(galleryUrl(from, count))
			.then((response) => {
				if (!response.ok) throw new Error(`Gallery list request failed (${response.status})`);
				return response.json();
			})
			.then(({ items = [] }) => {
				let remaining = items.length;
				let nextIndex = 0;
				const ready = new Map();
				if (remaining === 0) return onAll();
				items.forEach((painting, index) => {
					paintingCache[painting.image_id] = painting;
					loadImage(regl, painting, resolution).then(([tex, textGen, aspect, textureWidth, textureHeight, posterCanvas]) => {
						ready.set(index, { ...painting, tex, textGen, aspect, textureWidth, textureHeight, posterCanvas });
						while (ready.has(nextIndex)) {
							onOne(ready.get(nextIndex));
							ready.delete(nextIndex++);
						}
						if (--remaining === 0) onAll();
					});
				});
			})
			.catch((error) => {
				console.error('Could not load the gallery catalogue.', error);
				onAll();
			});
	},
	load: (regl, painting, resolution = 'low') => {
		if (painting.tex || painting.loading) return;
		painting.loading = true;
		loadImage(regl, painting, resolution).then(([tex, textGen, aspect, textureWidth, textureHeight, posterCanvas]) => {
			painting.loading = false;
			painting.tex = tex;
			painting.text = textGen(painting.width);
			painting.aspect = aspect;
			painting.textureWidth = textureWidth;
			painting.textureHeight = textureHeight;
			painting.posterCanvas = posterCanvas;
		});
	},
	unload: (painting) => {
		if (activePlayback?.painting.key === painting.key) stopPlayback();
		if (painting.tex) {
			unusedTextures.push(painting.tex);
			painting.tex = undefined;
		}
		if (painting.text) {
			unusedTextures.push(painting.text);
			painting.text = undefined;
		}
	},
	playMedia,
	pauseMedia: () => {
		if (!activePlayback) return;
		activePlayback.video.pause();
		dispatchPlaybackState();
	},
	seekMedia: (time) => {
		if (!activePlayback || !Number.isFinite(time)) return;
		activePlayback.video.currentTime = Math.max(0, Math.min(activePlayback.video.duration || time, time));
		dispatchPlaybackState();
	},
	playbackState,
	updateVideoTexture,
	stopPlayback,
};
