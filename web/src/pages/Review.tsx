import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Content, ExerciseDecl } from "../../shared/content.ts";
import { reviewQuestions } from "../../shared/exercises.ts";
import { dueConcepts, isMastered, reviewableConcepts } from "../../shared/progress.ts";
import { ExerciseRunner, type Answered } from "../exercises/Runner.tsx";
import { go } from "../router.ts";
import { useAnswerSaver, useAppData } from "../app-data.ts";
import { Button, Card, SaveNotice, UpdatedNotice, useFrozen, useStable } from "../ui.tsx";

/** Exercise declarations that test a concept, from every lesson that has one. */
function declsFor(content: Content, concept: string): ExerciseDecl[] {
  return content.lessons.flatMap((l) => l.exercises.filter((e) => e.concept === concept));
}

/** Up to two different exercises per concept, so a review is a mix. */
function pickDecls(content: Content, concepts: string[], seed: number): ExerciseDecl[] {
  return concepts.flatMap((c, i) => {
    const all = declsFor(content, c);
    if (all.length <= 2) return all;
    const start = (seed + i) % all.length;
    return [all[start], all[(start + 1) % all.length]];
  });
}

const MAX_QUESTIONS = 20;

/** Waits for the saved progress: what is due is decided once, when the
 *  session mounts, and must not be decided from the empty placeholder. */
export function ReviewPage({ onAnswer }: { onAnswer?: (a: Answered) => void }) {
  const { content, progressLoaded, error } = useAppData();
  if (!content || !progressLoaded) return <p className="p-10 text-fg-3">{error ? "Your progress could not be loaded, so there is nothing to review from. Reload to try again." : "Loading…"}</p>;
  return <ReviewSession onAnswer={onAnswer} />;
}

function ReviewSession({ onAnswer }: { onAnswer?: (a: Answered) => void }) {
  const { content, progress } = useAppData();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [mode, setMode] = useState<"due" | "extra">("due");
  const [result, setResult] = useState<Answered[] | null>(null);
  // Frozen at mount: recording answers changes what is due, and the batch
  // must not reshuffle under the learner.
  const [due] = useState(() => dueConcepts(progress, new Date(), content ? reviewableConcepts(content) : undefined));
  const { save, add } = useAnswerSaver();
  // Answers of a review left unfinished are saved on the way out.
  const partial = useRef<Answered[]>([]);
  const noteAnswer = useCallback(
    (a: Answered) => {
      partial.current = [...partial.current, a];
      onAnswer?.(a);
    },
    [onAnswer],
  );
  useEffect(
    () => () => {
      const got = partial.current;
      partial.current = [];
      if (got.length) void add(got.map((a) => ({ concept: a.question.concept, correct: a.correct })));
    },
    [add],
  );
  // Which concepts exist, as a value: content is a new object after every
  // tutor commit, and the batch must only change when the curriculum did.
  const conceptIds = useStable(content ? content.concepts.map((c) => c.id) : []);
  const concepts = useMemo(() => {
    if (!content) return [];
    if (mode === "due" && due.length) return due;
    // Nothing due: the weakest of what has been mastered.
    return content.concepts
      .filter((c) => isMastered(progress.concepts[c.id]))
      .sort((a, b) => (progress.concepts[a.id]?.mastery ?? 0) - (progress.concepts[b.id]?.mastery ?? 0))
      .slice(0, 6)
      .map((c) => c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptIds, mode, due, seed]);
  const decls = useStable(content ? pickDecls(content, concepts, seed) : []);
  // One batch per (mode, seed): a tutor commit that edits these exercises
  // mid-review does not restart it.
  const { value: questions, stale } = useFrozen(`${mode}:${seed}`, decls, (d) => reviewQuestions(d, 2, seed).slice(0, MAX_QUESTIONS));
  if (!content) return null;
  const saveAnswers = (all: Answered[]) => void add(all.map((a) => ({ concept: a.question.concept, correct: a.correct })));

  if (result) {
    const right = result.filter((a) => a.correct).length;
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
        <Card className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="font-display text-3xl font-bold text-fg">Review done.</p>
          <p className="mt-1 text-lg text-fg-2">{right} of {result.length} correct. Ideas you got right move to a longer gap; any you missed come back tomorrow.</p>
          <SaveNotice className="mt-4" save={save} />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => go("home")}>Back to the path</Button>
            <Button onClick={() => { setResult(null); setMode("extra"); setSeed(Math.floor(Math.random() * 1e9)); }}>Practise some more</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <h1 className="text-3xl font-bold text-fg sm:text-4xl">Review</h1>
      {questions.length === 0 ? (
        <Card className="mt-5 px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-lg text-fg-2">Nothing to review yet. Once you master a concept in a lesson, it comes back here after a day, then three days, a week, and so on.</p>
          <Button className="mt-4" variant="primary" onClick={() => go("home")}>Go to the path</Button>
        </Card>
      ) : (
        <>
          <p className="mt-1 mb-5 text-fg-2">{mode === "due" && due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} due` : "Extra practice on what you have mastered"} · {questions.length} questions</p>
          <Card className="px-3.5 py-4 sm:px-5 sm:py-5">
            {stale && <UpdatedNotice className="mb-4" />}
            <ExerciseRunner
              questions={questions}
              onAnswer={noteAnswer}
              onDone={(all) => {
                partial.current = [];
                setResult(all);
                saveAnswers(all);
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

const PASS = 0.75;
const PER_LEVEL = 8;

/** Placement: a short quiz per level, starting at 0. Pass one and the next
 *  is offered; the first level not passed is where the path starts. */
export function PlacementPage() {
  const { content, place } = useAppData();
  const [level, setLevel] = useState(0);
  const [stage, setStage] = useState<"intro" | "quiz" | "passed" | "saving" | "failed" | "placed">("intro");
  /** The level a failed save was for, and why it failed, so it can be retried. */
  const [failed, setFailed] = useState<{ placedAt: number; error: string } | null>(null);
  const placing = useRef(false);
  const [score, setScore] = useState(0);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const written = useMemo(() => (content ? content.levels.filter((l) => l.status === "written").map((l) => l.id) : []), [content]);
  // One exercise per concept of the level; tapping needs a warm-up, so it is
  // left out. Stable by value, so a content reload does not restart the quiz.
  const decls = useStable(
    content
      ? content.concepts.filter((c) => c.level === level).flatMap((c) => declsFor(content, c.id).filter((d) => d.kind !== "tap-rhythm").slice(0, 1))
      : [],
  );
  const { value: questions, stale } = useFrozen(`${level}`, decls, (d) => reviewQuestions(d, 1, seed + level).slice(0, PER_LEVEL));
  if (!content) return null;
  const title = (id: number) => content.levels.find((l) => l.id === id)?.title ?? "";
  const isLast = written.indexOf(level) === written.length - 1;
  /** Save the placement: once at a time, with the quiz put away while it is
   *  in flight (so Finish cannot post twice) and a retry if it fails. */
  const finish = async (placedAt: number) => {
    if (placing.current) return;
    placing.current = true;
    setStage("saving");
    try {
      await place(placedAt);
      setFailed(null);
      setLevel(placedAt);
      setStage("placed");
    } catch (e) {
      setFailed({ placedAt, error: (e as Error).message });
      setStage("failed");
    } finally {
      placing.current = false;
    }
  };
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <h1 className="text-3xl font-bold text-fg sm:text-4xl">Placement check</h1>
      {stage === "intro" && (
        <Card className="mt-5 px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-lg text-fg-2">A few questions from each level, starting with level 0. Get {Math.round(PASS * 100)}% of a level right and you skip it; the first level you do not pass is where your path starts. Skipped ideas still come back for review. There is no penalty for stopping early.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => setStage("quiz")}>Start with level 0 · {title(0)}</Button>
            <Button variant="ghost" onClick={() => go("home")}>Not now</Button>
          </div>
        </Card>
      )}
      {stage === "quiz" && (
        <>
          <p className="mt-1 mb-5 text-fg-2">Level {level} · {title(level)}</p>
          <Card className="px-3.5 py-4 sm:px-5 sm:py-5">
            {stale && <UpdatedNotice className="mb-4" />}
            <ExerciseRunner
              key={level}
              questions={questions}
              onDone={(all) => {
                const s = all.length ? all.filter((a) => a.correct).length / all.length : 0;
                setScore(s);
                if (s >= PASS && !isLast) setStage("passed");
                else void finish(s >= PASS ? level + 1 : level);
              }}
            />
          </Card>
        </>
      )}
      {stage === "passed" && (
        <Card className="mt-5 px-4 py-5 sm:px-6 sm:py-6">
          <p className="font-display text-2xl font-bold text-fg">Level {level} passed ({Math.round(score * 100)}%).</p>
          <p className="mt-1 text-fg-2">Try the next one, or stop here and start at level {level + 1}.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => { setLevel(written[written.indexOf(level) + 1]); setStage("quiz"); }}>Try level {level + 1} · {title(level + 1)}</Button>
            <Button onClick={() => void finish(level + 1)}>Start me at level {level + 1}</Button>
          </div>
        </Card>
      )}
      {stage === "saving" && <p role="status" className="mt-5 text-fg-3">Saving your placement…</p>}
      {stage === "failed" && failed && (
        <Card className="mt-5 px-4 py-5 sm:px-6 sm:py-6">
          <p role="alert" className="rounded-lg border border-bad bg-bad-soft px-4 py-3 text-fg">
            <strong>Your placement at level {failed.placedAt} is not saved yet.</strong> {failed.error}.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => void finish(failed.placedAt)}>Try saving again</Button>
            <Button variant="ghost" onClick={() => go("home")}>Leave without placing</Button>
          </div>
        </Card>
      )}
      {stage === "placed" && (
        <Card className="mt-5 px-4 py-5 sm:px-6 sm:py-6">
          <p className="font-display text-2xl font-bold text-fg">{level === 0 ? "You start at the beginning." : `You start at level ${Math.min(level, written[written.length - 1])} · ${title(Math.min(level, written[written.length - 1]))}.`}</p>
          <p className="mt-1 text-fg-2">{level === 0 ? "Level 0 is where the interesting physics is anyway." : "Everything below is open too, and its ideas will come round in Review."}</p>
          <Button className="mt-5" variant="primary" onClick={() => go("home")}>Go to the path</Button>
        </Card>
      )}
    </div>
  );
}
