// The database layer: the committed migrations, the by-hash migrator, the
// owned-row helpers (scripts/db/owned.ts) and where DATABASE_URL comes from.
// Every database here is an in-process PGlite (testdb.mjs); nothing needs a
// Postgres server, and nothing can reach the real fret_not database.
//   node --test scripts/tests/db.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "./testdb.mjs";
import { DEFAULT_DATABASE_URL, databaseName, databaseUrl, isLinkedWorktree, redact } from "../db/config.mjs";
import { applyMigrations, compareMigrations, describeMigrations, migrationState, migrationsOnDisk } from "../db/migrations.mjs";
import { forLearner, forUser } from "../db/owned.ts";
import { cliAddRefusal, createUser } from "../db/accounts.ts";
import { authSessions, chatMessages, learners, progressBackups, userSettings, users } from "../db/schema.ts";

const rowsOf = (pg) => async (text, params) => (await pg.query(text, params)).rows;
const EMPTY = { version: 1, profile: "x", concepts: {}, lessons: {}, placedLevel: 0, openedLevel: 0, updatedAt: "2026-11-15T00:00:00.000Z" };

/** A user with learners, straight into the tables. */
async function seed(db, username, ...names) {
  const [user] = await db.insert(users).values({ username, passwordHash: "x" }).returning();
  const learnerIds = [];
  for (const name of names) {
    const [l] = await forUser(db, user.id).insert(learners, { name, progress: EMPTY });
    learnerIds.push(l.id);
  }
  return { userId: user.id, learnerIds };
}

/* ------------------------------- migrations ------------------------------- */

const fake = (n, when) => ({ hash: `hash-${n}`, folderMillis: when, sql: [`create table t${n} (id int)`] });
const M1 = fake(1, 1000);
const M2 = fake(2, 2000);
const M3 = fake(3, 3000);

test("the committed migrations leave a fresh database current, with every table", async (t) => {
  const { query, close } = await freshDb();
  t.after(close);
  const state = await migrationState(query);
  assert.equal(state.status, "current");
  assert.equal(state.applied, migrationsOnDisk().length);
  assert.deepEqual((await applyMigrations(query)).applied, [], "applying again is a no-op");
  const tables = (await query(`select tablename from pg_tables where schemaname = 'public' order by tablename`)).map((r) => r.tablename);
  assert.deepEqual(tables, ["auth_sessions", "chat_messages", "learners", "progress_backups", "user_settings", "users"]);
});

test("compareMigrations tells behind, skipped, ahead and diverged apart", () => {
  const rec = (...ms) => ms.map((m) => ({ hash: m.hash, createdAt: m.folderMillis }));
  assert.equal(compareMigrations([M1, M2], rec(M1, M2)).status, "current");
  assert.equal(compareMigrations([M1, M2, M3], rec(M1)).status, "behind");
  const skipped = compareMigrations([M1, M2, M3], rec(M1, M3));
  assert.equal(skipped.status, "skipped");
  assert.match(describeMigrations(skipped), /out-of-order/);
  assert.equal(compareMigrations([M1], rec(M1, M2)).status, "ahead");
  assert.equal(compareMigrations([M1, M3], rec(M1, M2)).status, "diverged");
});

test("an out-of-order migration is applied by hash, and a database ahead is refused untouched", async (t) => {
  const pg = await PGlite.create();
  t.after(() => pg.close());
  const query = rowsOf(pg);
  await applyMigrations(query, [M1, M3]);
  assert.equal((await migrationState(query, [M1, M2, M3])).status, "skipped");
  assert.deepEqual((await applyMigrations(query, [M1, M2, M3])).applied.map((m) => m.hash), ["hash-2"]);
  assert.equal((await migrationState(query, [M1, M2, M3])).status, "current");
  await assert.rejects(applyMigrations(query, [M1]), /refusing to migrate: the database is ahead/);
});

/* -------------------------------- the schema ------------------------------ */

test("the command line may not make the first account (that is the app's first run, which imports data/)", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  assert.match(await cliAddRefusal(db), /no accounts yet: create the first one in the app/);
  await createUser(db, { username: "robin", passwordHash: "x", isAdmin: true });
  assert.equal(await cliAddRefusal(db), null);
});

test("usernames are lowercase and unique; roles and backup reasons are checked", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  await assert.rejects(db.insert(users).values({ username: "Ana", passwordHash: "x" }), (e) => (e.cause ?? e).message.includes("users_username_lowercase"));
  const { learnerIds: [a] } = await seed(db, "ana", "Ana");
  await assert.rejects(db.insert(users).values({ username: "ana", passwordHash: "y" }));
  await assert.rejects(forLearner(db, a).insert(chatMessages, { role: "system", text: "x" }));
  await assert.rejects(forLearner(db, a).insert(progressBackups, { reason: "whim", data: {} }));
});

test("deleting a learner takes its chat and backups and sends sessions to the picker; deleting a user takes everything", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const { userId, learnerIds: [a] } = await seed(db, "ana", "Ana");
  await forLearner(db, a).insert(chatMessages, { role: "user", text: "hi" });
  await forLearner(db, a).insert(progressBackups, { reason: "reset", data: EMPTY });
  await forUser(db, userId).insert(authSessions, { id: "s1", expiresAt: new Date(Date.now() + 1e6), learnerId: a });
  await forUser(db, userId).insert(userSettings, { model: "m" });
  await db.delete(learners).where(eq(learners.id, a));
  assert.equal((await db.select().from(chatMessages)).length, 0);
  assert.equal((await db.select().from(progressBackups)).length, 0);
  assert.equal((await db.select().from(authSessions))[0].learnerId, null);
  await db.delete(users).where(eq(users.id, userId));
  for (const table of [authSessions, userSettings, learners]) assert.equal((await db.select().from(table)).length, 0);
});

test("chat messages keep insertion order within one transaction", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const { learnerIds: [a] } = await seed(db, "ana", "Ana");
  await db.transaction(async (tx) => {
    for (const text of ["one", "two", "three"]) await forLearner(tx, a).insert(chatMessages, { role: "user", text });
  });
  const rows = await forLearner(db, a).list(chatMessages, undefined, { orderBy: chatMessages.seq });
  assert.deepEqual(rows.map((r) => r.text), ["one", "two", "three"]);
});

/* ------------------------------ owned rows -------------------------------- */

test("forLearner sees, changes and deletes only its own learner's rows", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const { learnerIds: [a, b] } = await seed(db, "ana", "Ana", "Ben");
  const ana = forLearner(db, a);
  const ben = forLearner(db, b);
  const rows = await ana.insert(chatMessages, [{ role: "user", text: "why" }, { role: "assistant", text: "because" }]);
  assert.ok(rows.every((r) => r.learnerId === a), "insert stamps the owner");
  const [bens] = await ben.insert(chatMessages, { role: "user", text: "hello" });
  assert.equal((await ana.list(chatMessages)).length, 2);
  assert.deepEqual((await ben.list(chatMessages)).map((r) => r.id), [bens.id]);
  // Even naming another learner's row by id finds nothing.
  assert.equal(await ana.get(chatMessages, eq(chatMessages.id, bens.id)), undefined);
  assert.deepEqual(await ana.update(chatMessages, { text: "mine now" }, eq(chatMessages.id, bens.id)), []);
  assert.deepEqual(await ana.remove(chatMessages, eq(chatMessages.id, bens.id)), []);
  assert.equal((await ben.get(chatMessages, eq(chatMessages.id, bens.id))).text, "hello");
  await ana.removeAllOwned(chatMessages);
  assert.equal((await ben.list(chatMessages)).length, 1, "removeAllOwned removes only the owner's");
});

test("forUser reaches a learner's row (its progress) only through the owning account", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const ana = await seed(db, "ana", "Ana");
  const bob = await seed(db, "bob", "Bob");
  const [anas] = ana.learnerIds;
  assert.equal((await forUser(db, ana.userId).get(learners, eq(learners.id, anas))).name, "Ana");
  assert.equal(await forUser(db, bob.userId).get(learners, eq(learners.id, anas)), undefined);
  assert.deepEqual(await forUser(db, bob.userId).update(learners, { progress: { stolen: true } }, eq(learners.id, anas)), []);
  assert.deepEqual((await forUser(db, ana.userId).get(learners, eq(learners.id, anas))).progress, EMPTY);
  // Upsert puts the owner in the conflict target.
  await forUser(db, ana.userId).upsert(userSettings, { model: "a" }, { target: [], set: { model: "a" } });
  await forUser(db, ana.userId).upsert(userSettings, { model: "b" }, { target: [], set: { model: "b" } });
  assert.deepEqual((await db.select().from(userSettings)).map((r) => r.model), ["b"]);
});

test("a raw `or` condition cannot escape the owner filter", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const { learnerIds: [a, b] } = await seed(db, "ana", "Ana", "Ben");
  await forLearner(db, a).insert(chatMessages, { role: "user", text: "x" });
  await forLearner(db, b).insert(chatMessages, { role: "user", text: "y" });
  const owners = (rows) => [...new Set(rows.map((r) => r.learnerId))];
  assert.deepEqual(owners(await forLearner(db, a).list(chatMessages, sql`true or true`)), [a]);
  await forLearner(db, a).remove(chatMessages, sql`true or true`);
  assert.equal((await forLearner(db, b).list(chatMessages)).length, 1);
  const rows = await db.select().from(chatMessages).where(forLearner(db, b).where(chatMessages, sql`true or true`));
  assert.deepEqual(owners(rows), [b]);
});

test("owned-row rules hold at runtime for untyped callers", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const { userId, learnerIds: [a, b] } = await seed(db, "ana", "Ana", "Ben");
  const ana = forLearner(db, a);
  await assert.rejects(ana.list(users), /no learnerId column/);
  await assert.rejects(forUser(db, userId).insert(chatMessages, { role: "user", text: "x" }), /no userId column/);
  await assert.rejects(ana.update(chatMessages, { text: "x" }), /needs a condition/);
  await assert.rejects(ana.remove(chatMessages), /needs a condition/);
  await assert.rejects(ana.get(chatMessages), /needs a condition/);
  await assert.rejects(ana.insert(chatMessages, { role: "user", text: "x", learnerId: b }), /sets learnerId itself/);
  await assert.rejects(ana.update(chatMessages, { learnerId: b }, sql`true`), /sets learnerId itself/);
  assert.throws(() => forLearner(db, ""), /need a learnerId/);
  assert.throws(() => forUser(db, undefined), /need a userId/);
});

/* -------------------------------- the URL --------------------------------- */

test("DATABASE_URL: the shell, then .env.local, then the default", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-env-"));
  fs.mkdirSync(path.join(dir, ".git")); // a main checkout
  const file = path.join(dir, ".env.local");
  assert.equal(databaseUrl({}, path.join(dir, "missing"), dir), DEFAULT_DATABASE_URL);
  fs.writeFileSync(file, "# keys\nELEVENLABS_API_KEY=x\nDATABASE_URL='postgres://localhost/from_file'\n");
  assert.equal(databaseUrl({}, file, dir), "postgres://localhost/from_file");
  assert.equal(databaseUrl({ DATABASE_URL: "postgres://localhost/from_shell" }, file, dir), "postgres://localhost/from_shell");
  assert.equal(databaseName(DEFAULT_DATABASE_URL), "fret_not");
  assert.equal(databaseName("postgres://u:p@db.local:5433/other?sslmode=disable"), "other");
  assert.throws(() => databaseName("postgres://localhost/"), /names no database/);
  assert.equal(redact("postgres://u:secret@localhost/x"), "postgres://u:***@localhost/x");
  assert.ok(!redact("postgres://u@localhost/x?password=hunter2&sslmode=prefer").includes("hunter2"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a linked worktree never defaults to the real database", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-wt-"));
  fs.writeFileSync(path.join(dir, ".git"), "gitdir: /somewhere/.git/worktrees/x\n");
  assert.equal(isLinkedWorktree(dir), true);
  assert.throws(() => databaseUrl({}, path.join(dir, ".env.local"), dir), /linked git worktree[\s\S]*scratch database/);
  assert.equal(databaseUrl({ DATABASE_URL: "postgres://localhost/fret_not_scratch_x" }, path.join(dir, ".env.local"), dir), "postgres://localhost/fret_not_scratch_x");
  fs.rmSync(dir, { recursive: true, force: true });
});
