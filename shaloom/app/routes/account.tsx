import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

type User = { id: string; username: string; plan: "free" | "standard" | "zealous"; recoveryEnabled: boolean; subscriptionStatus: string | null };
type Chapter = { id: string; title: string; is_private: number; media_count: number; created_at: number };
type Media = { id: string; name: string; type: string; size: number; description: string; sortOrder: number; url: string };
type PendingUpload = { id: string; file: File; description: string };
type ChapterDetail = { chapter: { id: string; title: string; isPrivate: boolean; owner: boolean }; media: Media[]; limits: { images: number; videos: number; maxBytes: number; plan: string } };
type ApiReply = { error?: string; user?: User; chapters?: Chapter[]; chapter?: ChapterDetail["chapter"]; media?: Media[]; limits?: ChapterDetail["limits"]; capacity?: number; recoveryEnabled?: boolean; message?: string; url?: string; ok?: boolean; refund?: boolean; cancelAtPeriodEnd?: boolean };

function cookie(name: string): string {
	return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

async function getCsrf(): Promise<string> {
	let token = cookie("sl_csrf");
	if (!token) {
		await fetch("/api/auth/csrf", { credentials: "same-origin" });
		token = cookie("sl_csrf");
	}
	return decodeURIComponent(token);
}

async function api<T extends ApiReply = ApiReply>(path: string, init: RequestInit = {}): Promise<T> {
	const method = (init.method ?? "GET").toUpperCase();
	const headers = new Headers(init.headers);
	if (method !== "GET" && method !== "HEAD") headers.set("x-csrf-token", await getCsrf());
	if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
	const response = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
	const data = await response.json().catch(() => ({})) as T;
	if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
	return data;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return <label className="account-field"><span>{label}</span>{children}</label>;
}

function AccountLayout({ children, user }: { children: React.ReactNode; user: User | null }) {
	async function signOut() {
		try {
			await api("/api/auth/logout", { method: "POST" });
			window.location.assign("/");
		} catch { window.alert("Could not sign out. Please try again."); }
	}
	return <main className="account-page">
		<header className="account-header"><Link className="brand" to="/"><img src="/shaloom.svg" alt="" /><span>Shaloom</span></Link>
			<nav><Link to="/gallery">My gallery</Link><Link to="/spark">Spark</Link><Link to="/pricing">Plans</Link>{user && <><Link to="/profile">Profile</Link><Link to="/billing">Billing</Link><button type="button" onClick={() => void signOut()}>Sign out</button></>}</nav>
			<span className="account-identity">{user ? `${user.username} · ${user.plan}` : "Your stories, in their own room"}</span>
		</header><div className="account-content">{children}</div>
		<footer className="account-footer"><Link to="/demo">Walk the demo</Link><span>Shaloom · a place for your scenes</span></footer>
	</main>;
}

export default function Account() {
	const location = useLocation();
	const navigate = useNavigate();
	const { chapterId } = useParams();
	const path = location.pathname;
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [chapters, setChapters] = useState<Chapter[]>([]);
	const [capacity, setCapacity] = useState(1);
	const [recoveryStep, setRecoveryStep] = useState<"username" | "passcode" | "new-password">("username");
	const [recoveryUsername, setRecoveryUsername] = useState("");
	const [recoveryPasscode, setRecoveryPasscode] = useState("");
	const [recoveryPassword, setRecoveryPassword] = useState("");
	const [recoveryBusy, setRecoveryBusy] = useState(false);
	const [signupUsername, setSignupUsername] = useState("");
	const [signupPassword, setSignupPassword] = useState("");
	const [usernameStatus, setUsernameStatus] = useState<"idle" | "invalid" | "checking" | "available" | "taken" | "unavailable">("idle");

	const refreshUser = useCallback(async () => {
		try { const result = await api("/api/auth/me"); setUser(result.user ?? null); }
		catch { setUser(null); }
		finally { setLoading(false); }
	}, []);

	useEffect(() => { void refreshUser(); }, [refreshUser]);
	useEffect(() => {
		if (!loading && ["/gallery", "/profile", "/security", "/billing", "/spark"].includes(path) && !user) navigate("/login", { replace: true });
	}, [loading, path, user, navigate]);
	useEffect(() => {
		if (!loading && user && ["/signup", "/login", "/recover"].includes(path)) navigate("/gallery", { replace: true });
	}, [loading, path, user, navigate]);
	useEffect(() => {
		if (!user || path !== "/gallery") return;
		api("/api/chapters").then((data) => { setChapters(data.chapters ?? []); setCapacity(data.capacity ?? 1); }).catch((reason: Error) => setError(reason.message));
	}, [user, path]);
	useEffect(() => {
		if (path !== "/signup") return;
		if (!/^[A-Za-z0-9._-]{3,24}$/.test(signupUsername)) {
			setUsernameStatus(signupUsername ? "invalid" : "idle");
			return;
		}
		setUsernameStatus("checking");
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			fetch(`/api/auth/username-available?username=${encodeURIComponent(signupUsername)}`, { signal: controller.signal })
				.then((response) => response.json() as Promise<{ available?: boolean; valid?: boolean }>)
				.then((result) => setUsernameStatus(result.valid ? result.available ? "available" : "taken" : "invalid"))
				.catch(() => { if (!controller.signal.aborted) setUsernameStatus("unavailable"); });
		}, 300);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [path, signupUsername]);

	const title = useMemo(() => ({ "/signup": "Make your gallery", "/login": "Welcome back", "/recover": "Recover your account", "/gallery": "Your chapters", "/profile": "Profile & recovery", "/security": "Password security", "/pricing": "Choose your room", "/billing": "Your membership", "/spark": "Spark · public chapters", "/chapter": "Chapter settings" }[path] ?? "Your Shaloom"), [path]);

	async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault(); setError(""); setNotice("");
		const data = new FormData(event.currentTarget);
		const payload: Record<string, string> = {};
		for (const key of ["username", "password", "recoveryPasscode"]) {
			const value = data.get(key);
			if (typeof value === "string" && value) payload[key] = value;
		}
		const endpoint = path === "/signup" ? "/api/auth/register" : "/api/auth/login";
		try {
			const result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
			setUser(result.user ?? null);
			navigate("/gallery");
		} catch (reason) { setError(reason instanceof Error ? reason.message : "Could not continue."); }
	}

	async function verifyRecoveryPasscode(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault(); setError(""); setNotice(""); setRecoveryBusy(true);
		try {
			await api("/api/auth/recover/verify", { method: "POST", body: JSON.stringify({ username: recoveryUsername, passcode: recoveryPasscode }) });
			setRecoveryPasscode(""); setRecoveryStep("new-password");
		} catch (reason) { setError(reason instanceof Error ? reason.message : "Recovery could not be verified."); }
		finally { setRecoveryBusy(false); }
	}

	async function finishRecovery(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault(); setError(""); setNotice(""); setRecoveryBusy(true);
		try {
			const result = await api("/api/auth/recover/complete", { method: "POST", body: JSON.stringify({ newPassword: recoveryPassword }) });
			setNotice(result.message ?? "Password changed. Sign in with the new password.");
			setRecoveryPassword(""); setRecoveryStep("username"); navigate("/login");
		} catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reset the password."); }
		finally { setRecoveryBusy(false); }
	}

	async function logout() {
		try { await api("/api/auth/logout", { method: "POST" }); } catch {}
		setUser(null); navigate("/");
	}

	if (loading) return <AccountLayout user={user}><p className="account-status">Opening your gallery…</p></AccountLayout>;
	if (user && ["/signup", "/login", "/recover"].includes(path)) return <AccountLayout user={user}><p className="account-status">Opening your gallery…</p></AccountLayout>;
	if (path.startsWith("/chapter/") && chapterId) return <ChapterEditor chapterId={chapterId} user={user} />;

	return <AccountLayout user={user}>
		{error && <p className="account-alert" role="alert">{error}</p>}{notice && <p className="account-notice" role="status">{notice}</p>}
		{path === "/recover" && <section className="account-card account-narrow">
			<p className="eyebrow">ACCOUNT RECOVERY · STEP {recoveryStep === "username" ? "1" : recoveryStep === "passcode" ? "2" : "3"} OF 3</p><h1>{title}</h1>
			<p className="account-copy">Use the username and recovery passcode you set up. There is no email recovery. If you never set a passcode or no longer remember your username, this account cannot be recovered.</p>
			{recoveryStep === "username" && <form className="account-form" onSubmit={(event) => { event.preventDefault(); setError(""); setRecoveryStep("passcode"); }}><Field label="Username"><input value={recoveryUsername} onChange={(event) => setRecoveryUsername(event.target.value)} required minLength={3} maxLength={24} autoComplete="username" /></Field><button className="button button-primary" type="submit">Continue</button></form>}
			{recoveryStep === "passcode" && <form className="account-form" onSubmit={(event) => void verifyRecoveryPasscode(event)}><p className="account-footnote">Account name: <strong>{recoveryUsername}</strong></p><Field label="Recovery passcode"><input value={recoveryPasscode} onChange={(event) => setRecoveryPasscode(event.target.value)} type="password" required autoComplete="off" /></Field><button className="button button-primary" type="submit" disabled={recoveryBusy}>{recoveryBusy ? "Checking…" : "Verify passcode"}</button><button className="button button-outline" type="button" onClick={() => { setRecoveryStep("username"); setRecoveryPasscode(""); setError(""); }}>Use a different username</button></form>}
			{recoveryStep === "new-password" && <form className="account-form" onSubmit={(event) => void finishRecovery(event)}><p className="account-footnote">Passcode verified for <strong>{recoveryUsername}</strong>. This recovery step expires after 10 minutes.</p><Field label="New password"><input value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></Field><p className="account-footnote">Use 12–128 characters. You can reset the password once per 24 hours.</p><button className="button button-primary" type="submit" disabled={recoveryBusy || recoveryPassword.length < 12}>{recoveryBusy ? "Saving…" : "Set new password"}</button></form>}
			<div className="account-switch"><Link to="/login">Back to sign in</Link><Link to="/signup">Create an account</Link></div>
		</section>}
		{["/signup", "/login"].includes(path) && <section className="account-card account-narrow">
			<p className="eyebrow">{path === "/signup" ? "A ROOM OF YOUR OWN" : "STEP BACK INSIDE"}</p><h1>{title}</h1>
			<form className="account-form" onSubmit={submitAuth}>
				{path === "/signup" ? <><Field label="Username"><input name="username" value={signupUsername} onChange={(event) => setSignupUsername(event.target.value)} required minLength={3} maxLength={24} autoComplete="username" /></Field><p className={`account-footnote username-status username-status-${usernameStatus}`} role="status">{usernameStatus === "idle" ? "Choose a unique 3–24 character username." : usernameStatus === "invalid" ? "Use 3–24 letters, numbers, periods, underscores, or hyphens." : usernameStatus === "checking" ? "Checking username…" : usernameStatus === "available" ? "Username available." : usernameStatus === "taken" ? "That username is already in use." : "Could not check right now; the server will still verify it when you sign up."}</p></> : <Field label="Username"><input name="username" required minLength={3} maxLength={24} autoComplete="username" /></Field>}
				<Field label="Password"><input name="password" type="password" value={path === "/signup" ? signupPassword : undefined} onChange={path === "/signup" ? (event) => setSignupPassword(event.target.value) : undefined} required minLength={path === "/signup" ? 12 : undefined} maxLength={path === "/signup" ? 128 : undefined} autoComplete={path === "/signup" ? "new-password" : "current-password"} /></Field>
				{path === "/signup" && <p className="account-footnote" role="status">{signupPassword.length < 12 ? `${Math.max(0, 12 - signupPassword.length)} more characters needed (12 minimum).` : signupPassword.length > 128 ? "Keep it within 128 characters." : "Password length looks good."}</p>}
				{path === "/signup" && <Field label="Recovery passcode (optional, but needed if you forget your password)"><input name="recoveryPasscode" type="password" minLength={8} maxLength={128} autoComplete="off" /></Field>}
				<button className="button button-primary" type="submit">{path === "/signup" ? "Create account" : "Sign in"}</button>
			</form>
			<div className="account-switch">{path !== "/login" && <Link to="/login">Already have an account? Sign in</Link>}{path !== "/signup" && <Link to="/signup">Create an account</Link>}{path !== "/signup" && <Link to="/recover">Forgot password?</Link>}</div>
		</section>}

		{path === "/gallery" && user && <section>
			<div className="account-heading"><div><p className="eyebrow">YOUR COLLECTION, YOUR ORDER</p><h1>{title}</h1><p className="account-copy">{chapters.length} of {capacity} chapter spaces used. Open a chapter to arrange its media, then step inside to walk through it.</p></div>{chapters.length >= capacity ? <Link className="button button-primary" to="/pricing">{user.plan === "free" ? "Upgrade for more chapters" : "Get more chapter spaces"}</Link> : <button className="button button-primary" onClick={async () => { const name = window.prompt("Name this chapter"); if (!name?.trim()) return; try { await api("/api/chapters", { method: "POST", body: JSON.stringify({ title: name }) }); const refreshed = await api("/api/chapters"); setChapters(refreshed.chapters ?? []); setCapacity(refreshed.capacity ?? capacity); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the chapter."); } }}>＋ New chapter</button>}</div>
			{chapters.length === 0 ? <div className="account-empty"><h2>Your first chapter is waiting.</h2><p>Give a collection a name—then add the images, GIFs, and short videos you want to keep together.</p><button className="button button-primary" onClick={async () => { const name = window.prompt("Name your first chapter"); if (!name?.trim()) return; try { await api("/api/chapters", { method: "POST", body: JSON.stringify({ title: name }) }); const refreshed = await api("/api/chapters"); setChapters(refreshed.chapters ?? []); setCapacity(refreshed.capacity ?? 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the chapter."); } }}>Create a chapter</button></div> : <div className="chapter-grid">{chapters.map((chapter) => <article className="chapter-card" key={chapter.id}><span className="chapter-count">{String(chapter.media_count).padStart(2, "0")} SCENES · {chapter.is_private ? "PRIVATE" : "PUBLIC"}</span><h2>{chapter.title}</h2><p>Created {new Date(chapter.created_at).toLocaleDateString()}</p><div className="chapter-actions"><Link className="button button-primary" to={`/gallery/${chapter.id}`}>Walk inside ↗</Link><Link className="button button-outline" to={`/chapter/${chapter.id}`}>Edit chapter</Link></div></article>)}</div>}
			<div className="account-bottom-links"><Link to="/spark">Explore public chapters</Link><Link to="/pricing">Compare plans</Link><button onClick={() => void logout()}>Sign out</button></div>
		</section>}

		{path === "/profile" && user && <SettingsPanel user={user} mode="profile" onUserChanged={setUser} onNotice={setNotice} onError={setError} />}
		{path === "/security" && user && <SettingsPanel user={user} mode="security" onUserChanged={setUser} onNotice={setNotice} onError={setError} />}
		{path === "/pricing" && <PricingPanel user={user} onError={setError} onNotice={setNotice} />}
		{path === "/billing" && user && <BillingPanel user={user} onError={setError} onNotice={setNotice} />}
		{path === "/spark" && user && <SparkPanel />}
	</AccountLayout>;
}

function SettingsPanel({ user, mode, onUserChanged, onNotice, onError }: { user: User; mode: "profile" | "security"; onUserChanged: (value: User) => void; onNotice: (value: string) => void; onError: (value: string) => void }) {
	const [passcode, setPasscode] = useState(""); const [newPassword, setNewPassword] = useState("");
	const [username, setUsername] = useState(user.username);
	const [usernameStatus, setUsernameStatus] = useState<"same" | "invalid" | "checking" | "available" | "taken" | "unavailable">("same");
	useEffect(() => {
		if (mode !== "profile") return;
		if (username.trim() === user.username) { setUsernameStatus("same"); return; }
		if (!/^[A-Za-z0-9._-]{3,24}$/.test(username.trim())) { setUsernameStatus("invalid"); return; }
		setUsernameStatus("checking");
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			fetch(`/api/auth/username-available?username=${encodeURIComponent(username.trim())}`, { credentials: "same-origin", signal: controller.signal })
				.then((response) => response.json() as Promise<{ available?: boolean; valid?: boolean }>)
				.then((result) => setUsernameStatus(result.valid ? result.available ? "available" : "taken" : "invalid"))
				.catch(() => { if (!controller.signal.aborted) setUsernameStatus("unavailable"); });
		}, 300);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [mode, username, user.username]);
	return <section className="account-card account-narrow"><p className="eyebrow">{mode === "profile" ? "RECOVERY THAT STAYS WITH YOU" : "ACCOUNT ACCESS"}</p><h1>{mode === "profile" ? "Profile & recovery" : "Change your password"}</h1>
		{mode === "profile" ? <><p className="account-copy">Signed in as <strong>{user.username}</strong>. {user.recoveryEnabled ? "A recovery passcode is set." : "Set a recovery passcode now so you can reset your password while logged out."}</p><form className="account-form" onSubmit={async (event) => { event.preventDefault(); onError(""); onNotice(""); try { const result = await api("/api/auth/username", { method: "PUT", body: JSON.stringify({ username: username.trim() }) }); if (result.user) onUserChanged(result.user); onNotice("Username updated."); } catch (error) { onError(error instanceof Error ? error.message : "Could not change username."); } }}><Field label="Change username"><input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} required autoComplete="username" /></Field><p className="account-footnote" role="status">{usernameStatus === "same" ? "Your current username." : usernameStatus === "checking" ? "Checking username…" : usernameStatus === "available" ? "Username available." : usernameStatus === "taken" ? "That username is already in use." : usernameStatus === "invalid" ? "Use 3–24 letters, numbers, periods, underscores, or hyphens." : "Availability could not be checked; the server will verify when you save."}</p><button className="button button-outline" disabled={usernameStatus === "same" || usernameStatus === "invalid" || usernameStatus === "taken" || usernameStatus === "checking"}>Save username</button></form><form className="account-form" onSubmit={async (event) => { event.preventDefault(); onError(""); try { await api("/api/auth/recovery-passcode", { method: "PUT", body: JSON.stringify({ passcode }) }); onNotice("Recovery passcode saved."); setPasscode(""); } catch (error) { onError(error instanceof Error ? error.message : "Could not save recovery passcode."); } }}><Field label="New recovery passcode"><input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} minLength={8} maxLength={128} required /></Field><button className="button button-primary">Save passcode</button></form></> : <><p className="account-copy">Choose a new password (12–128 characters). You can change it here without entering the old password. Password changes are limited to once per 24 hours.</p><form className="account-form" onSubmit={async (event) => { event.preventDefault(); onError(""); try { const result = await api("/api/auth/password", { method: "PUT", body: JSON.stringify({ newPassword }) }); onNotice(result.message ?? "Password updated. Sign in again."); setNewPassword(""); } catch (error) { onError(error instanceof Error ? error.message : "Could not update password."); } }}><Field label="New password"><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} required /></Field><button className="button button-primary">Change password</button></form></>}
	</section>;
}

function PricingPanel({ user, onError, onNotice }: { user: User | null; onError: (value: string) => void; onNotice: (value: string) => void }) {
	const [chapters, setChapters] = useState<Chapter[]>([]);
	const [chapterId, setChapterId] = useState("");
	useEffect(() => { if (user) api("/api/chapters").then((data) => setChapters(data.chapters ?? [])).catch(() => undefined); }, [user]);
	async function checkout(kind: "subscription" | "chapter_slots" | "media_addon", tier: "standard" | "zealous", selectedChapter?: string) {
		if (!user) { window.location.href = "/signup"; return; }
		try { const result = await api("/api/billing/checkout", { method: "POST", body: JSON.stringify({ kind, tier, ...(selectedChapter ? { chapterId: selectedChapter } : {}) }) }); if (result.url) window.location.href = result.url; }
		catch (error) { onError(error instanceof Error ? error.message : "Could not open checkout."); }
	}
	async function downgrade() {
		if (!window.confirm("Keep Zealous until this paid period ends, then use Standard free for one month? No price difference is refunded.")) return;
		onError(""); onNotice("");
		try { const result = await api("/api/billing/downgrade", { method: "POST" }); onNotice(result.message ?? "Downgrade scheduled."); }
		catch (error) { onError(error instanceof Error ? error.message : "Could not schedule the downgrade."); }
	}
	return <section><div className="account-heading"><div><p className="eyebrow">A ROOM THAT GROWS WITH YOU</p><h1>Plans for keeping more.</h1><p className="account-copy">A subscription pays for room to keep and revisit your work—not a toll on each ordinary action.</p></div></div><div className="plan-grid">
		<article className="plan-card"><p className="eyebrow">FREE</p><h2>$0</h2><p>One public chapter · up to 8 images · PNG/JPG · 5 MB each · randomized display.</p><ul><li>Walk the full-screen gallery</li><li>Image metadata is cleansed on upload</li><li>No MP4 uploads or private chapters</li></ul><Link className="button button-outline" to={user ? "/gallery" : "/signup"}>{user?.plan === "free" ? "Your current plan" : "Start free"}</Link></article>
		<article className="plan-card plan-featured"><p className="eyebrow">STANDARD</p><h2>$18 <small>/ month</small></h2><p>8 chapters · 50 images + 2 MP4s per chapter · 10 MB each.</p><ul><li>PNG, JPG, GIF, and MP4</li><li>Private chapters with an 8-character code</li><li>Planned ordering with drag-and-drop</li><li>Pay once: $5 for 10 more chapter spaces</li><li>$3 per chapter for +25 images and +3 MP4s</li></ul><button className="button button-primary" disabled={user?.plan === "standard"} onClick={() => user?.plan === "zealous" ? void downgrade() : void checkout("subscription", "standard")}>{user?.plan === "standard" ? "Current plan" : user?.plan === "zealous" ? "Schedule downgrade" : "Choose Standard"}</button></article>
		<article className="plan-card"><p className="eyebrow">ZEALOUS</p><h2>$36 <small>/ month</small></h2><p>40 chapters · 100 images + 7 MP4s per chapter · 20 MB each.</p><ul><li>PNG, JPG, GIF, and MP4</li><li>Private chapters with an 8-character code</li><li>Planned ordering with drag-and-drop</li><li>Pay once: $5 for 20 more chapter spaces</li><li>$3 per chapter for +75 images and +5 MP4s</li></ul><button className="button button-primary" disabled={user?.plan === "zealous"} onClick={() => void checkout("subscription", "zealous")}>{user?.plan === "zealous" ? "Current plan" : user?.plan === "standard" ? "Upgrade to Zealous · $36 now" : "Choose Zealous"}</button></article>
	</div>{user?.plan === "standard" && <p className="account-footnote">Upgrading to Zealous charges the full $36 now. Your Standard payment is not refunded or credited; Standard ends after the new payment succeeds.</p>}{user?.plan === "zealous" && <p className="account-footnote">A downgrade keeps Zealous through its paid period. The following Standard month is free; the difference is not refunded.</p>}{user && user.plan !== "free" && <section className="addons-panel"><p className="eyebrow">ONE-TIME ADD-ONS</p><h2>Extra room for a particular chapter</h2><div className="addon-actions"><button className="button button-outline" onClick={() => void checkout("chapter_slots", user.plan === "zealous" ? "zealous" : "standard")}>＋ {user.plan === "zealous" ? "20 chapter spaces · $5" : "10 chapter spaces · $5"}</button><select aria-label="Choose chapter for media add-on" value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Choose a chapter</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select><button className="button button-outline" disabled={!chapterId} onClick={() => void checkout("media_addon", user.plan === "zealous" ? "zealous" : "standard", chapterId)}>＋ {user.plan === "zealous" ? "+75 images and +5 MP4s · $3" : "+25 images and +3 MP4s · $3"}</button></div></section>}<p className="account-footnote">Cancel within 72 hours of a subscription charge to request an immediate cancellation and refund of that charge. After 72 hours, cancellation turns off renewal and access continues through the paid period. One-time add-ons are non-refundable.</p></section>;
}

function BillingPanel({ user, onError, onNotice }: { user: User; onError: (value: string) => void; onNotice: (value: string) => void }) {
	const [busy, setBusy] = useState(false);
	return <section className="account-card account-narrow"><p className="eyebrow">YOUR MEMBERSHIP</p><h1>{user.plan === "free" ? "Free plan" : `${user.plan[0].toUpperCase()}${user.plan.slice(1)} plan`}</h1><p className="account-copy">Subscription status: {user.subscriptionStatus ?? "not subscribed"}. Existing chapters and media remain if you move to Free, but new uploads and private visibility follow Free limits.</p>{user.plan !== "free" && <button className="button button-outline" disabled={busy} onClick={async () => { if (!window.confirm("Cancel auto-renew? If the latest subscription charge was within 72 hours, it will be refunded and your subscription will end now. Otherwise, access continues until the paid period ends.")) return; setBusy(true); onError(""); try { const result = await api("/api/billing/cancel", { method: "POST" }); onNotice(result.message ?? "Cancellation updated."); } catch (error) { onError(error instanceof Error ? error.message : "Could not update billing."); } finally { setBusy(false); } }}>{busy ? "Updating…" : "Cancel membership"}</button>}<p className="account-footnote">Stripe price IDs must be configured by the service owner before checkout can run.</p></section>;
}

function SparkPanel() {
	const [chapters, setChapters] = useState<Array<{ id: string; title: string; username: string; media_count: number }>>([]);
	const [error, setError] = useState("");
	useEffect(() => { api<ApiReply & { chapters?: Array<{ id: string; title: string; username: string; media_count: number }> }>("/api/spark").then((data) => setChapters(data.chapters ?? [])).catch((reason: Error) => setError(reason.message)); }, []);
	return <section><p className="eyebrow">OPEN GALLERIES FROM THE COMMUNITY</p><h1>Spark</h1><p className="account-copy">Public chapters are here to explore. You need to be signed in to enter any gallery.</p>{error && <p className="account-alert">{error}</p>}{chapters.length ? <div className="chapter-grid">{chapters.map((item) => <article className="chapter-card" key={item.id}><span className="chapter-count">BY {item.username} · {item.media_count} SCENES</span><h2>{item.title}</h2><Link className="button button-primary" to={`/gallery/${item.id}`}>Enter gallery ↗</Link></article>)}</div> : !error && <div className="account-empty"><h2>The room is quiet for now.</h2><p>Public chapters will appear here as people open their collections.</p></div>}</section>;
}

function ChapterEditor({ chapterId, user }: { chapterId: string; user: User | null }) {
	const navigate = useNavigate();
	const [detail, setDetail] = useState<ChapterDetail | null>(null);
	const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [title, setTitle] = useState(""); const [isPrivate, setPrivate] = useState(false); const [shareCode, setShareCode] = useState(""); const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]); const [busy, setBusy] = useState(false); const [dragId, setDragId] = useState("");
	const load = useCallback(async () => { try { const result = await api<ChapterDetail & ApiReply>(`/api/chapters/${chapterId}`); setDetail(result); setTitle(result.chapter?.title ?? ""); setPrivate(Boolean(result.chapter?.isPrivate)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open this chapter."); } }, [chapterId]);
	useEffect(() => { void load(); }, [load]);
	const media = detail?.media ?? [];
	const allowed = detail?.limits.plan === "free" ? ".png,.jpg" : ".png,.jpg,.gif,.mp4";
	function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
		const chosen = Array.from(event.currentTarget.files ?? []);
		if (chosen.length) setPendingUploads((current) => [...current, ...chosen.map((file) => ({ id: crypto.randomUUID(), file, description: "" }))]);
		event.currentTarget.value = "";
	}
	async function saveChapter(event: React.FormEvent) { event.preventDefault(); setError(""); setNotice(""); try { await api(`/api/chapters/${chapterId}`, { method: "PUT", body: JSON.stringify({ title, isPrivate, ...(isPrivate ? { shareCode } : {}) }) }); setNotice("Chapter details saved."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save chapter."); } }
	async function upload() {
		if (!pendingUploads.length || !detail) return;
		const selected = [...pendingUploads];
		const imagesNow = media.filter((item) => item.type !== "video/mp4").length;
		const videosNow = media.filter((item) => item.type === "video/mp4").length;
		const isVideo = (file: File) => file.name.toLowerCase().endsWith(".mp4");
		const imageFiles = selected.filter(({ file }) => !isVideo(file));
		const videoFiles = selected.filter(({ file }) => isVideo(file));
		const badType = selected.find(({ file }) => !/\.(png|jpg|gif|mp4)$/i.test(file.name) || (detail.limits.plan === "free" && /\.gif$/i.test(file.name)));
		const tooLarge = selected.find(({ file }) => file.size > detail.limits.maxBytes);
		if (badType) { setError(`${badType.file.name}: this plan accepts ${detail.limits.plan === "free" ? "PNG and JPG" : "PNG, JPG, GIF, and MP4"} only.`); return; }
		if (tooLarge) { setError(`${tooLarge.file.name} is over your ${Math.floor(detail.limits.maxBytes / 1024 / 1024)} MB per-file limit.`); return; }
		if (imagesNow + imageFiles.length > detail.limits.images) { setError(`These uploads exceed this chapter’s ${detail.limits.images}-image limit. Your current plan and add-ons allow ${Math.max(0, detail.limits.images - imagesNow)} more.`); return; }
		if (videosNow + videoFiles.length > detail.limits.videos) { setError(`These uploads exceed this chapter’s ${detail.limits.videos}-video limit. Your current plan and add-ons allow ${Math.max(0, detail.limits.videos - videosNow)} more.`); return; }
		setBusy(true); setError(""); setNotice("");
		let uploaded = 0;
		try {
			for (const item of selected) {
				const form = new FormData(); form.set("file", item.file); form.set("description", item.description);
				await api(`/api/chapters/${chapterId}/media`, { method: "POST", body: form });
				uploaded++;
				setPendingUploads((current) => current.filter((pending) => pending.id !== item.id));
			}
			setNotice("Your media is uploaded. Image metadata is cleansed automatically; MP4 files are kept as uploaded."); await load();
		} catch (reason) { setError(`${reason instanceof Error ? reason.message : "Upload stopped. Check this item and try again."}${uploaded ? ` ${uploaded} file${uploaded === 1 ? " was" : "s were"} uploaded; the remaining selection is still here.` : ""}`); await load(); }
		finally { setBusy(false); }
	}
	async function saveMediaOrder(ids: string[]) {
		setDetail((current) => current ? { ...current, media: ids.map((id) => current.media.find((item) => item.id === id)!).filter(Boolean) } : current);
		setDragId("");
		try { await api(`/api/chapters/${chapterId}/media/order`, { method: "PUT", body: JSON.stringify({ mediaIds: ids }) }); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the new order."); await load(); }
	}
	async function reorder(targetId: string) {
		if (!dragId || dragId === targetId || detail?.limits.plan === "free") return;
		const ids = media.map((item) => item.id);
		const from = ids.indexOf(dragId); const to = ids.indexOf(targetId);
		if (from < 0 || to < 0) return;
		ids.splice(to, 0, ids.splice(from, 1)[0]);
		await saveMediaOrder(ids);
	}
	async function moveMedia(mediaId: string, direction: -1 | 1) {
		if (detail?.limits.plan === "free") return;
		const ids = media.map((item) => item.id);
		const from = ids.indexOf(mediaId); const to = from + direction;
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		await saveMediaOrder(ids);
	}
	if (!user) return <AccountLayout user={null}><p className="account-status">Sign in to manage chapters.</p><Link to="/login">Sign in</Link></AccountLayout>;
	return <AccountLayout user={user}><div className="account-heading"><div><p className="eyebrow">CHAPTER WORKROOM</p><h1>{detail?.chapter.title ?? "Open chapter"}</h1><p className="account-copy">Upload, describe, and arrange the scenes in this collection.</p></div><div className="chapter-actions"><Link className="button button-primary" to={`/gallery/${chapterId}`}>Walk inside ↗</Link><Link className="button button-outline" to="/gallery">Back to library</Link></div></div>
		{error && <p className="account-alert" role="alert">{error}</p>}{notice && <p className="account-notice" role="status">{notice}</p>}
		{detail?.chapter.owner && <>
			<div className="editor-columns"><section className="account-card"><p className="eyebrow">CHAPTER SETTINGS</p><form className="account-form" onSubmit={saveChapter}><Field label="Chapter title"><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></Field>{detail.limits.plan !== "free" && <label className="privacy-toggle"><input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} /><span>Make this chapter private</span></label>}{isPrivate && <Field label="Share code · exactly 8 letters or numbers"><input value={shareCode} onChange={(event) => setShareCode(event.target.value)} minLength={8} maxLength={8} pattern="[A-Za-z0-9]{8}" required /></Field>}<p className="account-footnote">{detail.limits.plan === "free" ? "Free chapters are public. Upgrade to make chapters private." : "Private visitors must sign in and enter this 8-character code. Turning privacy off removes the code."}</p><button className="button button-outline">Save chapter</button></form></section>
				<section className="account-card"><p className="eyebrow">ADD MEDIA</p><p className="account-copy">{detail.limits.images} image slots · {detail.limits.videos} video slots · max {Math.floor(detail.limits.maxBytes / 1024 / 1024)} MB per file. No video-duration limit.</p><Field label="Choose images, GIFs, or MP4 files — choose again to add more"><input id="chapter-file-input" type="file" accept={allowed} multiple disabled={busy} onChange={addFiles} /></Field>{pendingUploads.length > 0 && <div className="pending-media-list" aria-label="Files waiting to upload">{pendingUploads.map((item) => <div className="pending-media-item" key={item.id}><div className="pending-media-heading"><strong title={item.file.name}>{item.file.name}</strong><span>{(item.file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" className="danger-link" disabled={busy} onClick={() => setPendingUploads((current) => current.filter((pending) => pending.id !== item.id))} aria-label={`Remove ${item.file.name} from selection`}>Remove</button></div><Field label={`Description for ${item.file.name} (optional)`}><textarea value={item.description} onChange={(event) => setPendingUploads((current) => current.map((pending) => pending.id === item.id ? { ...pending, description: event.target.value } : pending))} disabled={busy} rows={2} maxLength={2000} placeholder="A few words to appear beside this item in the gallery" /></Field></div>)}</div>}{pendingUploads.length ? <p className="account-footnote" role="status">{pendingUploads.length} selected · {(pendingUploads.reduce((sum, item) => sum + item.file.size, 0) / 1024 / 1024).toFixed(1)} MB total. Remove any file before uploading; edit descriptions later in “In this chapter.”</p> : null}<button className="button button-primary" disabled={busy || !pendingUploads.length} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload selected media"}</button></section></div>
			<section className="media-manager"><div className="account-heading"><div><p className="eyebrow">{media.length} ITEMS · {detail.limits.plan === "free" ? "RANDOMIZED ORDER" : "DRAG TO CURATE"}</p><h2>In this chapter</h2></div>{detail.limits.plan === "free" && <p className="account-footnote">Planned ordering is included in Standard and Zealous.</p>}</div>{media.length ? <div className="media-list">{media.map((item, index) => <MediaRow key={item.id} item={item} index={index} total={media.length} editable={detail.limits.plan !== "free"} dragged={dragId === item.id} onDragStart={() => setDragId(item.id)} onDrop={() => void reorder(item.id)} onMove={(direction) => void moveMedia(item.id, direction)} onReload={load} onError={setError} />)}</div> : <div className="account-empty"><h3>This chapter is ready for its first scene.</h3><p>Add images, GIFs, or video when you’re ready.</p></div>}</section>
			<div className="account-bottom-links"><Link to="/pricing">Add chapters or media capacity</Link><button onClick={async () => { if (!window.confirm("Delete this chapter and all its uploaded media? This cannot be undone.")) return; try { await api(`/api/chapters/${chapterId}`, { method: "DELETE" }); navigate("/gallery"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete chapter."); } }}>Delete chapter</button></div>
		</>}
	</AccountLayout>;
}

function MediaRow({ item, index, total, editable, dragged, onDragStart, onDrop, onMove, onReload, onError }: { item: Media; index: number; total: number; editable: boolean; dragged: boolean; onDragStart: () => void; onDrop: () => void; onMove: (direction: -1 | 1) => void; onReload: () => void; onError: (value: string) => void }) {
	const [description, setDescription] = useState(item.description); const [saving, setSaving] = useState(false);
	useEffect(() => setDescription(item.description), [item.description]);
	return <article className={`media-row${dragged ? " is-dragged" : ""}`} draggable={editable} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(); }}>
		<div className="media-thumb">{item.type === "video/mp4" ? <video src={item.url} muted playsInline preload="metadata" /> : <img src={item.url} alt="" loading="lazy" />}<span>{String(index + 1).padStart(2, "0")}</span></div>
		<div className="media-fields"><strong title={item.name}>{item.name}</strong><span>{item.type.split("/").pop()?.toUpperCase()} · {(item.size / 1024 / 1024).toFixed(2)} MB</span><label><span className="sr-only">Description for {item.name}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={2000} placeholder="Add a description (optional)" /></label><div className="media-row-actions">{editable && <><span className="drag-handle">⠿ Drag to sort</span><div className="media-order-buttons" aria-label={`Reorder ${item.name}`}><button type="button" disabled={index === 0} aria-label={`Move ${item.name} earlier`} onClick={() => onMove(-1)}>↑</button><button type="button" disabled={index === total - 1} aria-label={`Move ${item.name} later`} onClick={() => onMove(1)}>↓</button></div></>}<button disabled={saving} onClick={async () => { setSaving(true); try { await api(`/api/media/${item.id}`, { method: "PUT", body: JSON.stringify({ description }) }); onReload(); } catch (error) { onError(error instanceof Error ? error.message : "Could not save description."); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save description"}</button><button className="danger-link" onClick={async () => { if (!window.confirm(`Remove ${item.name}?`)) return; try { await api(`/api/media/${item.id}`, { method: "DELETE" }); onReload(); } catch (error) { onError(error instanceof Error ? error.message : "Could not remove media."); } }}>Remove</button></div></div>
	</article>;
}
