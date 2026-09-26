import { useEffect, useState } from "react";
import { Link } from "react-router";

type PreviewMedia = { title: string; posterUrl: string; isVideo: boolean };

export function meta() {
	return [
		{ title: "Shaloom — Live out your motto" },
		{ name: "description", content: "A walk-through gallery for the scenes, art, and people you want to share." },
	];
}

function GalleryPreview() {
	const [items, setItems] = useState<PreviewMedia[]>([]);
	useEffect(() => {
		let active = true;
		fetch("/api/gallery-media?from=0&count=5")
			.then((response) => response.ok ? response.json() as Promise<{ items?: PreviewMedia[] }> : Promise.reject(new Error("Gallery preview unavailable")))
			.then((data) => { if (active) setItems(data.items ?? []); })
			.catch(() => undefined);
		return () => { active = false; };
	}, []);

	return (
		<div className="preview-room" aria-label="A still preview of the walk-through gallery">
			<div className="preview-ceiling" />
			<div className="preview-floor" />
			<div className="preview-wall">
				{items.slice(0, 5).map((item, index) => (
					<div className={`preview-frame preview-frame-${index + 1}`} key={item.posterUrl}>
						<img src={item.posterUrl} alt="" loading="lazy" />
						{item.isVideo && <span className="preview-play" aria-hidden="true">▶</span>}
					</div>
				))}
				{items.length === 0 && <div className="preview-frame preview-frame-placeholder" />}
			</div>
			<span className="preview-caption">A little world, made of your scenes</span>
		</div>
	);
}

export default function Home() {
	return (
		<main className="home-page">
			<header className="site-header">
				<Link className="brand" to="/" aria-label="Shaloom home">
					<img src="/shaloom.svg" alt="" />
					<span>Shaloom</span>
				</Link>
				<nav className="header-nav" aria-label="Main navigation">
					<a href="#for-everyone">Made for many kinds of stories</a>
					<Link className="header-enter" to="/gallery">Enter the gallery <span aria-hidden="true">↗</span></Link>
				</nav>
			</header>

			<section className="hero-section">
				<div className="hero-copy">
					<p className="eyebrow"><span /> A GALLERY YOU CAN WALK THROUGH</p>
					<h1>Give your world<br /><em>a room to live in.</em></h1>
					<p className="hero-description">A walk-through gallery for the pictures, panels, paintings, and everyday scenes you want people to linger with.</p>
					<div className="hero-actions">
						<Link className="button button-primary" to="/gallery">Step inside the demo <span aria-hidden="true">↗</span></Link>
						<a className="text-link" href="#for-everyone">See who it’s for <span aria-hidden="true">↓</span></a>
					</div>
					<p className="hero-note">Your work, your order. No surprise reshuffling.</p>
				</div>
				<Link className="preview-link" to="/gallery" aria-label="Expand the preview and walk through all gallery scenes">
					<GalleryPreview />
					<span className="preview-expand" aria-hidden="true">⛶ Expand gallery</span>
				</Link>
			</section>

			<section className="audience-section" id="for-everyone">
				<div className="section-heading">
					<p className="eyebrow">ONE ROOM, MANY STORIES</p>
					<h2>Make a place for what matters to you.</h2>
				</div>
				<div className="audience-grid">
					<article><span className="audience-number">01</span><h3>Comics & illustrators</h3><p>Lay out pages, character art, and visual chapters as an exhibition people can walk through.</p></article>
					<article><span className="audience-number">02</span><h3>Painters & makers</h3><p>Give each piece breathing room, keep your chosen sequence, and let the work set the pace.</p></article>
					<article><span className="audience-number">03</span><h3>Families & sharers</h3><p>Turn a trip, celebration, or ordinary season into a small world you can invite someone into.</p></article>
				</div>
			</section>

			<section className="closing-section">
				<div><p className="eyebrow">SHALOOM · LIVE OUT YOUR MOTTO</p><h2>Come in. Take your time.</h2></div>
				<Link className="button button-light" to="/gallery">Walk the sample gallery <span aria-hidden="true">↗</span></Link>
			</section>

			<footer className="site-footer">
				<span>Shaloom</span>
				<p>This is a no-login demo using the supplied sample media. Personal uploads and accounts are not part of this build yet.</p>
			</footer>
		</main>
	);
}
