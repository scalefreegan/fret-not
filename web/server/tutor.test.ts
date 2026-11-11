// The tutor's pure parts: prompts, context scrubbing, the before/after
// problem diff, the history store and the auto-commit. Nothing here spawns
// `claude`; the store and the commits run against temp directories.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Content } from "../shared/content.ts";
import { startersFor } from "../src/tutor/starters.ts";
import { contextNote, fixPrompt, historyPrompt, historyWindow, interruptedNote, lostIds, newProblems, readOnlyBrief, remainingNote, sanitizeContext, systemPrompt, turnProblems } from "./chat.ts";
import { REPO_ROOT } from "./loader.ts";
import { commitSubject, heldNote, isContentFile, readOnlyNote, strayWrites, unsafePaths } from "./turn.ts";
import { appendHistory, clearHistory, dataDir, getModel, readHistory, setModel } from "./store.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-tutor-"));
const realData = path.join(REPO_ROOT, "data");

before(() => {
  process.env.FRET_DATA_DIR = path.join(tmp, "data");
  // A precondition, not a test: if the override did not take, stop the file
  // before anything writes to the real data/.
  if (dataDir() === realData || !dataDir().startsWith(tmp)) throw new Error("FRET_DATA_DIR override did not take");
});
after(() => {
  delete process.env.FRET_DATA_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const content: Content = {
  tracks: [{ id: "core", title: "How music works", summary: "" }, { id: "guitar", title: "Guitar", summary: "", instrument: "guitar" }],
  levels: [
    { id: 0, title: "Sound", summary: "", status: "written", topics: [] },
    { id: 4, title: "Keys and harmony", summary: "", status: "outline", topics: ["Cadences"] },
  ],
  concepts: [{ id: "octave", title: "The octave", level: 0, track: "core", requires: [] }],
  instruments: [],
  lessons: [{ id: "core-0-octave", title: "The octave", track: "core", level: 0, order: 7, concepts: ["octave"], summary: "s", blocks: [], exercises: [], file: "lessons/core/0-07-octave.md" }],
  problems: [{ file: "lessons/core/0-99-x.md", message: "unknown widget type \"foo\"" }],
};

test("system prompt: the two jobs, the sandbox rules, and the curriculum as it is", () => {
  const p = systemPrompt(content, "/repo");
  assert.match(p, /adult beginner/);
  assert.match(p, /docs\/CONTENT\.md/);
  assert.match(p, /docs\/CONTENT-REFERENCE\.md/);
  assert.match(p, /only under content\//);
  assert.match(p, /Never change the `id`/);
  assert.match(p, /public domain/);
  assert.match(p, /content\/curriculum\.yaml FIRST/);
  assert.match(p, /no shell/);
  assert.match(p, /Do not run git/);
  assert.match(p, /private copy of the repository \(\/repo\)/);
  assert.match(p, /Changed:/);
  assert.match(p, /never tell the learner whether an answer/); // it does not grade
  assert.match(p, /core-0-octave \[core\] "The octave" — content\/lessons\/core\/0-07-octave\.md/);
  assert.match(p, /Level 4 — "Keys and harmony" \(outline only/);
  assert.match(p, /· Cadences/);
  assert.match(p, /octave \(L0, core\)/);
  assert.match(p, /currently refuses[\s\S]*0-99-x\.md: unknown widget/);
  assert.match(p, /\(\/repo\)/);
  assert.doesNotMatch(systemPrompt({ ...content, problems: [] }), /currently refuses/);
});

test("context is rebuilt field by field, never trusted", () => {
  assert.deepEqual(sanitizeContext(undefined), { page: "home" });
  assert.deepEqual(sanitizeContext({ page: "nope", lab: 3 }), { page: "home" });
  const ctx = sanitizeContext({
    page: "lesson",
    lesson: { id: "core-0-octave", title: "The\noctave  ", file: "lessons/core/0-07-octave.md", concepts: ["octave", "BAD ID", 7] },
    recent: [...Array.from({ length: 14 }, (_, i) => ({ prompt: `q${i}`, concept: "octave", correct: i % 2 === 0, explain: "e" })), "junk", { prompt: "" }],
    extra: "ignored",
  });
  assert.deepEqual(ctx.lesson, { id: "core-0-octave", title: "The octave", file: "lessons/core/0-07-octave.md", concepts: ["octave"] });
  // Non-objects go first, then the last ten are kept, then any without a
  // prompt are dropped: q5…q13.
  assert.equal(ctx.recent?.length, 9);
  assert.equal(ctx.recent?.[0].prompt, "q5");
  assert.equal(ctx.recent?.at(-1)?.prompt, "q13");
  assert.equal(ctx.recent?.at(-1)?.correct, false);
  assert.ok(!("extra" in ctx));
  // A file that is not a lesson path is dropped (the hint, not the lesson).
  for (const file of ["../../etc/passwd", "lessons/../../secrets.md", "/abs/lessons/x.md", "web/src/App.tsx", "lessons/core/x.md; rm -rf"]) {
    assert.equal(sanitizeContext({ page: "lesson", lesson: { id: "a", title: "t", file } }).lesson?.file, "", file);
  }
  assert.equal(sanitizeContext({ page: "lesson", lesson: { id: "Bad Id", title: "t", file: "lessons/x.md" } }).lesson, undefined);
  // The page sends the path relative to the repo (web/src/App.tsx:
  // `content/${lesson.file}`); the loader's own shape is relative to content/.
  // Both are the same file and both are kept, in the loader's spelling.
  const fromPage = sanitizeContext({ page: "lesson", lesson: { id: "core-0-octave", title: "The octave", file: "content/lessons/core/0-07-octave.md", concepts: ["octave"] } });
  assert.equal(fromPage.lesson?.file, "lessons/core/0-07-octave.md");
  assert.match(contextNote(fromPage), /— file content\/lessons\/core\/0-07-octave\.md —/);
  for (const file of ["content/../lessons/x.md", "content/content/lessons/x.md", "content/web/x.md", "content/lessons/../../x.md"]) {
    assert.equal(sanitizeContext({ page: "lesson", lesson: { id: "a", title: "t", file } }).lesson?.file, "", file);
  }
  assert.equal(sanitizeContext({ page: "lab", lab: "x".repeat(500) }).lab?.length, 60);
});

test("context note and history prompt", () => {
  const ctx = sanitizeContext({
    page: "lesson",
    lesson: { id: "core-0-octave", title: "The octave", file: "lessons/core/0-07-octave.md", concepts: ["octave"] },
    recent: [{ prompt: "Which is higher?", concept: "octave", correct: false, explain: "The second, by an octave." }],
  });
  const note = contextNote(ctx);
  assert.match(note, /on a lesson/);
  assert.match(note, /core-0-octave "The octave" — file content\/lessons\/core\/0-07-octave\.md — concepts: octave/);
  assert.match(note, /WRONG \[octave\] "Which is higher\?" → shown afterwards: "The second, by an octave\."/);
  assert.match(contextNote({ page: "lab", lab: "Sound lab" }), /Lab explorer open: Sound lab/);

  const p = historyPrompt(
    [
      { role: "user", text: "hi", ts: "" },
      { role: "assistant", text: "hello", ts: "" },
      { role: "commit", text: "abc1234: added lesson x", ts: "" },
      { role: "note", text: "refused: y", ts: "" },
    ],
    "why?",
    ctx,
    "2026-11-10",
  );
  assert.match(p, /^Conversation so far:\n\n\[USER\]\nhi\n\n\[ASSISTANT\]\nhello\n\n\[SYSTEM\]\nCommitted abc1234: added lesson x\n\n\[SYSTEM\]\nrefused: y\n\n---/);
  assert.match(p, /\[CONTEXT\]\nThe learner is on a lesson\.[\s\S]*\[USER\]\nwhy\?\n\n\[ASSISTANT\]\nRespond to the latest user message\. Today is 2026-11-10\.$/);
  assert.doesNotMatch(historyPrompt([], "x", { page: "home" }), /Conversation so far/);
});

test("problem diff: only what the turn introduced", () => {
  const a = { file: "lessons/a.md", message: "bad widget" };
  const b = { file: "lessons/b.md", message: "bad widget" };
  const a2 = { file: "lessons/a.md", message: "another" };
  assert.deepEqual(newProblems([a], [a]), []);
  assert.deepEqual(newProblems([a], [a, b, a2]), [b, a2]);
  assert.deepEqual(newProblems([a, b], []), []); // the turn fixed old problems: nothing to answer for
  assert.deepEqual(newProblems([], [a]), [a]);

  const fix = fixPrompt([{ role: "user", text: "add a lesson", ts: "" }, { role: "assistant", text: "Done.\nChanged: added x.", ts: "" }], [b, a2]);
  assert.match(fix, /REFUSES/);
  assert.match(fix, /- content\/lessons\/b\.md: bad widget\n- content\/lessons\/a\.md: another/);
  assert.match(fix, /only follow-up turn/);
  assert.match(fix, /\[ASSISTANT\]\nDone\./);
  const rem = remainingNote([b, a2]);
  assert.match(rem, /2 files/);
  assert.match(rem, /content\/lessons\/b\.md: bad widget/);
  assert.match(rem, /thrown away/);
  assert.match(rem, /your curriculum was never touched and nothing was committed/);
  assert.match(remainingNote([a, a2]), /one file/);
  assert.equal(interruptedNote("cancelled", false), "The tutor's turn did not finish (cancelled). Your curriculum was not touched and nothing was committed.");
  assert.equal(interruptedNote("timed out", true), "The tutor's turn did not finish (timed out). Whatever it had written so far was in a separate copy and has been thrown away; your curriculum was not touched and nothing was committed.");
});

test("ids that were live before the turn and are gone after it are problems", () => {
  const withIds = (lessons: [string, string][], concepts: string[], problems: Content["problems"] = []): Content => ({
    ...content,
    lessons: lessons.map(([id, file]) => ({ ...content.lessons[0], id, file })),
    concepts: concepts.map((id) => ({ ...content.concepts[0], id })),
    problems,
  });
  const before = withIds([["l-a", "lessons/a.md"], ["l-b", "lessons/b.md"]], ["x", "y", "z"]);
  assert.deepEqual(lostIds(before, before), []);
  assert.deepEqual(lostIds(before, withIds([["l-a", "lessons/a.md"], ["l-b", "lessons/b.md"], ["l-c", "lessons/c.md"]], ["x", "y", "z", "w"])), [], "adding is fine");
  // Renamed in place, and one concept dropped.
  const renamed = lostIds(before, withIds([["l-a2", "lessons/a.md"], ["l-b", "lessons/b.md"]], ["x", "z"]));
  assert.equal(renamed.length, 2);
  assert.deepEqual(renamed[0].file, "lessons/a.md");
  assert.match(renamed[0].message, /lesson id "l-a" no longer exists/);
  assert.deepEqual(renamed[1].file, "curriculum.yaml");
  assert.match(renamed[1].message, /concept id removed or renamed: y\./);
  assert.match(lostIds(before, withIds([["l-a", "lessons/a.md"], ["l-b", "lessons/b.md"]], []))[0].message, /concept ids removed or renamed: x, y, z\./);
  // The file kept its id but moved: the id still exists, nothing lost.
  assert.deepEqual(lostIds(before, withIds([["l-a", "lessons/moved.md"], ["l-b", "lessons/b.md"]], ["x", "y", "z"])), []);
  // A lesson the loader now refuses is reported once, by the loader's problem.
  const refused = withIds([["l-b", "lessons/b.md"]], ["x", "y", "z"], [{ file: "lessons/a.md", message: "bad widget" }]);
  assert.deepEqual(lostIds(before, refused), []);
  assert.deepEqual(turnProblems(before, refused), [{ file: "lessons/a.md", message: "bad widget" }]);
  // A deleted lesson file has no loader problem: the id check is what catches it.
  assert.equal(turnProblems(before, withIds([["l-b", "lessons/b.md"]], ["x", "y", "z"])).length, 1);
  // A file that still LOADS under another id is a rename even when the loader
  // also has a lesser complaint about that file (it did not refuse it).
  const renamedWithWarning = withIds([["l-a-renamed", "lessons/a.md"], ["l-b", "lessons/b.md"]], ["x", "y", "z"], [{ file: "lessons/a.md", message: 'mirrors "nope" is not a lesson id' }]);
  assert.match(lostIds(before, renamedWithWarning)[0].message, /lesson id "l-a" no longer exists/);
  // curriculum.yaml unreadable afterwards: nothing to compare concepts with;
  // the loader's own problem with the file is what the turn answers for.
  assert.deepEqual(lostIds(before, withIds([["l-a", "lessons/a.md"], ["l-b", "lessons/b.md"]], [], [{ file: "curriculum.yaml", message: "bad yaml" }])), []);
});

test("which changed paths are curriculum files, and which are strays", () => {
  for (const ok of ["curriculum.yaml", "instruments/guitar.yaml", "lessons/core/0-01-a.md", "lessons/deep/er/x.md"]) assert.ok(isContentFile(ok), ok);
  for (const no of ["README.md", "notes.txt", "instruments/guitar.yml", "instruments/sub/x.yaml", "lessons/core/a.txt", "lessons/core/image.png", "curriculum.yaml.bak", "lessons.md"]) assert.ok(!isContentFile(no), no);

  const dir = path.join(tmp, "stray", "content");
  fs.mkdirSync(path.join(dir, "lessons", "core", "folder.md"), { recursive: true });
  fs.writeFileSync(path.join(dir, "lessons", "core", "a.md"), "x\n");
  const bad = strayWrites({ content: dir }, [
    ...["lessons/core/a.md", "lessons/core/gone.md", ".git/config", "lessons/.gitignore", "lessons/.hidden/x.md", "notes.txt", "lessons/core/pic.png", "lessons/core/folder.md"].map((p) => ({ path: p, ignored: false })),
    { path: "lessons/core/ignored.md", ignored: true },
  ]);
  assert.deepEqual(bad.map((p) => p.file), [".git/config", "lessons/.gitignore", "lessons/.hidden/x.md", "notes.txt", "lessons/core/pic.png", "lessons/core/folder.md", "lessons/core/ignored.md"]);
  assert.match(bad[6].message, /ignore/);
  assert.match(bad[0].message, /starts with a dot/);
  assert.match(bad[3].message, /not a curriculum file/);
  assert.match(bad[5].message, /regular file/);

  // Links and nested repositories in content/ are found wherever they are.
  fs.symlinkSync(path.join(tmp, "outside-target"), path.join(dir, "lessons", "link"));
  fs.mkdirSync(path.join(dir, "lessons", "core", ".git"));
  assert.deepEqual(unsafePaths(dir).sort(), ["lessons/core/.git", "lessons/link"]);
});

test("what the learner is told about a read-only turn and a commit that was kept", () => {
  const why = { ok: false as const, reason: "content/ has changes that are not committed (content/lessons/core/x.md)", fix: "Commit them, then ask again." };
  assert.equal(readOnlyNote(why), "The tutor can answer questions right now but cannot write lessons, because content/ has changes that are not committed (content/lessons/core/x.md). Commit them, then ask again.");
  assert.match(readOnlyBrief(why), /READ-ONLY[\s\S]*no Write or Edit tool[\s\S]*not committed[\s\S]*Commit them, then ask again\./);
  const held = heldNote({ branch: "refs/heads/main", spec: "content" }, "0123456789abcdef0123", "added lesson x", { ref: "refs/tutor/17-ab", reason: "main gained or lost commits while the tutor was working" });
  assert.match(held, /NOT put into your files, because main gained or lost commits/);
  assert.match(held, /Nothing in your working tree was touched/);
  assert.match(held, /commit 0123456789 under the name refs\/tutor\/17-ab/);
  assert.match(held, /`git merge --ff-only refs\/tutor\/17-ab`/);
  assert.match(held, /`git cherry-pick refs\/tutor\/17-ab`/);
  assert.match(held, /`git update-ref -d refs\/tutor\/17-ab`/);
});

test("the replayed history is bounded by count and by bytes", () => {
  const m = (text: string): { role: "user"; text: string; ts: string } => ({ role: "user", text, ts: "" });
  const many = Array.from({ length: 100 }, (_, i) => m(`m${i}`));
  assert.deepEqual(historyWindow(many).map((x) => x.text), many.slice(-40).map((x) => x.text));
  assert.deepEqual(historyWindow(many, 3).map((x) => x.text), ["m97", "m98", "m99"]);
  // Bytes, not characters: twenty 20,000-character messages of a three-byte
  // character are 1.2 MB, and only what fits in the budget is replayed.
  const big = Array.from({ length: 20 }, () => m("♯".repeat(20_000)));
  const kept = historyWindow(big);
  assert.equal(kept.length, 2);
  assert.ok(kept.reduce((n, x) => n + Buffer.byteLength(x.text), 0) <= 150_000);
  // One oversized message ends the walk: the tail stays contiguous.
  assert.deepEqual(historyWindow([m("old"), m("x".repeat(200_000)), m("new")]).map((x) => x.text), ["new"]);
  assert.deepEqual(historyWindow([]), []);
});

test("commit subject comes from the Changed: line", () => {
  assert.equal(commitSubject("I added it.\n\nChanged: added lesson core-3-blues-scale (level 3)."), "added lesson core-3-blues-scale (level 3).");
  assert.equal(commitSubject("Changed: first.\nmore prose\n- **Changed:** second thing"), "second thing");
  assert.equal(commitSubject("Just prose with no marker.\nEdited the octave lesson."), "Edited the octave lesson.");
  assert.equal(commitSubject(""), "content edited");
  assert.equal(commitSubject(`Changed: ${"x".repeat(200)}`).length, 72);
});

test("history store: append, read, torn lines, clear, model setting", () => {
  assert.deepEqual(readHistory(), []);
  appendHistory({ role: "user", text: "hi", ts: "t1" });
  appendHistory({ role: "note", text: "refused", ts: "t2" });
  fs.appendFileSync(path.join(dataDir(), "chat.jsonl"), '{"role":"weird","text":"x"}\n{"role":"assistant","text":"tor');
  assert.deepEqual(readHistory(), [{ role: "user", text: "hi", ts: "t1" }, { role: "note", text: "refused", ts: "t2" }]);
  clearHistory();
  clearHistory(); // idempotent
  assert.deepEqual(readHistory(), []);

  assert.equal(getModel(), "claude-sonnet-5-5");
  fs.writeFileSync(path.join(dataDir(), "settings.json"), JSON.stringify({ model: "gpt-9", other: 1 }));
  assert.equal(getModel(), "claude-sonnet-5-5"); // a stale id never reaches the CLI
  assert.equal(setModel("claude-opus-5-5"), "claude-opus-5-5");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir(), "settings.json"), "utf8")), { model: "claude-opus-5-5", other: 1 });
  assert.throws(() => setModel("nope"), /unknown model/);
  assert.deepEqual(fs.readdirSync(dataDir()).filter((f) => f.endsWith(".tmp")), [], "settings are written by rename, with no temp file left");

  // The transcript is trimmed to its newest messages once it grows large.
  clearHistory();
  for (let i = 0; i < 30; i++) appendHistory({ role: "user", text: `${i}:${"x".repeat(100)}`, ts: "" }, { maxBytes: 2000, keepBytes: 1000 });
  const kept = readHistory();
  assert.ok(fs.statSync(path.join(dataDir(), "chat.jsonl")).size <= 2000);
  assert.ok(kept.length >= 5 && kept.length < 30, String(kept.length));
  assert.match(kept.at(-1)!.text, /^29:/);
  assert.deepEqual(kept.map((m) => Number(m.text.split(":")[0])), Array.from({ length: kept.length }, (_, i) => 30 - kept.length + i), "a contiguous tail, oldest first");
  // One message bigger than the whole budget is still kept (never an empty file).
  appendHistory({ role: "assistant", text: "y".repeat(5000), ts: "" }, { maxBytes: 2000, keepBytes: 1000 });
  assert.deepEqual(readHistory().map((m) => m.text.length), [5000]);
  clearHistory();
  assert.ok(!fs.existsSync(path.join(realData, "chat.jsonl")) || fs.statSync(path.join(realData, "chat.jsonl")).mtimeMs < Date.now() - 1000, "the real data/ was not written");
});

test("starter prompts fit the page", () => {
  const lesson = { id: "core-0-octave", title: "The octave", file: "lessons/core/0-07-octave.md", concepts: ["octave"] };
  const onLesson = startersFor({ page: "lesson", lesson });
  assert.deepEqual(onLesson.map((s) => s.label), ["Explain this another way", "Three more practice questions", "Write a follow-up lesson on…"]);
  assert.match(onLesson[0].text, /"The octave"/);
  assert.equal(onLesson[2].send, false);
  const missed = startersFor({ page: "lesson", lesson, recent: [{ prompt: "Q1", concept: "octave", correct: false, explain: "" }, { prompt: "Q2", concept: "octave", correct: true, explain: "" }] });
  assert.equal(missed[0].label, "Why was my last answer wrong?");
  assert.match(missed[0].text, /"Q1"/);
  assert.equal(missed.length, 3);
  for (const page of ["home", "review", "lab", "sketchpad", "placement"] as const) {
    const s = startersFor({ page });
    assert.ok(s.length >= 2 && s.length <= 3, page);
  }
});
