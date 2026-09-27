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
	const [viewer, setViewer] = useState<{ username: string } | null | undefined>(undefined);
	useEffect(() => {
		let active = true;
		fetch("/api/auth/me", { credentials: "same-origin" })
			.then((response) => response.json() as Promise<{ user?: { username: string } | null }>)
			.then((result) => { if (active) setViewer(result.user ?? null); })
			.catch(() => { if (active) setViewer(null); });
		return () => { active = false; };
	}, []);
	return (
		<main className="home-page">
			<header className="site-header">
				<Link className="brand" to="/" aria-label="Shaloom home">
					<img src="/shaloom.svg" alt="" />
					<span>Shaloom</span>
				</Link>
				<nav className="header-nav" aria-label="Main navigation">
					<a href="#about">About</a>
					<a href="#announcements">Announcements</a>
					<Link to="/pricing">Pricing</Link>
					<Link className="header-enter header-demo" to="/demo">View the demo <span aria-hidden="true">↗</span></Link>
					{viewer ? <Link className="header-enter" to="/gallery">My gallery</Link> : viewer === null ? <Link className="header-enter" to="/login">Sign in</Link> : null}
				</nav>
			</header>

			<section className="hero-section">
				<div className="hero-copy">
					<p className="eyebrow"><span /> A GALLERY YOU CAN WALK THROUGH</p>
					<h1>Give your world<br /><em>a room to live in.</em></h1>
					<p className="hero-description">A walk-through gallery for the pictures, panels, paintings, and everyday scenes you want people to linger with.</p>
					<div className="hero-actions">
						<Link className="button button-primary" to="/demo">Step inside the demo <span aria-hidden="true">↗</span></Link>
						{viewer ? <Link className="text-link" to="/gallery">Open your gallery <span aria-hidden="true">↗</span></Link> : viewer === null ? <Link className="text-link" to="/signup">Create your gallery <span aria-hidden="true">↗</span></Link> : null}
						<a className="text-link" href="#for-everyone">See who it’s for <span aria-hidden="true">↓</span></a>
					</div>
					<p className="hero-note">Your work, your order. No surprise reshuffling.</p>
				</div>
				<Link className="preview-link" to="/demo" aria-label="Expand the preview and walk through all gallery scenes">
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

			<section className="home-info-section" id="about">
				<p className="eyebrow">ABOUT SHALOOM</p>
				<h2>Pictures deserve a place, not just a feed.</h2>
				<p>Shaloom lets you arrange images into chapters and invite people to walk through them as a gallery. It’s for art, comics, and the moments you want to share.</p>
			</section>

			<section className="home-info-section home-announcements" id="announcements">
				<p className="eyebrow">ANNOUNCEMENTS</p>
				<h2>The gallery is open.</h2>
				<p>Explore the demo, create a free account, and begin your first chapter. We’ll share product updates here as they’re ready.</p>
			</section>

			<section className="closing-section">
				<div><p className="eyebrow">SHALOOM · LIVE OUT YOUR MOTTO</p><h2>Come in. Take your time.</h2></div>
				<Link className="button button-light" to="/demo">Walk the sample gallery <span aria-hidden="true">↗</span></Link>
			</section>

			<footer className="site-footer">
				<span>Shaloom</span>
				<p>A walkable memory gallery for people who want their pictures to feel like a place.</p>
			</footer>
		</main>
	);
}
