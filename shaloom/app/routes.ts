import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("demo", "routes/gallery.tsx", { id: "demo" }),
	route("gallery", "routes/account.tsx", { id: "library" }),
	route("gallery/:chapterId", "routes/gallery.tsx", { id: "chapter-gallery" }),
	route("chapter/:chapterId", "routes/account.tsx", { id: "chapter-editor" }),
	route("signup", "routes/account.tsx", { id: "signup" }),
	route("login", "routes/account.tsx", { id: "login" }),
	route("recover", "routes/account.tsx", { id: "recover" }),
	route("profile", "routes/account.tsx", { id: "profile" }),
	route("security", "routes/account.tsx", { id: "security" }),
	route("pricing", "routes/account.tsx", { id: "pricing" }),
	route("billing", "routes/account.tsx", { id: "billing" }),
	route("spark", "routes/account.tsx", { id: "spark" }),
] satisfies RouteConfig;
