import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

type LightingMode = "dim" | "lighter" | "daylight" | "twilight" | "party";
type FrameMode = "extended" | "wood" | "silver";
type GalleryItem = {
	image_id: number;
	key: string;
	file: string;
	title: string;
	description?: string;
	isVideo: boolean;
	url: string;
	posterUrl: string;
};
type SelectedMedia = Pick<GalleryItem, "key" | "title" | "description" | "isVideo" | "url" | "posterUrl">;
type PlaybackState = { key: string; currentTime: number; duration: number; paused: boolean } | null;

const lightingModes: { id: LightingMode; label: string }[] = [
	{ id: "dim", label: "Dim" },
	{ id: "lighter", label: "Lighter" },
	{ id: "daylight", label: "Daylight" },
	{ id: "twilight", label: "Twilight" },
	{ id: "party", label: "Party" },
];
const frameModes: { id: FrameMode; label: string }[] = [
	{ id: "extended", label: "Image edge" },
	{ id: "wood", label: "Wood" },
	{ id: "silver", label: "Silver" },
];
const frameValues: Record<FrameMode, number> = { extended: 0, wood: 1, silver: 2 };
const artBrightness: Record<LightingMode, number> = {
	dim: 0.94,
	lighter: 1.03,
	daylight: 1.1,
	twilight: 0.96,
	party: 1.02,
};

declare global {
	interface Window {
		SHALOOM_SHUFFLE_SEED?: string;
		SHALOOM_MEDIA_ENDPOINT?: string;
		SHALOOM_LIGHTING?: LightingMode;
		SHALOOM_FRAME_STYLE?: number;
		SHALOOM_ART_SCALE?: number;
		SHALOOM_ART_BRIGHTNESS?: number;
		ShaloomGallery?: {
			destroy: () => void;
			playMedia: (key: string) => Promise<boolean>;
			pauseMedia: () => void;
			seekMedia: (time: number) => void;
			playbackState: () => PlaybackState;
			clearSelection: () => void;
		};
	}
}

export function meta() {
	return [
		{ title: "Walk the gallery · Shaloom" },
		{ name: "description", content: "Step inside a walkable collection. Choose the light, frame, and order that suit the work." },
	];
}

export default function Gallery() {
	const { chapterId } = useParams();
	const stageRef = useRef<HTMLElement>(null);
	const location = useLocation();
	const navigate = useNavigate();
	const shuffleSeed = new URLSearchParams(location.search).get("shuffle") ?? "";
	const [status, setStatus] = useState("Loading the room controls…");
	const [artworkReady, setArtworkReady] = useState(false);
	const [galleryCount, setGalleryCount] = useState<number | null>(null);
	const [galleryOrder, setGalleryOrder] = useState("stable");
	const [error, setError] = useState("");
	const [privateCode, setPrivateCode] = useState("");
	const [needsPrivateCode, setNeedsPrivateCode] = useState(false);
	const [videoError, setVideoError] = useState(false);
	const [selected, setSelected] = useState<SelectedMedia | null>(null);
	const [playback, setPlayback] = useState<PlaybackState>(null);
	const [lighting, setLighting] = useState<LightingMode>("dim");
	const [frame, setFrame] = useState<FrameMode>("wood");
	const [artScale, setArtScale] = useState(1);

	useEffect(() => {
		window.SHALOOM_LIGHTING = lighting;
		window.SHALOOM_FRAME_STYLE = frameValues[frame];
		window.SHALOOM_ART_SCALE = artScale;
		window.SHALOOM_ART_BRIGHTNESS = artBrightness[lighting];
	}, [lighting, frame, artScale]);

	useEffect(() => {
		let active = true;
		setArtworkReady(false);
		setSelected(null);
		setPlayback(null);
		const canvas = document.getElementById("gallery-canvas") as HTMLCanvasElement | null;
		if (!canvas) return;
		const onContextLost = (event: Event) => {
			event.preventDefault();
			if (active) setError("The browser paused the 3D room. Close other 3D tabs, then reopen the gallery.");
		};
		canvas.addEventListener("webglcontextlost", onContextLost);
		window.SHALOOM_SHUFFLE_SEED = chapterId ? (window.crypto?.randomUUID?.() ?? String(Date.now())) : shuffleSeed;
		window.SHALOOM_MEDIA_ENDPOINT = chapterId ? `/api/chapters/${encodeURIComponent(chapterId)}/gallery-media` : "/api/gallery-media";
		setError("");
		setStatus("Loading the room and its frames…");
		const onGalleryReady = () => {
			if (active) setStatus("Room ready · setting the first frames…");
		};
		const onArtworkReady = () => {
			if (!active) return;
			setArtworkReady(true);
			setStatus(window.navigator.maxTouchPoints > 0
				? "Tap a painting for details · tap the floor to move · drag to look"
				: "Arrows / WASD to walk · click a painting for details · Esc releases mouse");
		};
		const onPaintingSelected = (event: Event) => {
			const detail = (event as CustomEvent<SelectedMedia>).detail;
			setSelected(detail);
			setVideoError(false);
		};
		const onPaintingCleared = () => setSelected(null);
		const onVideoError = () => setVideoError(true);
		window.addEventListener("shaloom:gallery-ready", onGalleryReady);
		window.addEventListener("shaloom:gallery-artwork-ready", onArtworkReady);
		window.addEventListener("shaloom:painting-selected", onPaintingSelected);
		window.addEventListener("shaloom:painting-cleared", onPaintingCleared);
		window.addEventListener("shaloom:video-error", onVideoError);

		const script = document.createElement("script");
		script.src = "/gallery-engine.js";
		script.async = true;
		script.onload = onGalleryReady;
		script.onerror = () => { if (active) setError("The gallery renderer did not load. Please refresh and try again."); };
		document.body.appendChild(script);

		const params = new URLSearchParams({ from: "0", count: "50" });
		if (window.SHALOOM_SHUFFLE_SEED) params.set("shuffle", window.SHALOOM_SHUFFLE_SEED);
		fetch(`${window.SHALOOM_MEDIA_ENDPOINT}?${params}`)
			.then((response) => {
				if (!response.ok) {
					if (chapterId && response.status === 404) setNeedsPrivateCode(true);
					if (chapterId && response.status === 401) setError("Sign in before entering this gallery.");
					throw new Error("Media list unavailable");
				}
				return response.json() as Promise<{ items?: GalleryItem[]; total?: number; order?: string }>;
			})
			.then((data) => {
				if (!active) return;
				setGalleryCount(data.total ?? data.items?.length ?? 0);
				setGalleryOrder(data.order ?? "stable");
			if (!data.items?.length) setError(chapterId ? "This chapter has no media yet. Add images or videos from its chapter page." : "There are no demo media in the gallery yet.");
			})
			.catch(() => { if (active) setError(chapterId ? "Sign in or enter this private chapter’s code to view it." : "The gallery could not reach its media store."); });

		const playbackTimer = window.setInterval(() => {
			if (active) setPlayback(window.ShaloomGallery?.playbackState() ?? null);
		}, 350);
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				window.ShaloomGallery?.clearSelection();
				setSelected(null);
			}
		};
		window.addEventListener("keydown", onEscape);

		return () => {
			active = false;
			window.clearInterval(playbackTimer);
			window.removeEventListener("keydown", onEscape);
			window.removeEventListener("shaloom:gallery-ready", onGalleryReady);
			window.removeEventListener("shaloom:gallery-artwork-ready", onArtworkReady);
			window.removeEventListener("shaloom:painting-selected", onPaintingSelected);
			window.removeEventListener("shaloom:painting-cleared", onPaintingCleared);
			window.removeEventListener("shaloom:video-error", onVideoError);
			canvas.removeEventListener("webglcontextlost", onContextLost);
			window.ShaloomGallery?.destroy();
			delete window.ShaloomGallery;
			delete window.SHALOOM_SHUFFLE_SEED;
			delete window.SHALOOM_MEDIA_ENDPOINT;
			script.remove();
		};
	}, [location.search, shuffleSeed, chapterId]);

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
		navigate(`/demo?shuffle=${encodeURIComponent(crypto.randomUUID())}`);
	}

	async function enterPrivateChapter(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sl_csrf="))?.slice(8);
		let csrfToken = csrf ? decodeURIComponent(csrf) : "";
		if (!csrfToken) {
			await fetch("/api/auth/csrf", { credentials: "same-origin" });
			csrfToken = decodeURIComponent(document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sl_csrf="))?.slice(8) ?? "");
		}
		const response = await fetch(`/api/chapters/${encodeURIComponent(chapterId ?? "")}/access`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ code: privateCode }) });
		if (response.ok) window.location.reload();
		else setError(response.status === 401 ? "Sign in before entering this private gallery." : "That chapter code was not accepted.");
	}

	function clearSelection() {
		window.ShaloomGallery?.clearSelection();
		setSelected(null);
		setPlayback(null);
		setVideoError(false);
	}

	function toggleVideo() {
		if (!selected?.isVideo) return;
		if (playback?.key === selected.key && !playback.paused) {
			window.ShaloomGallery?.pauseMedia();
			setPlayback(window.ShaloomGallery?.playbackState() ?? null);
			return;
		}
		window.ShaloomGallery?.playMedia(selected.key).then(() => {
			setPlayback(window.ShaloomGallery?.playbackState() ?? null);
		}).catch(() => setVideoError(true));
	}

	return (
		<main className="gallery-page" ref={stageRef}>
			<canvas id="gallery-canvas" className="gallery-canvas" tabIndex={0} aria-label="Walkable 3D gallery" />
			{!artworkReady && !error && <div className="gallery-loader" role="status">Setting the first frames…</div>}
			<div className="gallery-topbar">
				<Link className="gallery-brand" to={chapterId ? "/gallery" : "/"}><img src="/shaloom.svg" alt="" /> Shaloom</Link>
				<div className="gallery-top-actions">
					<details className="gallery-look-menu">
						<summary className="glass-button" aria-label="Open gallery lighting, frame, and size settings">Gallery look</summary>
						<div className="gallery-look-panel">
							<fieldset>
								<legend>Lighting</legend>
								<div className="look-choice-grid look-lighting-grid">
									{lightingModes.map((mode) => <button key={mode.id} type="button" className="look-choice" aria-pressed={lighting === mode.id} onClick={() => setLighting(mode.id)}>{mode.label}</button>)}
								</div>
							</fieldset>
							<fieldset>
								<legend>Painting edge</legend>
								<div className="look-choice-grid look-frame-grid">
									{frameModes.map((mode) => <button key={mode.id} type="button" className="look-choice" aria-pressed={frame === mode.id} onClick={() => setFrame(mode.id)}>{mode.label}</button>)}
								</div>
							</fieldset>
						<div className="art-size-control">
								<span>Artwork size · {Math.round(artScale * 100)}%</span>
								<input type="range" min="100" max="120" step="10" value={Math.round(artScale * 100)} onChange={(event) => setArtScale(Number(event.currentTarget.value) / 100)} aria-label="Artwork size percentage" />
							</div>
						</div>
					</details>
					<button type="button" className="glass-button fullscreen-button" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen">⛶ <span>Fullscreen</span></button>
					<Link className="glass-button close-gallery-button" to={chapterId ? "/gallery" : "/"}>Close gallery <span aria-hidden="true">×</span></Link>
				</div>
			</div>

			{selected && (
				<aside className="gallery-info-panel" aria-label="Selected painting details">
					<div className="gallery-info-heading">
						<div><p className="eyebrow">{selected.isVideo ? "A MOVING MEMORY" : "A MOMENT TO LINGER"}</p><h2>{selected.title}</h2></div>
						<button className="video-close" type="button" onClick={clearSelection} aria-label="Close details">×</button>
					</div>
					<p className="gallery-description">{selected.description?.trim() || "No description has been added for this work."}</p>
					{selected.isVideo && (
						<div className="inline-video-controls">
							<button type="button" className="gallery-pill media-control" onClick={toggleVideo}>
								{playback?.key === selected.key && !playback.paused ? "Pause on painting" : "Play on painting"}
							</button>
							<input
								type="range"
								min="0"
								max={playback?.duration || 0}
								step="0.1"
				value={playback?.key === selected.key ? Math.min(playback.currentTime, playback.duration || 0) : 0}
								disabled={!playback?.duration}
								aria-label="Seek within the video playing on the painting"
								onChange={(event) => window.ShaloomGallery?.seekMedia(Number(event.currentTarget.value))}
							/>
							<span className="video-time">{playback?.key === selected.key && playback.duration ? `${Math.floor(playback.currentTime)}s / ${Math.floor(playback.duration)}s` : "Video ready"}</span>
							{videoError && <span className="gallery-error" role="status">Video playback could not start. Tap Play on painting to try again.</span>}
						</div>
					)}
				</aside>
			)}

			<div className="gallery-bottom-bar">
				<div className="gallery-instructions">
					<span className="gallery-status">{galleryCount === null ? "Preparing gallery" : `${galleryCount} scenes · ${chapterId ? (galleryOrder === "shuffled" ? "randomized order" : "your planned order") : (shuffleSeed ? "intentional shuffle" : "upload time order")}`}</span>
					<span className="gallery-help">{status}</span>
					{error && <span className="gallery-error" role="status">{error} {chapterId && error.includes("Sign in") && <Link to="/login">Sign in ↗</Link>}</span>}
					{chapterId && needsPrivateCode && <form className="gallery-code-form" onSubmit={(event) => void enterPrivateChapter(event)}><input aria-label="Private chapter code" placeholder="8-character chapter code" value={privateCode} onChange={(event) => setPrivateCode(event.target.value)} minLength={8} maxLength={8} pattern="[A-Za-z0-9]{8}" required /><button className="gallery-pill">Enter</button></form>}
				</div>
				<div className="gallery-actions">
					{chapterId && <Link className="gallery-pill" to={`/chapter/${chapterId}`}>Edit chapter</Link>}
					{!chapterId && <>
					{shuffleSeed
						? <button className="gallery-pill" onClick={() => navigate("/demo")}>Use upload order</button>
						: <button className="gallery-pill" onClick={shuffle}>Shuffle on purpose</button>}
					</>}
				</div>
			</div>
		</main>
	);
}
