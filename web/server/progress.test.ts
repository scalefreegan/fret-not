import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { Progress } from "../shared/progress.ts";
import { contentDir, REPO_ROOT } from "./loader.ts";
import { dataDir, handleProgress, repairProgress } from "./progress.ts";
import { HttpError, sendJson } from "./sse.ts";

// The real handler behind a throwaway HTTP server, with data and content
// redirected to a temp dir. Nothing here may touch the repo's data/ or
// content/.

const CURRICULUM = `
tracks:
  - { id: core, title: Core }
levels:
  - { id: 0, title: Zero }
  - { id: 1, title: One }
  - { id: 2, title: Two }
concepts:
  - { id: alpha, title: Alpha, level: 0 }
  - { id: beta, title: Beta, level: 0 }
  - { id: gamma, title: Gamma, level: 1 }
`;
const LESSON = `---
id: core-0-alpha
title: Alpha
track: core
level: 0
order: 1
concepts: [alpha]
summary: About alpha.
---
Some prose.
`;

let tmp = "";
let server: http.Server;
let base = "";
const saved = { data: process.env.FRET_DATA_DIR, content: process.env.FRET_CONTENT_DIR };

const progressFile = () => path.join(tmp, "data", "profiles", "default", "progress.json");
const profileFiles = () => (fs.existsSync(path.dirname(progressFile())) ? fs.readdirSync(path.dirname(progressFile())).sort() : []);

type Reply = { progress: Progress; recovered?: boolean; recoveredTo?: string; dropped?: number; lessonDropped?: boolean; error?: string };

async function call(method: string, route: string, body?: unknown): Promise<{ status: number; json: Reply }> {
  const res = await fetch(`${base}/api/progress${route}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, json: (await res.json()) as Reply };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-progress-"));
  process.env.FRET_DATA_DIR = path.join(tmp, "data");
  process.env.FRET_CONTENT_DIR = path.join(tmp, "content");
  // Precondition, not an assertion: if the redirects did not take, stop the
  // whole file before any test can write into the real repo.
  for (const dir of [dataDir(), contentDir()]) {
    if (!dir.startsWith(tmp + path.sep) || dir.startsWith(REPO_ROOT + path.sep)) throw new Error(`test isolation failed: ${dir} is not under ${tmp}`);
  }
  fs.mkdirSync(path.join(tmp, "content", "lessons", "core"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "content", "curriculum.yaml"), CURRICULUM);
  fs.writeFileSync(path.join(tmp, "content", "lessons", "core", "0-01-alpha.md"), LESSON);

  // What connect + wrap() do in the app: strip the mount prefix, and turn a
  // thrown HttpError into its status.
  server = http.createServer((req, res) => {
    req.url = (req.url ?? "/").replace(/^\/api\/progress/, "") || "/";
    Promise.resolve()
      .then(() => handleProgress(req, res))
      .catch((e) => sendJson(res, e instanceof HttpError ? e.status : 500, { error: String((e as Error)?.message || e) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  try {
    server?.closeAllConnections();
    await Promise.race([new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())), new Promise<void>((resolve) => setTimeout(resolve, 2000).unref())]);
  } finally {
    for (const [key, value] of [["FRET_DATA_DIR", saved.data], ["FRET_CONTENT_DIR", saved.content]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
});

beforeEach(() => {
  fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
});

test("GET with no file is an empty progress and writes nothing", async () => {
  const { status, json } = await call("GET", "");
  assert.equal(status, 200);
  assert.equal(json.progress.version, 1);
  assert.equal(json.progress.profile, "default");
  assert.deepEqual(json.progress.concepts, {});
  assert.equal(json.recovered, undefined);
  assert.equal(fs.existsSync(progressFile()), false);
});

test("answers are folded in, saved, and unknown concepts and lessons are dropped", async () => {
  const results = [
    ...[true, true, true, true].map((correct) => ({ concept: "alpha", correct })),
    { concept: "beta", correct: false },
    { concept: "no-such-concept", correct: true },
  ];
  const { status, json } = await call("POST", "/answers", { results, lesson: { id: "core-0-alpha", score: 0.75 } });
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json.progress.concepts).sort(), ["alpha", "beta"]);
  assert.equal(json.progress.concepts.alpha.box, 1);
  assert.equal(json.progress.concepts.beta.attempts, 1);
  assert.equal(json.progress.lessons["core-0-alpha"].bestScore, 0.75);
  assert.equal(json.dropped, 1, "the reply says one answer was not recorded");
  assert.equal(json.lessonDropped, false);
  assert.equal(json.recovered, false);

  const clean = (await call("POST", "/answers", { results: [{ concept: "alpha", correct: true }] })).json;
  assert.deepEqual([clean.dropped, clean.lessonDropped, clean.recovered], [0, false, false], "always stated, even when there is nothing to say");

  const again = await call("POST", "/answers", { results: [{ concept: "alpha", correct: true }], lesson: { id: "not-a-lesson", score: 1 } });
  assert.deepEqual(Object.keys(again.json.progress.lessons), ["core-0-alpha"]);
  assert.equal(again.json.dropped, 0, "`dropped` counts answers only");
  assert.equal(again.json.lessonDropped, true, "the unrecorded lesson completion is reported by itself");

  const onDisk = JSON.parse(fs.readFileSync(progressFile(), "utf8")) as Progress;
  assert.deepEqual(onDisk, again.json.progress);
  assert.deepEqual((await call("GET", "")).json.progress, onDisk);
  assert.deepEqual(profileFiles(), ["progress.json"], "no temp file left behind");
});

test("bad input is a 400 with a reason and changes nothing", async () => {
  const cases: [string, unknown][] = [
    ["/answers", {}],
    ["/answers", { results: "yes" }],
    ["/answers", { results: [{ concept: "alpha" }] }],
    ["/answers", { results: [{ concept: "alpha", correct: "true" }] }],
    ["/answers", { results: [], lesson: { id: "core-0-alpha" } }],
    ["/answers", { results: [{ concept: "__proto__", correct: true }] }],
    ["/answers", { results: [{ concept: "constructor", correct: true }] }],
    ["/answers", { results: [{ concept: "Not An Id", correct: true }] }],
    ["/answers", { results: [], lesson: { id: "__proto__", score: 1 } }],
    ["/answers", { results: [], lesson: { id: "constructor", score: 1 } }],
    ["/answers", { results: [], lesson: { id: "core-0-alpha", score: 2 } }],
    ["/answers", "{not json"],
    ["/placement", {}],
    ["/placement", { level: "1" }],
    ["/placement", { level: 9 }],
  ];
  for (const [route, body] of cases) {
    const { status, json } = await call("POST", route, body);
    assert.equal(status, 400, `${route} ${JSON.stringify(body)}`);
    assert.ok(json.error && json.error.length > 5, `${route} ${JSON.stringify(body)} has a message`);
  }
  assert.equal(fs.existsSync(progressFile()), false);
});

test("wrong methods and unknown routes are refused", async () => {
  assert.equal((await call("POST", "", {})).status, 405);
  assert.equal((await call("GET", "/answers")).status, 405);
  assert.equal((await call("GET", "/reset")).status, 405);
  assert.equal((await call("POST", "/nope", {})).status, 404);
});

test("placement marks earlier levels mastered and saves", async () => {
  const { status, json } = await call("POST", "/placement", { level: 1 });
  assert.equal(status, 200);
  assert.equal(json.progress.placedLevel, 1);
  assert.deepEqual(Object.keys(json.progress.concepts).sort(), ["alpha", "beta"]);
  assert.equal(json.progress.concepts.alpha.box, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(progressFile(), "utf8")), json.progress);
});

test("a corrupt file is moved aside, never overwritten, and the reply says so", async () => {
  for (const junk of ["{ this is not json", JSON.stringify({ version: 1, concepts: [] }), JSON.stringify({ version: 2, concepts: {}, lessons: {}, placedLevel: 0 })]) {
    fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(progressFile()), { recursive: true });
    fs.writeFileSync(progressFile(), junk);
    const { status, json } = await call("POST", "/answers", { results: [{ concept: "alpha", correct: true }] });
    assert.equal(status, 200);
    assert.equal(json.recovered, true);
    assert.equal(json.progress.concepts.alpha.attempts, 1);
    const files = profileFiles();
    const aside = files.filter((f) => f.startsWith("progress.corrupt-"));
    assert.equal(aside.length, 1, files.join(", "));
    assert.equal(json.recoveredTo, path.join(path.dirname(progressFile()), aside[0]), "the reply says where the old file went");
    assert.equal(fs.readFileSync(path.join(path.dirname(progressFile()), aside[0]), "utf8"), junk);
    const next = await call("GET", "");
    assert.equal(next.json.recovered, undefined, "only the request that found the damage reports it");
    assert.equal(next.json.progress.concepts.alpha.attempts, 1);
  }
});

test("one bad entry costs that entry, not the whole file", async () => {
  await call("POST", "/answers", { results: [true, true, true, true].map((correct) => ({ concept: "alpha", correct })), lesson: { id: "core-0-alpha", score: 1 } });
  await call("POST", "/answers", { results: [{ concept: "beta", correct: true }, { concept: "gamma", correct: true }] });
  const good = JSON.parse(fs.readFileSync(progressFile(), "utf8")) as Progress;
  // A hand edit: one number quoted (still a number), one entry wrecked.
  const edited = { ...good, concepts: { ...good.concepts, alpha: { ...good.concepts.alpha, attempts: "4" }, beta: { ...good.concepts.beta, box: "soon" } } };
  const text = JSON.stringify(edited);
  fs.writeFileSync(progressFile(), text);
  const { json } = await call("POST", "/answers", { results: [{ concept: "gamma", correct: true }] });
  assert.equal(json.recovered, true);
  assert.equal(json.progress.concepts.alpha.attempts, 4, "the quoted number is read as a number");
  assert.equal(json.progress.concepts.alpha.box, 1, "alpha kept its place in review");
  assert.equal(json.progress.concepts.beta, undefined, "the unreadable entry is dropped");
  assert.equal(json.progress.concepts.gamma.attempts, 2);
  assert.equal(json.progress.lessons["core-0-alpha"].runs, 1, "lessons survive");
  assert.equal(fs.readFileSync(json.recoveredTo!, "utf8"), text, "the original is kept beside it, untouched");
  assert.equal((await call("GET", "")).json.recovered, undefined, "reported once");
});

test("reset archives the old file and starts empty", async () => {
  await call("POST", "/answers", { results: [{ concept: "alpha", correct: true }] });
  const old = fs.readFileSync(progressFile(), "utf8");
  const { status, json } = await call("POST", "/reset", {});
  assert.equal(status, 200);
  assert.deepEqual(json.progress.concepts, {});
  const archived = profileFiles().filter((f) => f.startsWith("progress.reset-"));
  assert.equal(archived.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(progressFile()), archived[0]), "utf8"), old);
  assert.deepEqual((await call("GET", "")).json.progress.concepts, {});
});

test("while the curriculum cannot be read, answers are recorded rather than thrown away", async () => {
  const curriculum = path.join(tmp, "content", "curriculum.yaml");
  const lessonFile = path.join(tmp, "content", "lessons", "core", "0-01-alpha.md");
  const goodCurriculum = fs.readFileSync(curriculum, "utf8");
  const goodLesson = fs.readFileSync(lessonFile, "utf8");
  try {
    // curriculum.yaml broken (a bad tutor edit, a half-saved file): there are
    // no concept ids to check against, so what the learner answered is kept.
    fs.writeFileSync(curriculum, "tracks: [oops\n  - not yaml");
    const broken = await call("POST", "/answers", { results: [{ concept: "alpha", correct: true }, { concept: "gamma", correct: false }], lesson: { id: "core-0-alpha", score: 1 } });
    assert.equal(broken.status, 200);
    assert.equal(broken.json.dropped, 0);
    assert.equal(broken.json.lessonDropped, false);
    assert.deepEqual(Object.keys(broken.json.progress.concepts).sort(), ["alpha", "gamma"]);
    assert.equal(broken.json.progress.lessons["core-0-alpha"].runs, 1);

    // The curriculum loads but has a lesser problem (a lesson is refused, a
    // track is listed twice): the id lists are intact, so they are used. A
    // made-up concept or lesson is not stored just because something
    // somewhere is wrong.
    fs.writeFileSync(curriculum, goodCurriculum.replace("  - { id: core, title: Core }", "  - { id: core, title: Core }\n  - { id: core, title: Again }"));
    fs.writeFileSync(lessonFile, goodLesson.replace("concepts: [alpha]", "concepts: [nothing]"));
    const refused = await call("POST", "/answers", { results: [{ concept: "beta", correct: true }, { concept: "no-such-concept", correct: true }], lesson: { id: "totally-bogus", score: 0.5 } });
    assert.equal(refused.json.dropped, 1);
    assert.equal(refused.json.lessonDropped, true);
    assert.equal(refused.json.progress.lessons["totally-bogus"], undefined);
    assert.equal(refused.json.progress.concepts.beta.attempts, 1);
    assert.equal(refused.json.progress.concepts["no-such-concept"], undefined);
  } finally {
    fs.writeFileSync(curriculum, goodCurriculum);
    fs.writeFileSync(lessonFile, goodLesson);
  }
});

// ---- repair: numbers out of range -------------------------------------------

test("repair brings every number inside the range the rules assume", () => {
  const now = new Date("2026-03-01T12:00:00Z");
  const good = { recent: [true, true, false, true], attempts: 4, correct: 3, mastery: 0.7, box: 1, dueAt: "2026-03-02T07:00:00.000Z", lastSeenAt: "2026-03-01T10:00:00.000Z" };
  const file = (concepts: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, profile: "default", concepts, lessons: {}, placedLevel: 0, openedLevel: 0, updatedAt: "2026-03-01T10:00:00.000Z", ...extra });
  const fix = (cp: Record<string, unknown>) => {
    const r = repairProgress(file({ x: { ...good, ...cp } }), now)!;
    assert.equal(r.changed, true, JSON.stringify(cp));
    return r.progress.concepts.x;
  };
  assert.equal(repairProgress(file({ x: good }), now)!.changed, false, "a sound file is left alone");

  assert.equal(fix({ attempts: -3 }).attempts, 4, "never fewer attempts than answers on record");
  assert.equal(fix({ attempts: 4.7 }).attempts, 4);
  assert.equal(fix({ correct: 99 }).correct, 4, "correct ≤ attempts");
  assert.equal(fix({ correct: -1 }).correct, 3, "correct ≥ the right answers on record");
  assert.equal(fix({ mastery: 7 }).mastery, 1);
  assert.equal(fix({ mastery: -0.5 }).mastery, 0);
  assert.equal(fix({ box: 99 }).box, 7, "the top box is the ceiling");
  assert.equal(fix({ box: 2.5 }).box, 2);
  const neg = fix({ box: -1 });
  assert.deepEqual([neg.box, neg.dueAt], [0, null], "below the first box is still learning, with no due date");
  assert.equal(fix({ box: 0 }).dueAt, null, "a concept still being learned has no due date");
  assert.equal(fix({ dueAt: null }).dueAt, now.toISOString(), "in review with no date would never come round: due now");
  const far = Date.parse(fix({ dueAt: "9999-01-01T00:00:00.000Z" }).dueAt!);
  assert.ok(far > now.getTime() && far <= now.getTime() + 122 * 86_400_000, "a due date beyond the longest interval is pulled in");
  assert.equal(fix({ lastSeenAt: "last Tuesday-ish" }).lastSeenAt, null);
  assert.equal(fix({ lastSeenAt: 12 }).lastSeenAt, null);
  assert.equal(fix({ recent: Array(40).fill(true), attempts: 40, correct: 40 }).recent.length, 12, "recent keeps the window");
  assert.deepEqual(fix({ recent: [true, "yes", 1, false] }).recent, [true, false]);

  // Entries that cannot be read at all are dropped; the rest stays.
  const mixed = repairProgress(file({ x: good, y: { ...good, dueAt: "soon" }, z: { ...good, attempts: null }, w: "nope" }), now)!;
  assert.deepEqual([Object.keys(mixed.progress.concepts), mixed.changed], [["x"], true]);

  const lessons = (lp: unknown) => repairProgress({ ...file({}), lessons: { l: lp } }, now)!;
  assert.deepEqual(lessons({ completedAt: "2026-02-01T00:00:00.000Z", bestScore: 3, runs: 0 }).progress.lessons.l, { completedAt: "2026-02-01T00:00:00.000Z", bestScore: 1, runs: 1 });
  assert.equal(lessons({ completedAt: "2026-02-01T00:00:00.000Z", bestScore: -1, runs: 2.9 }).progress.lessons.l.bestScore, 0);
  assert.deepEqual(lessons({ completedAt: "whenever", bestScore: 1, runs: 1 }).progress.lessons, {}, "no usable completion date: dropped");

  for (const [raw, want] of [[-2, 0], [1.9, 1], [1e9, 0], ["2", 2], [null, 0], [Infinity, 0]] as const) {
    const r = repairProgress(file({}, { placedLevel: raw, openedLevel: raw }), now)!;
    assert.deepEqual([r.progress.placedLevel, r.progress.openedLevel, r.changed], [want, want, true], String(raw));
  }
  const { openedLevel: _o, ...old } = file({ x: good });
  const upgraded = repairProgress(old, now)!;
  assert.deepEqual([upgraded.progress.openedLevel, upgraded.changed], [0, false], "a file from before openedLevel is not damage");
  const dated = repairProgress(file({}, { updatedAt: 5 }), now)!;
  assert.deepEqual([dated.progress.updatedAt, dated.changed], [now.toISOString(), true]);
  assert.equal(repairProgress([], now), null);
  assert.equal(repairProgress(file({}, { version: 2 }), now), null);
});

test("an out-of-range file is repaired on load, kept aside, and usable afterwards", async () => {
  await call("POST", "/answers", { results: [true, true, true, true].map((correct) => ({ concept: "alpha", correct })) });
  const good = JSON.parse(fs.readFileSync(progressFile(), "utf8")) as Progress;
  const text = JSON.stringify({ ...good, concepts: { alpha: { ...good.concepts.alpha, box: 40, attempts: -9, dueAt: "9999-01-01T00:00:00.000Z" } } });
  fs.writeFileSync(progressFile(), text);
  const { status, json } = await call("POST", "/answers", { results: [{ concept: "alpha", correct: true }] });
  assert.equal(status, 200);
  assert.equal(json.recovered, true);
  const a = json.progress.concepts.alpha;
  assert.deepEqual([a.box, a.attempts], [7, 5]);
  assert.ok(Date.parse(a.dueAt!) < Date.now() + 125 * 86_400_000);
  assert.equal(fs.readFileSync(json.recoveredTo!, "utf8"), text);
});

// ---- the opened-level record ---------------------------------------------------

test("the highest open level is recorded with answers, placement and a later GET, and holds when the curriculum grows", async () => {
  const dir = path.join(tmp, "content");
  const drilled = (id: string, level: number, concept: string) => LESSON.replace("core-0-alpha", id).replace("level: 0", `level: ${level}`).replace("concepts: [alpha]", `concepts: [${concept}]`).replace("summary: About alpha.", `summary: About it.\nexercises:\n  - { kind: quiz, concept: ${concept}, count: 1, questions: [{ q: "Yes?", choices: ["yes", "no"], answer: 1, explain: "Yes." }] }`);
  const files = { "0-02-a.md": drilled("core-0-a", 0, "alpha"), "0-03-b.md": drilled("core-0-b", 0, "beta") };
  try {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, "lessons", "core", name), text);
    const fresh = await call("GET", "");
    assert.equal(fresh.json.progress.openedLevel, 0);
    assert.equal(fs.existsSync(progressFile()), false, "GET still writes nothing for a new learner");
    const four = (concept: string) => [true, true, true, true].map((correct) => ({ concept, correct }));
    let r = await call("POST", "/answers", { results: four("alpha") });
    assert.equal(r.json.progress.openedLevel, 0, "1 of 2 drilled level-0 concepts: level 1 is still shut");
    r = await call("POST", "/answers", { results: four("beta") });
    assert.ok((r.json.progress.openedLevel ?? 0) >= 1, "level 1 opened and that is on record");
    assert.equal((JSON.parse(fs.readFileSync(progressFile(), "utf8")) as Progress).openedLevel, r.json.progress.openedLevel);

    // A file from before the field: the next GET notes what is open.
    const { openedLevel: _o, ...old } = r.json.progress;
    fs.writeFileSync(progressFile(), JSON.stringify(old));
    const got = await call("GET", "");
    assert.equal(got.json.recovered, undefined);
    assert.ok((got.json.progress.openedLevel ?? 0) >= 1);
    assert.ok(((JSON.parse(fs.readFileSync(progressFile(), "utf8")) as Progress).openedLevel ?? 0) >= 1);

    fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
    const placed = await call("POST", "/placement", { level: 2 });
    assert.equal(placed.json.progress.openedLevel, 2);
  } finally {
    for (const name of Object.keys(files)) fs.rmSync(path.join(dir, "lessons", "core", name), { force: true });
  }
});
