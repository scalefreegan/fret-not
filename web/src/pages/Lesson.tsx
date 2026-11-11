import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Content, Lesson } from "../../shared/content.ts";
import type { Question } from "../../shared/exercise-types.ts";
import { generateQuestions } from "../../shared/exercises.ts";
import { isMastered } from "../../shared/progress.ts";
import { ExerciseRunner, type Answered } from "../exercises/Runner.tsx";
import { Markdown } from "../markdown.tsx";
import { go, href, scrollTop } from "../router.ts";
import { useAnswerSaver, useAppData } from "../app-data.ts";
import { Button, Card, cx, SaveNotice, UpdatedNotice, useStable } from "../ui.tsx";
import { RenderWidget } from "../widgets/registry.tsx";

/** The lessons of a level in path order: the one before and after `lesson`. */
function neighbours(content: Content, lesson: Lesson): { prev: Lesson | null; next: Lesson | null } {
  const i = content.lessons.findIndex((l) => l.id === lesson.id);
  return { prev: content.lessons[i - 1] ?? null, next: content.lessons[i + 1] ?? null };
}

export function TrackBadge({ track, className }: { track: string; className?: string }) {
  const label = track === "core" ? "Theory" : track[0].toUpperCase() + track.slice(1);
  return <span className={cx("rounded-full border border-line-strong px-2 py-0.5 text-xs font-bold tracking-wide text-fg-2 uppercase", className)}>{label}</span>;
}

/** A lesson widget whose params keep their identity across content reloads,
 *  so a tutor commit does not reset a widget the learner is playing with. */
function LessonWidget({ type, params }: { type: string; params: Record<string, unknown> }) {
  return <RenderWidget type={type} params={useStable(params)} />;
}

export function LessonPage({ lesson, onAnswer }: { lesson: Lesson; onAnswer?: (a: Answered) => void }) {
  const { content, progress } = useAppData();
  const [phase, setPhase] = useState<"read" | "practice" | "done">("read");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [answered, setAnswered] = useState<Answered[]>([]);
  // Keyed on what the exercises say, not on the lesson object: content is
  // re-read after every tutor commit, and a new object with the same
  // exercises must not restart a batch the learner is half way through.
  const decls = useStable(lesson.exercises);
  const generate = (from: typeof decls, s: number): Question[] => from.flatMap((decl, i) => generateQuestions(decl, s + i * 7919));
  const live = useMemo<Question[]>(() => generate(decls, seed), [decls, seed]);
  // The batch being practised is fixed when it starts. If the tutor edits
  // this lesson's exercises meanwhile, the learner finishes what they
  // started and the new version comes with the next batch.
  const [batch, setBatch] = useState<{ questions: Question[]; decls: typeof decls } | null>(null);
  const questions = phase !== "read" && batch ? batch.questions : live;
  const updated = phase === "practice" && !!batch && batch.decls !== decls;
  const { save, add, retry } = useAnswerSaver();
  // Answers given in a batch that has not been finished. Leaving the batch
  // (back to the reading, or away to another page) saves them rather than
  // dropping them; finishing saves the whole batch with the lesson.
  const partial = useRef<Answered[]>([]);
  const [keptPartial, setKeptPartial] = useState(0);
  const noteAnswer = useCallback(
    (a: Answered) => {
      partial.current = [...partial.current, a];
      onAnswer?.(a);
    },
    [onAnswer],
  );
  const savePartial = useCallback((): number => {
    const got = partial.current;
    partial.current = [];
    if (got.length) void add(got.map((a) => ({ concept: a.question.concept, correct: a.correct })));
    return got.length;
  }, [add]);
  useEffect(() => () => void savePartial(), [savePartial]);
  if (!content) return null;
  const { prev, next } = neighbours(content, lesson);
  const level = content.levels.find((l) => l.id === lesson.level);
  const done = progress.lessons[lesson.id];
  const score = answered.length ? answered.filter((a) => a.correct).length / answered.length : 0;
  const start = (s: number) => {
    setSeed(s);
    setBatch({ questions: generate(decls, s), decls });
    setAnswered([]);
    partial.current = [];
    setKeptPartial(0);
    setPhase("practice");
    scrollTop();
  };
  const finish = (all: Answered[]) => {
    partial.current = [];
    setAnswered(all);
    setPhase("done");
    scrollTop();
    void add(all.map((a) => ({ concept: a.question.concept, correct: a.correct })), { id: lesson.id, score: all.length ? all.filter((a) => a.correct).length / all.length : 1 });
  };
  /** A lesson with nothing to practise is done when read. Move on only once
   *  the server has really marked it done. */
  const finishNoExercises = async (again = false) => {
    const res = await (again ? retry() : add([], { id: lesson.id, score: 1 }));
    if (!res.ok || res.lessonDropped) return;
    if (next) go("lesson", next.id);
    else go("home");
  };
  const saved = save !== null && save !== "saving" && save.ok;
  const missed = answered.filter((a) => !a.correct);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-fg-3">
          <a href={href("home")} className="inline-flex items-center font-semibold hover:text-fg pointer-coarse:min-h-11 pointer-coarse:pr-2">Path</a>
          <span>›</span>
          <span>Level {lesson.level}{level ? ` · ${level.title}` : ""}</span>
          <TrackBadge track={lesson.track} />
          {done && <span className="font-semibold text-good">✓ done{done.bestScore < 1 ? ` · best ${Math.round(done.bestScore * 100)}%` : ""}</span>}
        </div>
        <h1 className="text-3xl leading-tight font-bold text-fg sm:text-4xl">{lesson.title}</h1>
        <p className="mt-2 text-lg text-fg-2">{lesson.summary}</p>
      </header>

      {phase === "read" && (
        <>
          {lesson.blocks.map((b, i) => (b.type === "prose" ? <Markdown key={i} source={b.markdown} /> : <LessonWidget key={i} type={b.widget} params={b.params} />))}
          <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            {questions.length > 0 ? (
              <>
                <div>
                  <p className="font-display text-xl font-bold text-fg">Practice</p>
                  <p className="text-fg-2">{questions.length} questions on {lesson.concepts.map((c) => content.concepts.find((x) => x.id === c)?.title.toLowerCase() ?? c).join(", ")}.</p>
                </div>
                <Button variant="primary" onClick={() => start(seed)}>Start practice</Button>
                {keptPartial > 0 && <p role="status" className="basis-full text-sm text-fg-3">{keptPartial === 1 ? "The one answer you gave before stopping is" : `The ${keptPartial} answers you gave before stopping are`} recorded. The lesson counts as done once you finish a whole batch.</p>}
              </>
            ) : (
              <>
                <p className="text-fg-2">This lesson has no exercises.</p>
                <Button variant="primary" disabled={save === "saving"} onClick={() => void finishNoExercises()}>Mark as done{next ? " and continue" : ""}</Button>
                {save !== "saving" && <SaveNotice className="basis-full" save={save} />}
              </>
            )}
          </Card>
        </>
      )}

      {phase === "practice" && (
        <Card className="px-3.5 py-4 sm:px-5 sm:py-5">
          {updated && <UpdatedNotice className="mb-4" />}
          <ExerciseRunner questions={questions} onDone={finish} onAnswer={noteAnswer} />
          <div className="mt-5 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeptPartial(savePartial());
                setPhase("read");
                scrollTop();
              }}
            >
              Back to the lesson
            </Button>
          </div>
        </Card>
      )}

      {phase === "done" && (
        <Card className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="font-display text-3xl font-bold text-fg">{score >= 0.9 ? "Excellent." : score >= 0.7 ? "Good work." : "A solid start."}</p>
          <p className="mt-1 text-lg text-fg-2">
            {answered.filter((a) => a.correct).length} of {answered.length} correct.
          </p>
          <SaveNotice className="mt-4" save={save} />
          {/* The mastery bars come from saved progress: until the save lands they would show the old numbers. */}
          <ul className={cx("mt-4 flex flex-col gap-1.5", !saved && "hidden")}>
            {lesson.concepts.map((id) => {
              const c = content.concepts.find((x) => x.id === id);
              const cp = progress.concepts[id];
              return (
                <li key={id} className="flex items-center gap-3 text-fg-2">
                  <span className="h-2 w-28 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-good" style={{ width: `${Math.round((cp?.mastery ?? 0) * 100)}%` }} /></span>
                  <span className="text-fg">{c?.title ?? id}</span>
                  {isMastered(cp) && <span className="text-sm font-semibold text-good">mastered · comes back for review</span>}
                </li>
              );
            })}
          </ul>
          {missed.length > 0 && (
            <div className="mt-5">
              <p className="font-semibold text-fg">Worth another look</p>
              <ul className="mt-1 list-disc pl-5 text-fg-2">
                {missed.slice(0, 5).map((a) => (
                  <li key={a.question.id}>{a.question.explain}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {next && <Button variant="primary" onClick={() => go("lesson", next.id)}>Next: {next.title}</Button>}
            <Button onClick={() => start(Math.floor(Math.random() * 1e9))}>Practise again with new questions</Button>
            <Button variant="ghost" onClick={() => setPhase("read")}>Reread the lesson</Button>
            <Button variant="ghost" onClick={() => go("home")}>Back to the path</Button>
          </div>
        </Card>
      )}

      {phase === "read" && (
        <nav className="mt-6 flex justify-between gap-4 text-sm">
          {prev ? <a className="inline-flex min-h-11 items-center text-fg-3 hover:text-fg" href={href("lesson", prev.id)}>← {prev.title}</a> : <span />}
          {next ? <a className="inline-flex min-h-11 items-center text-right text-fg-3 hover:text-fg" href={href("lesson", next.id)}>{next.title} →</a> : <span />}
        </nav>
      )}
    </article>
  );
}
