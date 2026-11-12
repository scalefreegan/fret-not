import assert from "node:assert/strict";
import { test } from "node:test";
import type { Concept, Content, Lesson, Level } from "./content.ts";
import * as P from "./progress.ts";

// Local noon, so the calendar-day rules read the same in any time zone.
const T0 = new Date(2026, 10, 10, 12, 0, 0);
const days = (n: number, from: Date = T0) => new Date(from.getTime() + n * 86_400_000);
/** What dueAt holds for a review due `n` calendar days after `from`: the
 *  start of that local day. */
const dueOn = (n: number, from: Date = T0) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n).toISOString();
const ans = (concept: string, ...correct: boolean[]): P.AnswerResult[] => correct.map((c) => ({ concept, correct: c }));
const fresh = () => P.emptyProgress("default", T0);

const level = (id: number, status: Level["status"] = "written"): Level => ({ id, title: `L${id}`, summary: "", status, topics: [] });
const concept = (id: string, lvl: number, track = "core"): Concept => ({ id, title: id, level: lvl, track, requires: [] });
const lesson = (id: string, lvl: number, concepts: string[]): Lesson => ({ id, title: id, track: "core", level: lvl, order: 1, concepts, summary: "", blocks: [], exercises: concepts.map((c) => ({ kind: "quiz", concept: c, count: 1, params: {} })), file: `${id}.md` });

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
  assert.equal(p.concepts.a.dueAt, dueOn(P.REVIEW_INTERVAL_DAYS[0]));
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
  assert.equal(p.concepts.a.dueAt, dueOn(P.REVIEW_INTERVAL_DAYS[1], t1));
  const t2 = days(10);
  p = P.recordAnswers(p, ans("a", true), t2);
  assert.equal(p.concepts.a.box, 3);
  assert.equal(p.concepts.a.dueAt, dueOn(P.REVIEW_INTERVAL_DAYS[2], t2));
});

test("the top box is a ceiling", () => {
  let p = master(fresh(), "a", T0);
  let now = T0;
  for (let i = 0; i < P.REVIEW_INTERVAL_DAYS.length + 3; i++) {
    now = days(400, now);
    p = P.recordAnswers(p, ans("a", true), now);
  }
  assert.equal(p.concepts.a.box, P.REVIEW_INTERVAL_DAYS.length);
  assert.equal(p.concepts.a.dueAt, dueOn(P.REVIEW_INTERVAL_DAYS.at(-1)!, now));
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
  assert.equal(p.concepts.a.dueAt, dueOn(1, now));
  now = days(2, now);
  p = P.recordAnswers(p, ans("a", false), now);
  assert.equal(p.concepts.a.box, 1);
  now = days(2, now);
  p = P.recordAnswers(p, ans("a", false), now);
  assert.equal(p.concepts.a.box, 1, "never below 1");
  assert.equal(p.concepts.a.dueAt, dueOn(1, now));
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
  assert.deepEqual(P.dueConcepts(p, days(2.25)), ["a", "c"]);
  assert.deepEqual(P.dueConcepts(p, days(30)), ["a", "c", "b"]);
});

test("levels unlock by mastery of the level before, by placement, and never when outlined", () => {
  let p = fresh();
  const unlocked = (q: P.Progress) => P.levelStatuses(content, q).map((s) => s.unlocked);
  assert.deepEqual(unlocked(p), [true, false, false, false]);
  p = master(p, "a", T0);
  let st = P.levelStatuses(content, p);
  assert.deepEqual([st[0].mastered, st[0].total], [1, 3], "total counts every track");
  assert.deepEqual(unlocked(p), [true, false, false, false], "1 of 2 core concepts is under the unlock fraction");
  assert.deepEqual([st[1].gate, st[1].gateMastered, st[1].gateTotal, st[1].gateTracks], [0, 1, 2, ["core"]]);
  p = master(p, "b", T0);
  assert.deepEqual(unlocked(p), [true, true, false, false], "the core is enough: the piano concept is optional");
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

  // A level with no concepts asks nothing, so it does not hold the next shut.
  const hollow = { ...content, concepts: content.concepts.filter((c) => c.level !== 0) };
  assert.deepEqual(P.levelStatuses(hollow, fresh()).map((s) => s.unlocked), [true, true, false, false]);
});

test("levelStatuses counts lessons done per level", () => {
  let p = P.recordLesson(fresh(), "l0a", 0.7, T0);
  p = P.recordLesson(p, "l1", 1, T0);
  // A run that scored 18% is an attempt, not a lesson done.
  p = P.recordLesson(p, "l0b", 0.18, T0);
  const st = P.levelStatuses(content, p);
  assert.deepEqual(st.map((s) => [s.lessonsDone, s.lessonsTotal]), [[1, 2], [1, 1], [0, 1], [0, 0]]);
  assert.equal(P.lessonState(p.lessons.l0a), "done");
  assert.equal(P.lessonState(p.lessons.l0b), "attempted");
  assert.equal(P.lessonState(p.lessons.nope), "new");
  assert.equal(P.isLessonDone(P.recordLesson(p, "l0b", P.LESSON_DONE_SCORE, T0).lessons.l0b), true);
  assert.equal(P.nextLesson(content, p)?.id, "l0b", "an attempted lesson is offered again");
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
  assert.equal(placed.concepts.b.dueAt, dueOn(7, now));
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

test("a review is due by calendar day, not by the clock", () => {
  // Mastered at 21:00; the next morning at 07:00 is "tomorrow", though only
  // ten hours later.
  const evening = new Date(2026, 10, 10, 21, 0, 0);
  const p = master(fresh(), "a", evening);
  assert.equal(p.concepts.a.dueAt, new Date(2026, 10, 11).toISOString());
  assert.deepEqual(P.dueConcepts(p, new Date(2026, 10, 10, 23, 59)), []);
  assert.deepEqual(P.dueConcepts(p, new Date(2026, 10, 11, 0, 0)), ["a"]);
  assert.deepEqual(P.dueConcepts(p, new Date(2026, 10, 11, 7, 0)), ["a"]);
  // And the morning review counts as the due review: up a box.
  const q = P.recordAnswers(p, ans("a", true), new Date(2026, 10, 11, 7, 0));
  assert.equal(q.concepts.a.box, 2);
  // A file written under the old clock-time rule is read by its day too.
  const legacy: P.Progress = { ...p, concepts: { a: { ...p.concepts.a, dueAt: new Date(2026, 10, 11, 21, 0).toISOString() } } };
  assert.equal(P.isDue(legacy.concepts.a.dueAt, new Date(2026, 10, 11, 7, 0)), true);
  assert.equal(P.isDue(legacy.concepts.a.dueAt, new Date(2026, 10, 10, 23, 0)), false);
  assert.equal(P.isDue(null, T0), false);
  assert.equal(P.isDue("not a date", T0), false);
});

test("dueConcepts leaves out concepts that cannot be reviewed when told which can", () => {
  let p = master(fresh(), "a", T0);
  p = master(p, "gone", T0); // since removed from the curriculum
  p = master(p, "c", T0); // in the curriculum, but no exercise tests it
  const withExercises: Pick<Content, "concepts" | "lessons"> = {
    concepts: content.concepts,
    lessons: [{ ...lesson("l0a", 0, ["a", "c"]), exercises: [{ kind: "quiz", concept: "a", count: 1, params: {} }, { kind: "quiz", concept: "not-a-concept", count: 1, params: {} }] }],
  };
  const known = P.reviewableConcepts(withExercises);
  assert.deepEqual([...known], ["a"]);
  assert.deepEqual(P.dueConcepts(p, days(1)), ["a", "c", "gone"], "the two-argument call is unchanged");
  assert.deepEqual(P.dueConcepts(p, days(1), known), ["a"]);
});

test("a level with no concepts does not block the levels after it", () => {
  const gap: Pick<Content, "levels" | "concepts" | "lessons"> = {
    levels: [level(0), level(1), level(2), level(3)],
    concepts: [concept("a", 0), concept("e", 2)],
    lessons: [lesson("l0", 0, ["a"]), lesson("l2", 2, ["e"])],
  };
  const unlocked = (q: P.Progress) => P.levelStatuses(gap, q).map((s) => s.unlocked);
  assert.deepEqual(unlocked(fresh()), [true, false, false, false], "level 0 not yet mastered: the empty level 1 does not open by itself");
  const p = master(fresh(), "a", T0);
  assert.deepEqual(unlocked(p), [true, true, true, false], "level 2 looks past the empty level 1 to level 0");
  assert.deepEqual(unlocked(master(p, "e", T0)), [true, true, true, true]);
  // Nothing before it has concepts at all: nothing to wait for.
  assert.deepEqual(P.levelStatuses({ levels: [level(0), level(1)], concepts: [], lessons: [] }, fresh()).map((s) => s.unlocked), [true, true]);
});

test("a level whose concepts no lesson drills does not block, and each level names its gate", () => {
  // Level 1 has a concept but no exercise tests it (an outline, or a level
  // written before its drills): nobody could master it, so it gates nothing.
  const c: Pick<Content, "levels" | "concepts" | "lessons"> = {
    levels: [level(0), { ...level(1), status: "outline" }, level(2), level(3)],
    concepts: [concept("a", 0), concept("x", 1), concept("e", 2)],
    lessons: [lesson("l0", 0, ["a"]), lesson("l2", 2, ["e"])],
  };
  const st = (q: P.Progress) => P.levelStatuses(c, q);
  assert.deepEqual(st(fresh()).map((s) => s.unlocked), [true, false, false, false]);
  assert.deepEqual(st(fresh()).map((s) => s.gate), [null, 0, 0, 2], "levels 1 and 2 wait on level 0, level 3 on level 2");
  const p = master(fresh(), "a", T0);
  assert.deepEqual(st(p).map((s) => s.unlocked), [true, false, true, false], "the outline stays shut; level 2 opens past it");
  assert.deepEqual([st(p)[2].gateMastered, st(p)[2].gateTotal], [1, 1]);
  assert.deepEqual(st(master(p, "e", T0)).map((s) => s.unlocked), [true, false, true, true]);
});

test("ids that name Object built-ins read as absent and never crash", () => {
  let p = P.recordAnswers(fresh(), [...ans("constructor", true, true, true, true), ...ans("toString", false), ...ans("__proto__", true)], T0);
  assert.equal(Object.entries(p.concepts).find(([id]) => id === "constructor")?.[1].attempts, 4);
  assert.equal(Object.hasOwn(p.concepts, "constructor"), true);
  assert.equal(Object.hasOwn(p.concepts, "__proto__"), false, "__proto__ is never stored");
  assert.equal(Object.getPrototypeOf(p.concepts), Object.prototype);
  p = P.recordLesson(p, "__proto__", 1, T0);
  assert.deepEqual(Object.keys(p.lessons), []);
  const odd: Pick<Content, "levels" | "concepts" | "lessons"> = { levels: [level(0), level(1)], concepts: [concept("valueOf", 0)], lessons: [lesson("constructor", 0, ["valueOf"]), lesson("hasOwnProperty", 0, ["valueOf"])] };
  const s = P.levelStatuses(odd, fresh());
  assert.equal(s[0].mastered, 0);
  assert.equal(s[0].lessonsDone, 0, "an inherited built-in is not a completed lesson");
  assert.equal(P.nextLesson(odd, fresh())?.id, "constructor");
  assert.equal(Object.entries(P.applyPlacement(fresh(), 1, odd.concepts, T0).concepts).find(([id]) => id === "valueOf")?.[1].box, 2);
});

// ---- the gate is counted over the tracks that suit the learner --------------

const twoInstruments = (): Pick<Content, "levels" | "concepts" | "lessons" | "tracks"> => {
  const concepts = [
    ...["k1", "k2", "k3", "k4", "k5"].map((id) => concept(id, 0)),
    ...["p1", "p2", "p3"].map((id) => concept(id, 0, "piano")),
    ...["g1", "g2", "g3", "g4"].map((id) => concept(id, 0, "guitar")),
    concept("n1", 1),
    concept("n2", 1, "guitar"),
    concept("z", 2),
  ];
  return {
    tracks: [
      { id: "core", title: "Core", summary: "" },
      { id: "piano", title: "Piano", summary: "", instrument: "piano" },
      { id: "guitar", title: "Guitar", summary: "", instrument: "guitar" },
    ],
    levels: [level(0), level(1), level(2)],
    concepts,
    lessons: [lesson("l0", 0, concepts.filter((c) => c.level === 0).map((c) => c.id)), lesson("l1", 1, ["n1", "n2"]), lesson("l2", 2, ["z"])],
  };
};
const masterAll = (p: P.Progress, ids: string[]) => ids.reduce((q, id) => master(q, id, T0), p);

test("a learner of one instrument is not held back by the other", () => {
  const c = twoInstruments();
  const open = (q: P.Progress) => P.levelStatuses(c, q).map((s) => s.unlocked);
  // Everything but the guitar: 8 of 12 over all tracks is under 70%, but the
  // learner is measured on core + piano (8 of 8).
  let p = masterAll(fresh(), ["k1", "k2", "k3", "k4", "k5", "p1", "p2", "p3"]);
  assert.deepEqual(open(p), [true, true, false]);
  let st = P.levelStatuses(c, p);
  assert.deepEqual([st[1].gateMastered, st[1].gateTotal, st[1].gateTracks], [8, 8, ["core", "piano"]]);
  // The same for a guitar-only learner.
  assert.deepEqual(open(masterAll(fresh(), ["k1", "k2", "k3", "k4", "g1", "g2", "g3"])), [true, true, false]);
  // Core alone is enough, and a half-done instrument cannot count against it.
  assert.deepEqual(open(masterAll(fresh(), ["k1", "k2", "k3", "k4"])), [true, true, false]);
  assert.deepEqual(open(masterAll(fresh(), ["k1", "k2", "k3", "k4", "g1"])), [true, true, false]);
  // An instrument can make up for a gap in the core…
  p = masterAll(fresh(), ["k1", "k2", "k3", "p1", "p2", "p3"]);
  assert.deepEqual(open(p), [true, true, false], "6 of 8 over core + piano");
  // …but not replace it.
  p = masterAll(fresh(), ["p1", "p2", "p3", "g1", "g2", "g3", "g4"]);
  assert.deepEqual(open(p), [true, false, false]);
  st = P.levelStatuses(c, p);
  assert.deepEqual([st[1].gateMastered, st[1].gateTotal], [7, 12], "the text names the nearest way through: 2 more of all twelve");
  // Without `tracks` (older callers), a track called "core" is the core.
  const { tracks: _t, ...bare } = c;
  assert.deepEqual(P.levelStatuses(bare, masterAll(fresh(), ["k1", "k2", "k3", "k4"])).map((s) => s.unlocked), [true, true, false]);
});

test("levels open in order: none is open above a locked one", () => {
  const c = twoInstruments();
  // Level 1's concepts mastered, level 0's not: before, level 2 opened while
  // level 1 stayed shut.
  const p = masterAll(fresh(), ["n1", "n2"]);
  assert.deepEqual(P.levelStatuses(c, p).map((s) => s.unlocked), [true, false, false]);
});

test("a level that has been open stays open when the curriculum grows or a concept is lost", () => {
  const c = twoInstruments();
  let p = masterAll(fresh(), ["k1", "k2", "k3", "k4"]);
  assert.equal(p.openedLevel, 0);
  p = P.rememberOpened(c, p);
  assert.equal(p.openedLevel, 1);
  assert.equal(P.rememberOpened(c, p), p, "nothing new: the same object");
  // The tutor adds two drilled core concepts to level 0: 4 of 7 is under 70%.
  const grown = { ...c, concepts: [...c.concepts, concept("k6", 0), concept("k7", 0)], lessons: [...c.lessons, lesson("l0b", 0, ["k6", "k7"])] };
  const st = P.levelStatuses(grown, p);
  assert.deepEqual(st.map((s) => s.unlocked), [true, true, false], "level 1 stays open");
  assert.deepEqual([st[1].gateMastered, st[1].gateTotal], [4, 7], "the counts still tell the truth");
  // Without the record it would have re-locked.
  assert.deepEqual(P.levelStatuses(grown, { ...p, openedLevel: 0 }).map((s) => s.unlocked), [true, false, false]);
  // A file from before the field existed reads as 0 and gains it.
  const { openedLevel: _o, ...old } = p;
  assert.deepEqual(P.levelStatuses(c, old).map((s) => s.unlocked), [true, true, false]);
  assert.equal(P.rememberOpened(c, old).openedLevel, 1);
  // Placement counts as opening, and openedLevel never drops.
  assert.equal(P.rememberOpened(c, P.applyPlacement(fresh(), 2, c.concepts, T0)).openedLevel, 2);
  assert.equal(P.rememberOpened(grown, p).openedLevel, 1);
  // An outline level is never opened by the record.
  const outlined = { ...c, levels: [level(0), level(1), { ...level(2), status: "outline" as const }] };
  assert.deepEqual(P.levelStatuses(outlined, { ...p, openedLevel: 2 }).map((s) => s.unlocked), [true, true, false]);
});

// --- one instrument: placement and Continue -----------------------------------

const trackLesson = (id: string, lvl: number, track: string, concepts: string[]): Lesson => ({ ...lesson(id, lvl, concepts), track });
const multi: Pick<Content, "levels" | "concepts" | "lessons" | "tracks"> = {
  tracks: [
    { id: "core", title: "Core", summary: "" },
    { id: "piano", title: "Piano", summary: "", instrument: "piano" },
    { id: "guitar", title: "Guitar", summary: "", instrument: "guitar" },
  ],
  levels: [level(0), level(1)],
  concepts: [concept("c0a", 0), concept("c0b", 0), concept("p0", 0, "piano"), concept("g0", 0, "guitar"), concept("c1", 1), concept("p1", 1, "piano"), concept("g1", 1, "guitar"), concept("undrilled", 0)],
  // Sorted as the loader sorts: by level, then track order.
  lessons: [trackLesson("L-c0", 0, "core", ["c0a", "c0b"]), trackLesson("L-p0", 0, "piano", ["p0"]), trackLesson("L-g0", 0, "guitar", ["g0"]), trackLesson("L-c1", 1, "core", ["c1"]), trackLesson("L-p1", 1, "piano", ["p1"]), trackLesson("L-g1", 1, "guitar", ["g1"])],
};

test("placement asks only about the tracks the learner follows", () => {
  const p = fresh();
  assert.deepEqual(P.placementConcepts(multi, p, 0), ["c0a", "c0b"], "nobody new is asked about an instrument; undrilled concepts cannot be asked");
  const pianist = P.recordLesson(p, "L-p0", 1, T0);
  assert.deepEqual(P.placementConcepts(multi, pianist, 0), ["c0a", "c0b", "p0"]);
  assert.deepEqual(P.placementConcepts(multi, pianist, 1), ["c1", "p1"]);
  const guitarist = P.recordAnswers(p, ans("g0", true), T0);
  assert.deepEqual(P.placementConcepts(multi, guitarist, 0), ["c0a", "c0b", "g0"]);
  assert.deepEqual([...P.placementTracks(multi, pianist)].sort(), ["core", "piano"]);
  const shuffled = P.placementConcepts(multi, pianist, 0, 42);
  assert.deepEqual([...shuffled].sort(), ["c0a", "c0b", "p0"]);
  assert.deepEqual(P.placementConcepts(multi, pianist, 0, 42), shuffled, "the same seed gives the same order");
});

test("Continue stays on the learner's own instrument", () => {
  let p = fresh();
  assert.equal(P.nextLesson(multi, p)?.id, "L-c0");
  p = P.recordLesson(p, "L-c0", 1, T0);
  assert.equal(P.nextLesson(multi, p)?.id, "L-p0", "no instrument chosen yet: the path as written");
  p = P.recordLesson(p, "L-p0", 1, T0);
  for (const id of ["c0a", "c0b", "p0"]) p = master(p, id, T0);
  assert.equal(P.levelStatuses(multi, p)[1].unlocked, true);
  assert.equal(P.nextLesson(multi, p)?.id, "L-c1", "a pianist with level 1 open is not sent to the guitar's level 0");
  p = P.recordLesson(P.recordLesson(p, "L-c1", 1, T0), "L-p1", 1, T0);
  assert.equal(P.nextLesson(multi, p)?.id, "L-g0", "with their own tracks finished, the rest is offered");
});

test("placement spreads the tested-out concepts over a week of due dates", () => {
  const concepts = Array.from({ length: 20 }, (_, i) => concept(`k${i}`, 0));
  const p = P.applyPlacement(fresh(), 1, concepts, T0);
  const perDay = new Map<string, number>();
  for (const c of Object.values(p.concepts)) perDay.set(c.dueAt!, (perDay.get(c.dueAt!) ?? 0) + 1);
  assert.equal(perDay.size, 7);
  assert.ok(Math.max(...perDay.values()) <= 3);
  assert.ok([...perDay.keys()].every((d) => d >= dueOn(7) && d <= dueOn(13)));
});
