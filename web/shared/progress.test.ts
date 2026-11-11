import assert from "node:assert/strict";
import { test } from "node:test";
import type { Concept, Content, Lesson, Level } from "./content.ts";
import * as P from "./progress.ts";

const T0 = new Date("2026-11-10T12:00:00.000Z");
const days = (n: number, from: Date = T0) => new Date(from.getTime() + n * 86_400_000);
const ans = (concept: string, ...correct: boolean[]): P.AnswerResult[] => correct.map((c) => ({ concept, correct: c }));
const fresh = () => P.emptyProgress("default", T0);

const level = (id: number, status: Level["status"] = "written"): Level => ({ id, title: `L${id}`, summary: "", status, topics: [] });
const concept = (id: string, lvl: number, track = "core"): Concept => ({ id, title: id, level: lvl, track, requires: [] });
const lesson = (id: string, lvl: number, concepts: string[]): Lesson => ({ id, title: id, track: "core", level: lvl, order: 1, concepts, summary: "", blocks: [], exercises: [], file: `${id}.md` });

const content: Pick<Content, "levels" | "concepts" | "lessons"> = {
  levels: [level(0), level(1), level(2), level(3, "outline")],
  concepts: [concept("a", 0), concept("b", 0), concept("c", 0, "piano"), concept("d", 1), concept("e", 2)],
  lessons: [lesson("l0a", 0, ["a"]), lesson("l0b", 0, ["b", "c"]), lesson("l1", 1, ["d"]), lesson("l2", 2, ["e"])],
};

/** Answer correctly until the concept enters review. */
function master(p: P.Progress, id: string, now: Date): P.Progress {
  return P.recordAnswers(p, ans(id, true, true, true, true), now);
}

test("mastery is recency-weighted, rises with right answers and falls with wrong ones", () => {
  assert.equal(P.masteryOf([]), 0);
  assert.equal(P.masteryOf([true, true]), 1);
  assert.ok(P.masteryOf([false, true]) > P.masteryOf([true, false]), "the newest answer counts most");
  let p = P.recordAnswers(fresh(), ans("a", false, false), T0);
  const low = p.concepts.a.mastery;
  p = P.recordAnswers(p, ans("a", true, true), T0);
  const mid = p.concepts.a.mastery;
  assert.ok(mid > low);
  p = P.recordAnswers(p, ans("a", false), T0);
  assert.ok(p.concepts.a.mastery < mid);
  assert.equal(p.concepts.a.attempts, 5);
  assert.equal(p.concepts.a.correct, 2);
  assert.equal(p.concepts.a.lastSeenAt, T0.toISOString());
});

test("recent keeps only the last RECENT_WINDOW answers", () => {
  const many = Array.from({ length: P.RECENT_WINDOW + 5 }, (_, i) => i >= 5);
  const p = P.recordAnswers(fresh(), ans("a", ...many), T0);
  assert.equal(p.concepts.a.recent.length, P.RECENT_WINDOW);
  assert.ok(p.concepts.a.recent.every(Boolean));
  assert.equal(p.concepts.a.attempts, P.RECENT_WINDOW + 5);
});

test("a concept enters review only at the threshold with enough attempts", () => {
  let p = P.recordAnswers(fresh(), ans("a", true, true, true), T0);
  assert.equal(p.concepts.a.mastery, 1);
  assert.equal(p.concepts.a.box, 0, "three answers are not enough");
  assert.equal(p.concepts.a.dueAt, null);
  assert.equal(P.isMastered(p.concepts.a), false);
  p = P.recordAnswers(p, ans("a", true), T0);
  assert.equal(p.concepts.a.box, 1);
  assert.equal(p.concepts.a.dueAt, days(P.REVIEW_INTERVAL_DAYS[0]).toISOString());
  assert.equal(P.isMastered(p.concepts.a), true);

  const weak = P.recordAnswers(fresh(), ans("b", true, false, true, false, false), T0);
  assert.equal(weak.concepts.b.box, 0);
  assert.equal(P.isMastered(weak.concepts.b), false);
  assert.equal(P.isMastered(undefined), false);
});

test("a due review that is passed moves up a box with that box's interval", () => {
  let p = master(fresh(), "a", T0);
  const t1 = days(1);
  p = P.recordAnswers(p, ans("a", true, true), t1);
  assert.equal(p.concepts.a.box, 2);
  assert.equal(p.concepts.a.dueAt, days(P.REVIEW_INTERVAL_DAYS[1], t1).toISOString());
  const t2 = days(10);
  p = P.recordAnswers(p, ans("a", true), t2);
  assert.equal(p.concepts.a.box, 3);
  assert.equal(p.concepts.a.dueAt, days(P.REVIEW_INTERVAL_DAYS[2], t2).toISOString());
});

test("the top box is a ceiling", () => {
  let p = master(fresh(), "a", T0);
  let now = T0;
  for (let i = 0; i < P.REVIEW_INTERVAL_DAYS.length + 3; i++) {
    now = days(400, now);
    p = P.recordAnswers(p, ans("a", true), now);
  }
  assert.equal(p.concepts.a.box, P.REVIEW_INTERVAL_DAYS.length);
  assert.equal(p.concepts.a.dueAt, days(P.REVIEW_INTERVAL_DAYS.at(-1)!, now).toISOString());
});

test("a due review that is failed moves down two boxes (not below 1) and is due tomorrow", () => {
  let p = master(fresh(), "a", T0);
  let now = T0;
  for (let i = 0; i < 3; i++) {
    now = days(100, now);
    p = P.recordAnswers(p, ans("a", true), now);
  }
  assert.equal(p.concepts.a.box, 4);
  now = days(100, now);
  p = P.recordAnswers(p, ans("a", true, false), now);
  assert.equal(p.concepts.a.box, 2);
  assert.equal(p.concepts.a.dueAt, days(1, now).toISOString());
  now = days(2, now);
  p = P.recordAnswers(p, ans("a", false), now);
  assert.equal(p.concepts.a.box, 1);
  now = days(2, now);
  p = P.recordAnswers(p, ans("a", false), now);
  assert.equal(p.concepts.a.box, 1, "never below 1");
  assert.equal(p.concepts.a.dueAt, days(1, now).toISOString());
  assert.equal(P.isMastered(p.concepts.a), true, "a failed review does not un-master");
});

test("answers before a review is due change mastery but not the box or due date", () => {
  const p = master(fresh(), "a", T0);
  const early = new Date(T0.getTime() + 3_600_000);
  const q = P.recordAnswers(p, ans("a", false, false), early);
  assert.equal(q.concepts.a.box, 1);
  assert.equal(q.concepts.a.dueAt, p.concepts.a.dueAt);
  assert.ok(q.concepts.a.mastery < p.concepts.a.mastery);
  assert.equal(q.concepts.a.attempts, 6);
});

test("dueConcepts lists only due reviews, most overdue first", () => {
  let p = master(fresh(), "a", T0); // due day 1
  p = master(p, "b", days(2)); // due day 3
  p = master(p, "c", days(1)); // due day 2
  p = P.recordAnswers(p, ans("d", true), T0); // still learning
  assert.deepEqual(P.dueConcepts(p, T0), []);
  assert.deepEqual(P.dueConcepts(p, days(1)), ["a"]);
  assert.deepEqual(P.dueConcepts(p, days(2.5)), ["a", "c"]);
  assert.deepEqual(P.dueConcepts(p, days(30)), ["a", "c", "b"]);
});

test("levels unlock by mastery of the level before, by placement, and never when outlined", () => {
  let p = fresh();
  const unlocked = (q: P.Progress) => P.levelStatuses(content, q).map((s) => s.unlocked);
  assert.deepEqual(unlocked(p), [true, false, false, false]);
  p = master(p, "a", T0);
  p = master(p, "b", T0);
  let st = P.levelStatuses(content, p);
  assert.deepEqual([st[0].mastered, st[0].total], [2, 3], "total counts every track");
  assert.deepEqual(unlocked(p), [true, false, false, false], "2 of 3 is under the unlock fraction");
  p = master(p, "c", T0);
  assert.deepEqual(unlocked(p), [true, true, false, false]);
  p = master(p, "d", T0);
  p = master(p, "e", T0);
  assert.deepEqual(unlocked(p), [true, true, true, false], "an outline level stays locked");

  const placed = P.applyPlacement(fresh(), 2, content.concepts, T0);
  assert.deepEqual(unlocked(placed), [true, true, true, false]);
  st = P.levelStatuses(content, placed);
  assert.deepEqual(st.map((s) => s.mastered), [3, 1, 0, 0]);
  assert.deepEqual(st.map((s) => s.level), [0, 1, 2, 3]);

  // A level with no concepts cannot unlock the next.
  const hollow = { ...content, concepts: content.concepts.filter((c) => c.level !== 0) };
  assert.deepEqual(P.levelStatuses(hollow, fresh()).map((s) => s.unlocked), [true, false, false, false]);
});

test("levelStatuses counts lessons done per level", () => {
  let p = P.recordLesson(fresh(), "l0a", 0.5, T0);
  p = P.recordLesson(p, "l1", 1, T0);
  const st = P.levelStatuses(content, p);
  assert.deepEqual(st.map((s) => [s.lessonsDone, s.lessonsTotal]), [[1, 2], [1, 1], [0, 1], [0, 0]]);
});

test("nextLesson walks the path, skipping done lessons and locked levels", () => {
  let p = fresh();
  assert.equal(P.nextLesson(content, p)?.id, "l0a");
  p = P.recordLesson(p, "l0a", 1, T0);
  assert.equal(P.nextLesson(content, p)?.id, "l0b");
  p = P.recordLesson(p, "l0b", 1, T0);
  assert.equal(P.nextLesson(content, p), null, "level 1 is still locked");
  for (const c of ["a", "b", "c"]) p = master(p, c, T0);
  assert.equal(P.nextLesson(content, p)?.id, "l1");
  const placed = P.applyPlacement(fresh(), 2, content.concepts, T0);
  assert.equal(P.nextLesson(content, placed)?.id, "l0a", "placement leaves earlier lessons available, in path order");
});

test("recordLesson keeps the best score and the first completion time", () => {
  let p = P.recordLesson(fresh(), "l0a", 0.6, T0);
  p = P.recordLesson(p, "l0a", 0.4, days(1));
  assert.deepEqual(p.lessons.l0a, { completedAt: T0.toISOString(), bestScore: 0.6, runs: 2 });
  p = P.recordLesson(p, "l0a", 7, days(2));
  assert.equal(p.lessons.l0a.bestScore, 1, "scores are clamped to 0–1");
  assert.equal(p.updatedAt, days(2).toISOString());
});

test("applyPlacement puts earlier levels' concepts in review, due in a week, and never moves anything backwards", () => {
  let p = master(fresh(), "a", T0);
  let now = T0;
  for (let i = 0; i < 4; i++) {
    now = days(100, now);
    p = P.recordAnswers(p, ans("a", true), now);
  }
  const before = p.concepts.a;
  const placed = P.applyPlacement(p, 1, content.concepts, now);
  assert.deepEqual(placed.concepts.a, before, "a concept already further along is left alone");
  assert.equal(placed.concepts.b.box, 2);
  assert.equal(placed.concepts.b.dueAt, days(7, now).toISOString());
  assert.equal(placed.concepts.b.attempts, 0, "placement does not invent answers");
  assert.equal(P.isMastered(placed.concepts.b), true);
  assert.equal(placed.concepts.d, undefined, "the placed level itself is untouched");
  assert.deepEqual(placed.lessons, {});
  assert.equal(placed.placedLevel, 1);
  assert.equal(P.applyPlacement(placed, 0, content.concepts, now).placedLevel, 1, "placedLevel never drops");
});

test("nothing mutates its input", () => {
  const base = master(P.recordLesson(fresh(), "l0a", 0.5, T0), "a", T0);
  const snapshot = structuredClone(base);
  const freeze = <T>(o: T): T => {
    if (o && typeof o === "object") {
      Object.values(o).forEach(freeze);
      Object.freeze(o);
    }
    return o;
  };
  freeze(base);
  P.recordAnswers(base, [...ans("a", true, false), ...ans("z", true)], days(5));
  P.recordLesson(base, "l0a", 1, days(5));
  P.recordLesson(base, "new", 1, days(5));
  P.applyPlacement(base, 3, content.concepts, days(5));
  P.dueConcepts(base, days(5));
  P.levelStatuses(content, base);
  P.nextLesson(content, base);
  assert.deepEqual(base, snapshot);
});
