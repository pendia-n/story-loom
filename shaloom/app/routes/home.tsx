import { useEffect, useState } from "react";
import { Link } from "react-router";
import "../promotion.css";

export function meta() {
	return [
		{ title: "Shaloom — Your own walkable exhibition" },
		{ name: "description", content: "Some pictures deserve a place. Turn your artwork, photographs, and visual stories into a 3D gallery people can walk through." },
		{ property: "og:title", content: "Some pictures deserve a place. · Shaloom" },
		{ property: "og:description", content: "Create a walkable exhibition from your images. Give them your words, then invite someone to take a closer look." },
		{ property: "og:type", content: "website" },
	];
}

const exhibitionIdeas = [
	{ kind: "ART & ILLUSTRATION", title: "The series you finally finished.", text: "Bring your paintings, studies, and sketches together. Let visitors see the work and read what went into it.", detail: "An exhibition of your latest work", accent: "art" },
	{ kind: "LIFE & PHOTOGRAPHS", title: "That trip, in your own words.", text: "The little café. The missed train. The view you stayed for. Give the pictures the stories only you can tell.", detail: "A chapter to revisit together", accent: "life" },
	{ kind: "COMICS & CHARACTERS", title: "The world behind your pages.", text: "Invite readers to explore character sketches, selected panels, and the ideas behind your comic. Planned page ordering is available on paid plans.", detail: "A companion exhibition for your comic", accent: "comic" },
];

const questions = [
	{ question: "What happens after I upload?", answer: "You can add or edit a description for each image, remove media, and return to your chapter to manage it. Paid plans also let you drag media into a chosen order. Open the finished gallery to walk through the collection, or send its link to someone you want to invite." },
	{ question: "Can someone visit without an account?", answer: "The sample exhibition is open without an account. To visit a member’s public or private chapter, visitors need to sign in to Shaloom. Private chapters also require the creator’s 8-character access code, unless you own the chapter." },
	{ question: "Can I choose the order of my images?", answer: "Free chapters use randomized display. Standard and Zealous include planned ordering with drag-and-drop, useful for a series or selected comic pages." },
	{ question: "What can I upload?", answer: "Free includes one public chapter with up to 8 PNG or JPG images, at up to 5 MB each. Standard and Zealous also support GIF and MP4, with larger file sizes and chapter allowances. Compare plans for the full limits." },
	{ question: "Who can see my chapter?", answer: "Free chapters are public to signed-in members and appear in Spark. Standard and Zealous let you make a chapter private and share an access code. Image metadata is cleansed on upload; video metadata is not cleansed." },
	{ question: "What happens if my paid plan ends?", answer: "Existing chapters and media remain, but Free limits apply to new uploads and chapters. Under the current policy, all your chapters become public to signed-in members and private access codes are removed. Check your collection before ending a paid plan." },
	{ question: "Can I cancel or request a refund?", answer: "You can manage your membership from Billing. A subscription charge can be refunded within 72 hours; after that, cancellation stops renewal and access continues through the paid period. One-time chapter and media add-ons are non-refundable." },
];

export default function Home() {
	const [viewer, setViewer] = useState<{ username: string } | null | undefined>(undefined);
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal })
			.then((response) => response.json() as Promise<{ user?: { username: string } | null }>)
			.then((result) => { if (!controller.signal.aborted) setViewer(result.user ?? null); })
			.catch(() => { if (!controller.signal.aborted) setViewer(null); });
		return () => controller.abort();
	}, []);
	const createPath = viewer ? "/gallery" : "/signup";

	return <main className="home-page promo-page">
		<a className="promo-skip" href="#main-content">Skip to content</a>
		<header className="site-header promo-header">
			<Link className="brand" to="/" aria-label="Shaloom home"><img src="/shaloom.svg" alt="" /><span>Shaloom</span></Link>
			<nav className="header-nav" aria-label="Main navigation">
				<a href="#exhibitions">Ideas</a><a href="#how-it-works">How it works</a><Link to="/pricing">Pricing</Link><a href="#about">About</a>
				{viewer ? <Link className="header-enter" to="/gallery">My gallery ↗</Link> : viewer === null ? <Link className="header-enter" to="/login">Sign in ↗</Link> : null}
			</nav>
		</header>

		<section className="promo-hero" id="main-content" aria-labelledby="hero-title">
			<div className="promo-hero-copy">
				<p className="eyebrow">YOUR OWN WALKABLE EXHIBITION</p>
				<h1 id="hero-title">Some pictures<br />deserve <em>a place.</em></h1>
				<p className="promo-lead">Turn your artwork, photographs, and visual stories into a 3D gallery people can walk through. Give them your words, then invite someone to take a closer look.</p>
				<div className="promo-actions"><Link className="button button-primary" to="/demo">Walk the sample exhibition <span aria-hidden="true">↗</span></Link><Link className="text-link" to={createPath}>{viewer ? "Open your gallery" : "Create your first gallery"} <span aria-hidden="true">↗</span></Link></div>
				<p className="promo-small">Try the sample without signing in. Start creating with a free account.</p>
			</div>
			<figure className="promo-invitation">
				<Link className="promo-gallery-image" to="/demo" aria-label="Enter the sample exhibition shown in this gallery screenshot"><img src="/gallery-preview.png" alt="Inside Shaloom’s sample exhibition, with framed images displayed along the gallery walls" width="1440" height="1000" fetchPriority="high" /><span className="promo-enter">Step inside <span aria-hidden="true">↗</span></span></Link>
				<figcaption><span><span className="promo-label">AN INVITATION</span><strong>Come inside.<br />I have something to show you.</strong></span><span className="promo-stamp">A real view of<br />the sample gallery</span></figcaption>
			</figure>
		</section>

		<section className="promo-ideas promo-section" id="exhibitions" aria-labelledby="ideas-title">
			<div className="promo-section-head"><div><p className="eyebrow">WHAT WOULD YOU EXHIBIT?</p><h2 id="ideas-title">Your images.<br /><em>Your reason to invite someone.</em></h2></div><p>A finished collection can be a way to share your work, revisit a chapter, or show someone what they missed. Here are a few places to begin.</p></div>
			<div className="promo-idea-grid">{exhibitionIdeas.map((idea) => <article className={`promo-idea promo-idea-${idea.accent}`} key={idea.accent}><p className="promo-label">{idea.kind}</p><h3>{idea.title}</h3><p>{idea.text}</p><footer>{idea.detail}</footer></article>)}</div>
			<p className="promo-small">These are ideas for your own collection. <Link to="/demo">Explore the working sample exhibition ↗</Link></p>
		</section>

		<section className="promo-process promo-section" id="how-it-works" aria-labelledby="process-title">
			<div className="promo-section-head"><div><p className="eyebrow">FROM A COLLECTION TO A VISIT</p><h2 id="process-title">You make the exhibition.<br /><em>Someone steps inside.</em></h2></div><p>Uploading is the beginning. The finished room gives the collection a setting and a reason to share it.</p></div>
			<div className="promo-role-grid"><article><p className="promo-label">MAKING IT</p><h3>Put your collection together.</h3><ol><li><strong>Choose what belongs together.</strong><span>Create a chapter and upload your images.</span></li><li><strong>Add the story behind each one.</strong><span>Write descriptions, remove images, and refine the collection. Paid plans include drag-and-drop ordering.</span></li><li><strong>Take a walk through it.</strong><span>Preview the exhibition, then copy its page link to invite someone.</span></li></ol><Link className="text-link" to={createPath}>Start with your first chapter ↗</Link></article><article><p className="promo-label">VISITING IT</p><h3>Give the pictures a little time.</h3><ol><li><strong>Step into the collection.</strong><span>Open the link and sign in to visit a member’s gallery.</span></li><li><strong>Take a closer look.</strong><span>Move through the room, approach an image, and read its description.</span></li><li><strong>Follow your curiosity.</strong><span>Stay with a detail or return to an image. Explore at your own pace.</span></li></ol><Link className="text-link" to="/demo">Try the visitor experience ↗</Link></article></div>
		</section>

		<section className="promo-belief promo-section" id="about" aria-labelledby="belief-title"><p className="eyebrow">WHY SHALOOM EXISTS</p><h2 id="belief-title">Give what matters<br /><em>a place to be seen.</em></h2><div><p>People put something of themselves into their pictures: the hours behind a painting, the characters in a sketchbook, the people and places in a photograph.</p><p>Shaloom gives those collections a setting, room to linger, and their creator’s own words. A small exhibition you can return to, or invite someone into.</p><p className="promo-belief-question">Who would you invite into yours?</p></div></section>

		<section className="promo-membership promo-section" aria-labelledby="membership-title"><div className="promo-section-head"><div><p className="eyebrow">A PLACE TO BEGIN. ROOM TO GROW.</p><h2 id="membership-title">Start with eight pictures.</h2></div><p>Try one public chapter for free. Paid plans give you more chapters, more media, and control over their order.</p></div><div className="promo-plan-grid"><article><p className="promo-label">FREE</p><h3>Your first exhibition.</h3><p className="promo-price">$0</p><p>1 public chapter · 8 images<br />PNG/JPG · 5 MB per image<br />Randomized display</p><Link className="text-link" to={createPath}>{viewer ? "Open your chapters" : "Start free"} ↗</Link></article><article><p className="promo-label">STANDARD</p><h3>A growing collection.</h3><p className="promo-price">$18 <span>/ month</span></p><p>8 chapters · 50 images + 2 MP4s each<br />Up to 10 MB per file<br />Planned ordering and private chapters</p><Link className="text-link" to="/pricing">See Standard details ↗</Link></article><article><p className="promo-label">ZEALOUS</p><h3>Space for more stories.</h3><p className="promo-price">$36 <span>/ month</span></p><p>40 chapters · 100 images + 7 MP4s each<br />Up to 20 MB per file<br />Planned ordering and private chapters</p><Link className="text-link" to="/pricing">See Zealous details ↗</Link></article></div><p className="promo-plan-note">Member galleries require sign-in to visit. If a paid plan ends, existing chapters become public to signed-in members and private access codes are removed. <a href="#practical-details">Read the practical details ↓</a></p></section>

		<section className="promo-faq promo-section" id="practical-details" aria-labelledby="faq-title"><div><p className="eyebrow">BEFORE YOU BEGIN</p><h2 id="faq-title">A few practical<br /><em>details.</em></h2><Link className="text-link" to="/pricing">Compare all plan limits ↗</Link></div><div className="promo-questions">{questions.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section>
		<section className="promo-updates promo-section" id="announcements"><p className="promo-label">PRODUCT UPDATES</p><p>The sample exhibition is open. You can create a free chapter and explore public chapters in Spark after signing in.</p><Link className="text-link" to="/spark">Explore Spark ↗</Link></section>
		<section className="promo-closing"><p className="eyebrow">AN EXHIBITION ONLY YOU COULD MAKE</p><h2>What would you put<br />in your first room?</h2><Link className="button button-light" to={createPath}>{viewer ? "Open your gallery" : "Create your first gallery"} <span aria-hidden="true">↗</span></Link><p>One public chapter is free. Choose a collection you’re comfortable sharing.</p></section>
		<footer className="site-footer promo-footer"><Link className="brand" to="/">Shaloom</Link><p>A place for the images you want someone to spend time with.</p><nav aria-label="Footer navigation"><a href="#about">About</a><a href="#announcements">Updates</a><Link to="/pricing">Pricing</Link><a href="#practical-details">Questions</a></nav></footer>
	</main>;
}
