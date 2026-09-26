import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

type GalleryItem = {
	image_id: number;
	key: string;
	file: string;
	title: string;
	isVideo: boolean;
	url: string;
	posterUrl: string;
};

declare global {
	interface Window {
		SHALOOM_SHUFFLE_SEED?: string;
		ShaloomGallery?: { destroy: () => void };
	}
}

export function meta() {
	return [
		{ title: "Walk the gallery · Shaloom" },
		{ name: "description", content: "Step inside a stable, walkable collection of sample images and video." },
	];
}

export default function Gallery() {
	const stageRef = useRef<HTMLElement>(null);
	const location = useLocation();
	const navigate = useNavigate();
	const shuffleSeed = new URLSearchParams(location.search).get("shuffle") ?? "";
	const [items, setItems] = useState<GalleryItem[]>([]);
	const [status, setStatus] = useState("Loading the room controls…");
	const [artworkReady, setArtworkReady] = useState(false);
	const [galleryCount, setGalleryCount] = useState<number | null>(null);
	const [error, setError] = useState("");
	const [video, setVideo] = useState<GalleryItem | null>(null);

	useEffect(() => {
		let active = true;
		setArtworkReady(false);
		const canvas = document.getElementById("gallery-canvas") as HTMLCanvasElement | null;
		if (!canvas) return;
		const onContextLost = (event: Event) => {
			event.preventDefault();
			if (active) setError("The browser paused the 3D room. Close other 3D tabs, then reopen the gallery.");
		};
		canvas.addEventListener("webglcontextlost", onContextLost);
		window.SHALOOM_SHUFFLE_SEED = shuffleSeed;
		setError("");
		setStatus("Loading the room and its frames…");
		const onGalleryReady = () => {
			if (active) setStatus("Room ready · setting the first frames…");
		};
		const onArtworkReady = () => {
			if (!active) return;
			setArtworkReady(true);
			setStatus(window.navigator.maxTouchPoints > 0
				? "Tap a spot to move · drag to look around"
				: "Arrows / WASD to walk · click and drag to look · Esc releases mouse");
		};
		window.addEventListener("shaloom:gallery-ready", onGalleryReady);
		window.addEventListener("shaloom:gallery-artwork-ready", onArtworkReady);

		const script = document.createElement("script");
		script.src = "/gallery-engine.js";
		script.async = true;
		script.onload = onGalleryReady;
		script.onerror = () => { if (active) setError("The gallery renderer did not load. Please refresh and try again."); };
		document.body.appendChild(script);

		const params = new URLSearchParams({ from: "0", count: "50" });
		if (shuffleSeed) params.set("shuffle", shuffleSeed);
		fetch(`/api/gallery-media?${params}`)
			.then((response) => response.ok ? response.json() as Promise<{ items?: GalleryItem[]; total?: number }> : Promise.reject(new Error("Media list unavailable")))
			.then((data) => {
				if (!active) return;
				setItems(data.items ?? []);
				setGalleryCount(data.total ?? data.items?.length ?? 0);
				if (!data.items?.length) setError("There are no demo media in the gallery yet.");
			})
			.catch(() => { if (active) setError("The gallery could not reach its media store."); });

		return () => {
			active = false;
			window.removeEventListener("shaloom:gallery-ready", onGalleryReady);
			window.removeEventListener("shaloom:gallery-artwork-ready", onArtworkReady);
			canvas.removeEventListener("webglcontextlost", onContextLost);
			window.ShaloomGallery?.destroy();
			delete window.ShaloomGallery;
			delete window.SHALOOM_SHUFFLE_SEED;
			script.remove();
		};
	}, [location.search, shuffleSeed]);

	async function toggleFullscreen() {
		const target = stageRef.current;
		if (!target) return;
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await target.requestFullscreen();
		} catch {
			setError("Fullscreen is not available in this browser. The gallery still fills the page.");
		}
	}

	function shuffle() {
		navigate(`/gallery?shuffle=${encodeURIComponent(crypto.randomUUID())}`);
	}

	return (
		<main className="gallery-page" ref={stageRef}>
			<canvas id="gallery-canvas" className="gallery-canvas" tabIndex={0} aria-label="Walkable 3D gallery" />
			{!artworkReady && !error && <div className="gallery-loader" role="status">Setting the first frames…</div>}
			<div className="gallery-topbar">
				<Link className="gallery-brand" to="/"><img src="/shaloom.svg" alt="" /> Shaloom</Link>
				<div className="gallery-top-actions">
					<button type="button" className="glass-button" onClick={() => void toggleFullscreen()}>⛶ <span>Fullscreen</span></button>
					<Link className="glass-button" to="/">Close gallery <span aria-hidden="true">×</span></Link>
				</div>
			</div>
			<div className="gallery-bottom-bar">
				<div className="gallery-instructions">
					<span className="gallery-status">{galleryCount === null ? "Preparing gallery" : `${galleryCount} scenes · ${shuffleSeed ? "intentional shuffle" : "steady file order"}`}</span>
					<span className="gallery-help">{status}</span>
					{error && <span className="gallery-error" role="status">{error}</span>}
				</div>
				<div className="gallery-actions">
					{shuffleSeed
						? <button className="gallery-pill" onClick={() => navigate("/gallery")}>Use steady order</button>
						: <button className="gallery-pill" onClick={shuffle}>Shuffle on purpose</button>}
					{items.filter((item) => item.isVideo).map((item) => (
						<button className="gallery-pill gallery-pill-play" key={item.key} onClick={() => setVideo(item)}>
							<span aria-hidden="true">▶</span> Play {item.title}
						</button>
					))}
				</div>
			</div>

			{video && (
				<div className="video-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideo(null); }}>
					<section className="video-dialog" role="dialog" aria-modal="true" aria-labelledby="video-title">
						<div className="video-dialog-heading">
							<div><p className="eyebrow">A MOVING MEMORY</p><h2 id="video-title">{video.title}</h2></div>
							<button className="video-close" type="button" onClick={() => setVideo(null)} aria-label="Close video">×</button>
						</div>
						<video src={video.url} poster={video.posterUrl} controls playsInline preload="metadata">
							Your browser does not support MP4 playback.
						</video>
						<p className="video-hint">This video is streamed from Shaloom’s private R2 bucket. Use the player controls to play, pause, or seek.</p>
					</section>
				</div>
			)}
		</main>
	);
}
