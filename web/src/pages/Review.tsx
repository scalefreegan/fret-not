import { useMemo, useState } from "react";
import type { Content, ExerciseDecl } from "../../shared/content.ts";
import { reviewQuestions } from "../../shared/exercises.ts";
import { dueConcepts, isMastered } from "../../shared/progress.ts";
import { ExerciseRunner, type Answered } from "../exercises/Runner.tsx";
import { go } from "../router.ts";
import { useAppData } from "../state.tsx";
import { Button, Card } from "../ui.tsx";

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

export function ReviewPage({ onAnswer }: { onAnswer?: (a: Answered) => void }) {
  const { content, progress, record } = useAppData();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [mode, setMode] = useState<"due" | "extra">("due");
  const [result, setResult] = useState<Answered[] | null>(null);
  // Frozen at mount: recording answers changes what is due, and the batch
  // must not reshuffle under the learner.
  const [due] = useState(() => dueConcepts(progress, new Date()));
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
  }, [content, mode, due, seed]);
  const questions = useMemo(() => (content ? reviewQuestions(pickDecls(content, concepts, seed), 2, seed).slice(0, MAX_QUESTIONS) : []), [content, concepts, seed]);
  if (!content) return null;

  if (result) {
    const right = result.filter((a) => a.correct).length;
    return (
      <div className="mx-auto max-w-3xl px-5 pt-8 pb-24">
        <Card className="px-6 py-6">
          <p className="font-display text-3xl font-bold text-fg">Review done.</p>
          <p className="mt-1 text-lg text-fg-2">{right} of {result.length} correct. Ideas you got right move to a longer gap; any you missed come back tomorrow.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => go("home")}>Back to the path</Button>
            <Button onClick={() => { setResult(null); setMode("extra"); setSeed(Math.floor(Math.random() * 1e9)); }}>Practise some more</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-24">
      <h1 className="text-4xl font-bold text-fg">Review</h1>
      {questions.length === 0 ? (
        <Card className="mt-5 px-6 py-6">
          <p className="text-lg text-fg-2">Nothing to review yet. Once you master a concept in a lesson, it comes back here after a day, then three days, a week, and so on.</p>
          <Button className="mt-4" variant="primary" onClick={() => go("home")}>Go to the path</Button>
        </Card>
      ) : (
        <>
          <p className="mt-1 mb-5 text-fg-2">{mode === "due" && due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} due` : "Extra practice on what you have mastered"} · {questions.length} questions</p>
          <Card className="px-5 py-5">
            <ExerciseRunner
              questions={questions}
              onAnswer={onAnswer}
              onDone={(all) => {
                setResult(all);
                void record(all.map((a) => ({ concept: a.question.concept, correct: a.correct })));
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
  const [stage, setStage] = useState<"intro" | "quiz" | "passed" | "placed">("intro");
  const [score, setScore] = useState(0);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const written = useMemo(() => (content ? content.levels.filter((l) => l.status === "written").map((l) => l.id) : []), [content]);
  const questions = useMemo(() => {
    if (!content) return [];
    // One exercise per concept of the level; tapping needs a warm-up, so it is left out.
    const decls = content.concepts
      .filter((c) => c.level === level)
      .flatMap((c) => declsFor(content, c.id).filter((d) => d.kind !== "tap-rhythm").slice(0, 1));
    return reviewQuestions(decls, 1, seed + level).slice(0, PER_LEVEL);
  }, [content, level, seed]);
  if (!content) return null;
  const title = (id: number) => content.levels.find((l) => l.id === id)?.title ?? "";
  const isLast = written.indexOf(level) === written.length - 1;
  const finish = async (placedAt: number) => {
    await place(placedAt);
    setLevel(placedAt);
    setStage("placed");
  };
  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-24">
      <h1 className="text-4xl font-bold text-fg">Placement check</h1>
      {stage === "intro" && (
        <Card className="mt-5 px-6 py-6">
          <p className="text-lg text-fg-2">A few questions from each level, starting with level 0. Get {Math.round(PASS * 100)}% of a level right and you skip it; the first level you do not pass is where your path starts. Skipped ideas still come back for review. There is no penalty for stopping early.</p>
          <div className="mt-5 flex gap-3">
            <Button variant="primary" onClick={() => setStage("quiz")}>Start with level 0 · {title(0)}</Button>
            <Button variant="ghost" onClick={() => go("home")}>Not now</Button>
          </div>
        </Card>
      )}
      {stage === "quiz" && (
        <>
          <p className="mt-1 mb-5 text-fg-2">Level {level} · {title(level)}</p>
          <Card className="px-5 py-5">
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
        <Card className="mt-5 px-6 py-6">
          <p className="font-display text-2xl font-bold text-fg">Level {level} passed ({Math.round(score * 100)}%).</p>
          <p className="mt-1 text-fg-2">Try the next one, or stop here and start at level {level + 1}.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => { setLevel(written[written.indexOf(level) + 1]); setStage("quiz"); }}>Try level {level + 1} · {title(level + 1)}</Button>
            <Button onClick={() => void finish(level + 1)}>Start me at level {level + 1}</Button>
          </div>
        </Card>
      )}
      {stage === "placed" && (
        <Card className="mt-5 px-6 py-6">
          <p className="font-display text-2xl font-bold text-fg">{level === 0 ? "You start at the beginning." : `You start at level ${Math.min(level, written[written.length - 1])} · ${title(Math.min(level, written[written.length - 1]))}.`}</p>
          <p className="mt-1 text-fg-2">{level === 0 ? "Level 0 is where the interesting physics is anyway." : "Everything below is open too, and its ideas will come round in Review."}</p>
          <Button className="mt-5" variant="primary" onClick={() => go("home")}>Go to the path</Button>
        </Card>
      )}
    </div>
  );
}
