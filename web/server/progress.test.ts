import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { Progress } from "../shared/progress.ts";
import { contentDir, REPO_ROOT } from "./loader.ts";
import { dataDir, handleProgress } from "./progress.ts";
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

async function call(method: string, route: string, body?: unknown): Promise<{ status: number; json: { progress: Progress; recovered?: boolean; error?: string } }> {
  const res = await fetch(`${base}/api/progress${route}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, json: (await res.json()) as { progress: Progress; recovered?: boolean; error?: string } };
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

  const again = await call("POST", "/answers", { results: [], lesson: { id: "not-a-lesson", score: 1 } });
  assert.deepEqual(Object.keys(again.json.progress.lessons), ["core-0-alpha"]);

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
    assert.equal(fs.readFileSync(path.join(path.dirname(progressFile()), aside[0]), "utf8"), junk);
    const next = await call("GET", "");
    assert.equal(next.json.recovered, undefined, "only the request that found the damage reports it");
    assert.equal(next.json.progress.concepts.alpha.attempts, 1);
  }
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
