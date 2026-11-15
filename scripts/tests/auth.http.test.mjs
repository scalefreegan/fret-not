// Logins and learners over HTTP (web/server/auth.ts, wrap() in api.ts): the
// real plugin on an in-process PGlite. First run, login/logout, expiry and
// sliding, the throttle, every access level, learner CRUD and picking, the
// stale-learner check, and that one account never sees or changes another's
// learners. Every name is made up. Nothing touches the real database, data/
// or content/.
//   node --test scripts/tests/auth.http.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { serveApi } from "./connect-stack.mjs";
import { PASSWORD, addUser, client, tab } from "./http-session.mjs";
import { freshDb } from "./testdb.mjs";
import { tokenHash } from "../auth.mjs";
import { disableUser, enableUser, setPassword } from "../db/accounts.ts";
import { authSessions, learners, users } from "../db/schema.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-auth-"));
const dataDir = path.join(tmp, "data");
const contentDir = path.join(tmp, "content");
fs.mkdirSync(path.join(contentDir, "lessons", "core"), { recursive: true });
fs.writeFileSync(path.join(contentDir, "curriculum.yaml"), "tracks:\n  - { id: core, title: Core }\nlevels:\n  - { id: 0, title: Zero }\nconcepts:\n  - { id: alpha, title: Alpha, level: 0 }\n");
process.env.FRET_DATA_DIR = dataDir;
process.env.FRET_CONTENT_DIR = contentDir;
process.env.FRET_ENV_FILE = path.join(tmp, "no-such.env");

const { apiPlugins } = await import("../../web/server/api.ts");
const { setDb } = await import("../../web/server/db.ts");
const { resetLoginThrottle } = await import("../../web/server/auth.ts");

let base, close;
const dbs = [];
/** A fresh, empty database for the routes from here on. */
async function freshRoutes() {
  const t = await freshDb();
  dbs.push(t);
  setDb(t.db);
  resetLoginThrottle();
  return t;
}
before(async () => ({ base, close } = await serveApi(apiPlugins, { db: (await freshRoutes()).db })));
after(async () => {
  await close();
  for (const t of dbs) await t.close();
  setDb(null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const anon = () => client(base);

/** A logged-in client for a user made straight in the database. */
async function as(db, name, opts = {}) {
  const made = await addUser(db, name, PASSWORD, opts);
  const c = anon();
  await c.login(name);
  return { ...made, c };
}

/** A request with exactly these headers (fetch will not set Host). */
function raw(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + url);
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers: { "Content-Type": "application/json", ...headers } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on("error", reject);
    req.end(data);
  });
}

/* --------------------------------- first run ------------------------------ */

test("first run: /me says so; the first account is an admin with one learner, logged in on it; a second is a 409", async () => {
  const { db } = await freshRoutes();
  const me = await anon().call("GET", "/api/auth/me");
  assert.deepEqual(me.body, { firstRun: true, firstRunHere: true, user: null, learner: null, learners: [] });
  const c = anon();
  const r = await c.call("POST", "/api/auth/first-run", { username: "Robin", password: PASSWORD, learnerName: " Sam " });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.username, "robin");
  assert.equal(r.body.user.isAdmin, true);
  assert.deepEqual(r.body.learners.map((l) => l.name), ["Sam"]);
  assert.equal(r.body.learner.name, "Sam", "logged in on the first learner");
  const [row] = await db.select().from(learners);
  assert.equal(row.progress.profile, row.id, "the empty progress names its learner");
  assert.equal((await anon().call("POST", "/api/auth/first-run", { username: "lee", password: PASSWORD })).status, 409);
  assert.equal((await anon().call("GET", "/api/auth/me")).body.firstRun, false);
  // No learner name: the username.
  await freshRoutes();
  const plain = await anon().call("POST", "/api/auth/first-run", { username: "lee", password: PASSWORD });
  assert.deepEqual(plain.body.learners.map((l) => l.name), ["lee"]);
});

test("first run: a request that came through a proxy is refused with a 403, and bad input is a 400", async () => {
  const { db } = await freshRoutes();
  const body = { username: "mallory", password: PASSWORD };
  for (const h of ["X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto"]) {
    const r = await raw("POST", "/api/auth/first-run", { Host: "localhost:38600", [h]: "x" }, body);
    assert.equal(r.status, 403, h);
    assert.match(r.body.error, /on the Mac/);
  }
  assert.equal((await raw("POST", "/api/auth/first-run", { Host: "fret.example.net" }, body)).status, 403);
  assert.equal((await raw("GET", "/api/auth/me", { Host: "fret.example.net" })).body.firstRunHere, false);
  for (const bad of [{ username: "robin", password: "short" }, { username: "no spaces", password: PASSWORD }, { password: PASSWORD }, {}]) {
    assert.equal((await anon().call("POST", "/api/auth/first-run", bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await anon().call("GET", "/api/auth/first-run")).status, 405);
  assert.equal((await db.select().from(users)).length, 0);
});

/* ------------------------------ login and logout -------------------------- */

test("login: a wrong password and an unknown user get the same 401; the right one sets an httpOnly, Lax, 30-day cookie whose hash is the session row", async () => {
  const { db } = await freshRoutes();
  await addUser(db, "robin", PASSWORD, { learners: ["Sam"] });
  const wrong = await anon().call("POST", "/api/auth/login", { username: "robin", password: "not the password" });
  const nobody = await anon().call("POST", "/api/auth/login", { username: "nobody", password: PASSWORD });
  assert.equal(wrong.status, 401);
  assert.equal(nobody.status, 401);
  assert.equal(wrong.body.error, nobody.body.error);
  assert.equal((await anon().call("POST", "/api/auth/login", { username: "robin" })).status, 400);

  const c = anon();
  const r = await c.call("POST", "/api/auth/login", { username: "ROBIN", password: PASSWORD });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.isAdmin, false);
  assert.equal(r.body.learner.name, "Sam", "one learner: picked at login");
  assert.match(c.setCookies[0], /^fn_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
  const token = c.jar.cookie.slice("fn_session=".length);
  const rows = await db.select().from(authSessions);
  assert.equal(rows[0].id, tokenHash(token), "the row holds the hash");
  assert.ok(!JSON.stringify(rows).includes(token), "and never the token");

  const stale = c.jar.cookie;
  assert.equal((await c.call("POST", "/api/auth/logout")).status, 200);
  assert.match(c.setCookies[0], /^fn_session=; .*Max-Age=0/);
  assert.equal((await db.select().from(authSessions)).length, 0);
  assert.equal((await c.call("GET", "/api/auth/me")).body.user, null);
  const replay = anon();
  replay.jar.cookie = stale;
  assert.equal((await replay.call("GET", "/api/learners")).status, 401, "a logged-out cookie is refused");
});

test("with two learners, login lands on the picker", async () => {
  const { db } = await freshRoutes();
  await addUser(db, "robin", PASSWORD, { learners: ["Sam", "Ana"] });
  const r = await anon().login("robin");
  assert.equal(r.learner, null);
  assert.deepEqual(r.learners.map((l) => l.name).sort(), ["Ana", "Sam"]);
});

test("sessions expire after 30 days, sliding; an expired one is a 401 and its cookie is cleared", async () => {
  const { db } = await freshRoutes();
  await addUser(db, "robin", PASSWORD, { learners: ["Sam"] });
  const c = anon();
  await c.login("robin");
  const id = (await db.select().from(authSessions))[0].id;
  const row = async () => (await db.select().from(authSessions).where(eq(authSessions.id, id)))[0];
  await c.call("GET", "/api/auth/me");
  assert.equal(c.setCookies.length, 0, "seen moments ago: no new cookie");
  await db.update(authSessions).set({ lastSeenAt: sql`now() - interval '2 minutes'`, expiresAt: sql`now() + interval '1 day'` }).where(eq(authSessions.id, id));
  assert.equal((await c.call("GET", "/api/learners")).status, 200);
  assert.ok(((await row()).expiresAt - Date.now()) / 86_400_000 > 29.9, "slid");
  assert.match(c.setCookies[0] ?? "", /^fn_session=.*Max-Age=2592000/);
  await db.update(authSessions).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(authSessions.id, id));
  assert.equal((await c.call("GET", "/api/learners")).status, 401);
  assert.match(c.setCookies[0], /^fn_session=; .*Max-Age=0/);
  assert.equal((await c.call("GET", "/api/auth/me")).body.user, null);
});

test("the throttle: 5 failures for a username → 429 with Retry-After, even for the right password", async () => {
  const { db } = await freshRoutes();
  await addUser(db, "robin");
  await addUser(db, "lee");
  for (let i = 0; i < 5; i++) assert.equal((await anon().call("POST", "/api/auth/login", { username: "robin", password: `wrong ${i}` })).status, 401);
  const held = await anon().call("POST", "/api/auth/login", { username: "robin", password: PASSWORD });
  assert.equal(held.status, 429);
  assert.equal(held.headers.get("retry-after"), "30");
  assert.equal((await anon().call("POST", "/api/auth/login", { username: "lee", password: PASSWORD })).status, 200);
  assert.equal((await anon().call("POST", "/api/auth/login", { username: "x".repeat(20_000), password: "x" })).status, 413);
});

test("a disabled user, or a changed password, ends every session", async () => {
  const { db } = await freshRoutes();
  await addUser(db, "robin");
  await addUser(db, "lee");
  const robin = anon();
  await robin.login("robin");
  const lee = anon();
  await lee.login("lee");
  assert.equal(await setPassword(db, "robin", (await db.select().from(users).where(eq(users.username, "lee")))[0].passwordHash), true);
  assert.equal((await robin.call("GET", "/api/learners")).status, 401);
  assert.equal(await disableUser(db, "lee"), true);
  assert.equal((await lee.call("GET", "/api/learners")).status, 401);
  assert.equal((await anon().call("POST", "/api/auth/login", { username: "lee", password: PASSWORD })).status, 401);
  assert.equal(await enableUser(db, "lee"), true);
  assert.equal((await anon().call("POST", "/api/auth/login", { username: "lee", password: PASSWORD })).status, 200);
});

/* ------------------------------- access levels ---------------------------- */

test("access levels: anonymous is 401 everywhere but login, me and first run; cross-origin is refused first", async () => {
  const { db } = await freshRoutes();
  const { c } = await as(db, "robin", { admin: true, learners: ["Sam"] });
  const routes = [
    ["GET", "/api/content"], ["GET", "/api/progress"], ["POST", "/api/progress/answers", { results: [] }], ["GET", "/api/settings"],
    ["PUT", "/api/settings", { listenMode: true }], ["POST", "/api/chat", { message: "hi" }], ["GET", "/api/chat/history"], ["POST", "/api/tts/speak", { text: "x" }],
    ["GET", `/api/tts/audio/${"a".repeat(64)}.mp3`], ["GET", "/api/learners"], ["POST", "/api/learners", { name: "x" }], ["PUT", "/api/auth/learner", { learnerId: null }],
    ["POST", "/api/auth/logout"],
  ];
  for (const [m, u, body] of routes) {
    const r = await anon().call(m, u, body);
    assert.equal(r.status, 401, `anonymous ${m} ${u}`);
    assert.equal(r.body.error, "log in first");
  }
  assert.equal((await c.call("GET", "/api/content")).status, 200);
  assert.equal((await anon().call("GET", "/api/auth/me")).status, 200);
  assert.equal((await anon().call("GET", "/api/nope")).status, 404);
  assert.equal((await c.call("GET", "/api/learners", undefined, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await anon().call("POST", "/api/auth/login", { username: "robin", password: PASSWORD }, { Origin: "https://evil.example" })).status, 403);
});

/* --------------------------------- learners ------------------------------- */

test("learners: add, list, rename, archive and pick; another account's learner is a 404", async () => {
  const { db } = await freshRoutes();
  const { c } = await as(db, "robin");
  assert.deepEqual((await c.call("GET", "/api/learners")).body, { learners: [] }, "a CLI-made user starts with none");
  const made = await c.call("POST", "/api/learners", { name: " Ana " });
  assert.equal(made.status, 200);
  assert.equal(made.body.learner.name, "Ana");
  assert.equal((await c.call("POST", "/api/learners", { name: "  " })).status, 400);
  assert.equal((await c.call("POST", "/api/learners", { name: "x".repeat(81) })).status, 400);
  const ben = (await c.call("POST", "/api/learners", { name: "Ben" })).body.learner;
  assert.equal((await c.call("PATCH", `/api/learners/${ben.id}`, { name: "Benji" })).body.learner.name, "Benji");
  const picked = await c.pick("Ana");
  assert.equal(picked.learner.name, "Ana");
  assert.equal((await c.call("GET", "/api/content")).status, 200);

  // Archiving the active learner sends the session back to the picker.
  assert.equal((await c.call("POST", `/api/learners/${made.body.learner.id}/archive`)).status, 200);
  const me = (await c.call("GET", "/api/auth/me")).body;
  assert.equal(me.learner, null);
  assert.deepEqual(me.learners.map((l) => l.name), ["Benji"]);
  assert.equal((await c.call("PUT", "/api/auth/learner", { learnerId: made.body.learner.id })).status, 404, "an archived learner can't be picked");

  // Another account: every route answers as if the learner did not exist.
  const lee = await as(db, "lee", { learners: ["Pip"] });
  const pip = lee.learners[0];
  for (const [m, u, body] of [
    ["GET", `/api/learners/${pip.id}`], ["PATCH", `/api/learners/${pip.id}`, { name: "Mine" }], ["POST", `/api/learners/${pip.id}/archive`],
    ["PUT", "/api/auth/learner", { learnerId: pip.id }], ["GET", "/api/learners/not-a-uuid"],
  ]) {
    assert.equal((await c.call(m, u, body)).status, 404, `${m} ${u}`);
  }
  assert.equal((await db.select().from(learners).where(eq(learners.id, pip.id)))[0].name, "Pip");
  assert.deepEqual((await c.call("GET", "/api/learners")).body.learners.map((l) => l.name), ["Benji"]);
});

test("a learner route needs the page's learner: no header, another learner or no learner at all is a 409 stale_learner", async () => {
  const { db } = await freshRoutes();
  const { c } = await as(db, "robin", { learners: ["Sam", "Ana"] });
  // Logged in with two learners: none picked yet.
  const none = await c.call("GET", "/api/content");
  assert.equal(none.status, 409);
  assert.equal(none.body.code, "stale_learner");
  await c.pick("Sam");
  assert.equal((await c.call("GET", "/api/content")).status, 200);
  assert.equal((await c.call("GET", "/api/content", undefined, { "X-Learner-Id": "" })).status, 409);
  // A second tab of the same browser picks Ana: the first tab is stale.
  const t2 = tab(base, c);
  await t2.pick("Ana");
  const stale = await c.call("GET", "/api/content");
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "stale_learner");
  assert.equal((await t2.call("GET", "/api/content")).status, 200);
});
