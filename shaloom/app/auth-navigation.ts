/** Only return to known member pages, never an external URL or another auth page. */
export function safeReturnTo(value: string | null | undefined): string {
	if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/gallery";
	try {
		const url = new URL(value, "https://shaloom.invalid");
		if (url.origin !== "https://shaloom.invalid" || !/^\/(?:gallery(?:\/[\w-]+)?|chapter\/[\w-]+|spark|profile|security|billing)$/.test(url.pathname)) return "/gallery";
		return `${url.pathname}${url.search}${url.hash}`;
	} catch { return "/gallery"; }
}

export function authPagePath(page: "/login" | "/signup" | "/recover", returnTo?: string | null): string {
	return returnTo ? `${page}?${new URLSearchParams({ returnTo: safeReturnTo(returnTo) })}` : page;
}
