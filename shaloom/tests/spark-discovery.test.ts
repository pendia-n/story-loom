import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { sparkQueries } from "../workers/spark-discovery.ts";

const now = 1_800_000_000_000;
function fixture() {
	const db = new DatabaseSync(":memory:");
	db.exec("CREATE TABLE users(id TEXT, username TEXT); CREATE TABLE chapters(id TEXT, user_id TEXT, title TEXT, is_private INTEGER, created_at INTEGER); CREATE TABLE media(id TEXT, chapter_id TEXT, mime_type TEXT);");
	db.exec("INSERT INTO users VALUES ('u1','Alice'),('u2','Bob');");
	const add = (id: string, title: string, owner: string, age: number, count: number, mime = "image/png", privateChapter = 0) => {
		db.prepare("INSERT INTO chapters VALUES (?,?,?,?,?)").run(id, owner, title, privateChapter, now - age * 86_400_000);
		for (let i = 0; i < count; i++) db.prepare("INSERT INTO media VALUES (?,?,?)").run(`${id}-${i}`, id, mime);
	};
	add("a", "Summer drawings", "u1", 1, 3);
	add("b", "A film", "u2", 10, 10, "video/mp4");
	add("c", "Animated sketches", "u1", 40, 51, "image/gif");
	add("d", "Private summer", "u1", 0, 5, "image/png", 1);
	add("e", "100% literal", "u2", 2, 0);
	const run = (query = "") => {
		const plan = sparkQueries(new URLSearchParams(query), now);
		const total = Number(db.prepare(plan.countSql).get(...plan.bindings)?.total);
		const page = Math.min(plan.requestedPage, Math.max(1, Math.ceil(total / plan.pageSize)));
		return { total, page, rows: db.prepare(plan.pageSql).all(...plan.bindings, plan.pageSize, (page - 1) * plan.pageSize) };
	};
	return { db, add, run };
}

test("Spark searches titles and creators without exposing private chapters or treating SQL text as code", () => {
	const { db, run } = fixture();
	assert.equal(run().total, 4);
	assert.deepEqual(run("q=SUMMER").rows.map((r) => r.id), ["a"]);
	assert.equal(run("q=alice").total, 2);
	assert.equal(run("creator=ALICE").total, 2);
	assert.equal(run("q=%25").total, 1);
	assert.equal(run("q=' OR 1=1 --").total, 0);
	assert.equal(run("q=Private").total, 0);
	db.close();
});

test("Spark combines media, size, and date filters against real SQLite aggregation", () => {
	const { db, run } = fixture();
	assert.deepEqual(run("media=images&size=small&age=week").rows.map((r) => r.id), ["a"]);
	assert.deepEqual(run("media=video&size=medium&age=month").rows.map((r) => r.id), ["b"]);
	assert.deepEqual(run("media=gif&size=large").rows.map((r) => r.id), ["c"]);
	assert.equal(run("media=gif&age=month").total, 0);
	assert.equal(run("media=video&creator=Alice").total, 0);
	assert.deepEqual(run("sort=largest").rows.map((r) => r.id), ["c", "b", "a", "e"]);
	db.close();
});

test("Spark paginates beyond 100 collections and clamps invalid or out-of-range pages", () => {
	const { db, add, run } = fixture();
	for (let i = 0; i < 125; i++) add(`extra-${String(i).padStart(3, "0")}`, "Extra", "u2", 5, 1);
	assert.equal(run().total, 129);
	assert.equal(run().rows.length, 12);
	const first = run("page=1").rows.map((r) => r.id);
	assert.equal(run("page=2").rows.some((r) => first.includes(r.id)), false);
	assert.equal(run("page=99999").page, 11);
	assert.equal(run("page=-2").page, 1);
	assert.equal(run("page=NaN").page, 1);
	assert.equal(run("sort=created_at; DROP TABLE chapters").total, 129);
	db.close();
});
