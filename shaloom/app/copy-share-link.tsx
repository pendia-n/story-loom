import { useEffect, useState } from "react";

export function CopyShareLink({ chapterId, className = "button button-outline" }: { chapterId: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const [manualLink, setManualLink] = useState("");
	useEffect(() => { setCopied(false); setManualLink(""); }, [chapterId]);

	async function copy() {
		const url = new URL(`/gallery/${encodeURIComponent(chapterId)}`, window.location.origin).href;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true); setManualLink("");
		} catch {
			setCopied(false); setManualLink(url);
		}
	}

	return <div className="copy-share-control">
		<button type="button" className={className} onClick={() => void copy()} title="Visitors must sign in. Private galleries still require their access code.">{copied ? "Link copied ✓" : "Copy share link"}</button>
		<span className="sr-only" role="status">{copied ? "Gallery link copied. Visitors must sign in to view it." : ""}</span>
		{manualLink && <div className="copy-share-fallback"><label>Copy this gallery link<input aria-label="Gallery share link" value={manualLink} readOnly autoFocus onFocus={(event) => event.currentTarget.select()} /></label><span role="status">Clipboard unavailable. Select and copy the link above.</span></div>}
	</div>;
}
