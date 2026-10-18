const PAGE_SIZE = 12;

export function sparkQueries(params: URLSearchParams, now = Date.now()) {
	const q = (params.get("q") ?? "").trim().slice(0, 100);
	const creator = (params.get("creator") ?? "").trim().slice(0, 24);
	const media = params.get("media");
	const size = params.get("size");
	const age = params.get("age");
	const sort = params.get("sort");
	const pageValue = Number(params.get("page") ?? 1);
	const requestedPage = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 100_000) : 1;
	const where = ["1 = 1"];
	const bindings: (string | number)[] = [];
	if (creator) { where.push("lower(username) = lower(?)"); bindings.push(creator); }
	if (q) {
		where.push("(instr(lower(title), lower(?)) > 0 OR instr(lower(username), lower(?)) > 0)");
		bindings.push(q, q);
	}
	if (media === "images") where.push("media_count > 0 AND video_count = 0");
	if (media === "video") where.push("video_count > 0");
	if (media === "gif") where.push("gif_count > 0");
	if (size === "small") where.push("media_count BETWEEN 1 AND 8");
	if (size === "medium") where.push("media_count BETWEEN 9 AND 50");
	if (size === "large") where.push("media_count >= 51");
	if (age === "week" || age === "month") {
		where.push("created_at >= ?");
		bindings.push(now - (age === "week" ? 7 : 30) * 86_400_000);
	}
	const order = sort === "oldest" ? "created_at ASC, id ASC" : sort === "title" ? "title COLLATE NOCASE ASC, id ASC" : sort === "largest" ? "media_count DESC, created_at DESC, id ASC" : sort === "smallest" ? "media_count ASC, created_at DESC, id ASC" : "created_at DESC, id ASC";
	const base = `WITH public_chapters AS (
		SELECT c.id, c.title, c.created_at, u.username, COUNT(m.id) AS media_count,
			COALESCE(SUM(m.mime_type = 'video/mp4'), 0) AS video_count,
			COALESCE(SUM(m.mime_type = 'image/gif'), 0) AS gif_count
		FROM chapters c JOIN users u ON u.id = c.user_id
		LEFT JOIN media m ON m.chapter_id = c.id
		WHERE c.is_private = 0 GROUP BY c.id
	) SELECT * FROM public_chapters WHERE ${where.join(" AND ")}`;
	return {
		countSql: `SELECT COUNT(*) AS total FROM (${base})`,
		bindings,
		requestedPage,
		pageSize: PAGE_SIZE,
		pageSql: `${base} ORDER BY ${order} LIMIT ? OFFSET ?`,
	};
}
