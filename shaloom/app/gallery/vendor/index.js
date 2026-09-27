'use strict';

var useReflexion = true;

// Handle different screen ratios
const mapVal = (value, min1, max1, min2, max2) => min2 + (value - min1) * (max2 - min2) / (max1 - min1);
var fovX = () => mapVal(window.innerWidth / window.innerHeight, 16/9, 9/16, 1.7, Math.PI / 3);

if (navigator.userAgent.match(/(iPad)|(iPhone)|(iPod)|(android)|(webOS)/i)) {
	useReflexion = false;
	// Account for the searchbar
	fovX = () => mapVal(window.innerWidth / window.innerHeight, 16/9, 9/16, 1.5, Math.PI / 3);
}
var fovY = () => 2 * Math.atan(Math.tan(fovX() * 0.5) * window.innerHeight / window.innerWidth);

let regl, map, drawMap, placement, drawPainting, fps;
const galleryCanvas = document.getElementById('gallery-canvas');
const resizeGalleryCanvas = () => {
	if (!galleryCanvas) return;
	const { width, height } = galleryCanvas.getBoundingClientRect();
	const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
	const drawingWidth = Math.max(1, Math.round(width * pixelRatio));
	const drawingHeight = Math.max(1, Math.round(height * pixelRatio));
	if (galleryCanvas.width !== drawingWidth || galleryCanvas.height !== drawingHeight) {
		galleryCanvas.width = drawingWidth;
		galleryCanvas.height = drawingHeight;
	}
};
resizeGalleryCanvas();
window.addEventListener('resize', resizeGalleryCanvas);

regl = require('regl')({
	canvas: galleryCanvas,
	extensions: [
		//'angle_instanced_arrays',
		'OES_element_index_uint',
		'OES_standard_derivatives'
	],
	optionalExtensions: [
		//'oes_texture_float',
		'EXT_texture_filter_anisotropic'
	],
	attributes: { alpha : false }
});

map = require('./map')(undefined, undefined, undefined, undefined, undefined, 0x51a100);
const mesh = require('./mesh');
drawMap = mesh(regl, map, useReflexion);
placement = require('./placement')(regl, map);
drawPainting = require('./painting')(regl);
const selectPainting = (painting) => {
	window.dispatchEvent(new CustomEvent('shaloom:painting-selected', {
		detail: {
			key: painting.key,
			title: painting.title,
			description: painting.description || '',
			isVideo: Boolean(painting.isVideo),
			url: painting.url,
			posterUrl: painting.posterUrl,
		},
	}));
	if (painting.isVideo) {
		placement.playMedia(painting.key).catch(() => {
			window.dispatchEvent(new Event('shaloom:video-error'));
		});
	} else {
		placement.clearMedia();
	}
};
fps = require('./fps')(map, fovY, placement.pickRay, selectPainting);

const context = regl({
	cull: {
		enable: true,
		face: 'back'
	},
	uniforms: {
		view: fps.view,
		proj: fps.proj,
		yScale: 1.0
	}
});

const reflexion = regl({
	cull: {
		enable: true,
		face: 'front'
	},
	uniforms: {
		yScale: -1.0
	}
});

const frameLoop = regl.frame(({
	time
}) => {
	fps.tick({
		time
	});
	placement.update(fps.pos, fps.fmouse[1], fovX());
	regl.clear({
		color: [0, 0, 0, 1],
		depth: 1
	});
	context(() => {
		if(useReflexion) {
			reflexion(() => {
				drawMap();
				drawPainting(placement.batch());
			});
		}
		drawMap();
		drawPainting(placement.batch());
	});
});

window.ShaloomGallery = {
	playMedia(key) {
		return placement.playMedia(key);
	},
	pauseMedia() {
		placement.pauseMedia();
	},
	seekMedia(time) {
		placement.seekMedia(time);
	},
	playbackState() {
		return placement.playbackState();
	},
	clearSelection() {
		placement.clearMedia();
		window.dispatchEvent(new Event('shaloom:painting-cleared'));
	},
	destroy() {
		frameLoop.cancel();
		fps.destroy?.();
		placement.destroy?.();
		regl.destroy();
		window.removeEventListener('resize', resizeGalleryCanvas);
	},
};
window.dispatchEvent(new Event('shaloom:gallery-ready'));
