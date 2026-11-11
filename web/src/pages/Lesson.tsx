import { useMemo, useState } from "react";
import type { Content, Lesson } from "../../shared/content.ts";
import type { Question } from "../../shared/exercise-types.ts";
import { generateQuestions } from "../../shared/exercises.ts";
import { isMastered } from "../../shared/progress.ts";
import { ExerciseRunner, type Answered } from "../exercises/Runner.tsx";
import { Markdown } from "../markdown.tsx";
import { go, href, scrollTop } from "../router.ts";
import { useAppData } from "../state.tsx";
import { Button, Card, cx } from "../ui.tsx";
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

export function LessonPage({ lesson, onAnswer }: { lesson: Lesson; onAnswer?: (a: Answered) => void }) {
  const { content, progress, record } = useAppData();
  const [phase, setPhase] = useState<"read" | "practice" | "done">("read");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [answered, setAnswered] = useState<Answered[]>([]);
  const questions = useMemo<Question[]>(() => lesson.exercises.flatMap((decl, i) => generateQuestions(decl, seed + i * 7919)), [lesson, seed]);
  if (!content) return null;
  const { prev, next } = neighbours(content, lesson);
  const level = content.levels.find((l) => l.id === lesson.level);
  const done = progress.lessons[lesson.id];
  const score = answered.length ? answered.filter((a) => a.correct).length / answered.length : 0;
  const finish = (all: Answered[]) => {
    setAnswered(all);
    setPhase("done");
    void record(all.map((a) => ({ concept: a.question.concept, correct: a.correct })), { id: lesson.id, score: all.length ? all.filter((a) => a.correct).length / all.length : 1 });
  };
  const finishNoExercises = () => {
    void record([], { id: lesson.id, score: 1 });
    if (next) go("lesson", next.id);
    else go("home");
  };
  const missed = answered.filter((a) => !a.correct);

  return (
    <article className="mx-auto max-w-3xl px-5 pt-8 pb-24">
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-fg-3">
          <a href={href("home")} className="font-semibold hover:text-fg">Path</a>
          <span>›</span>
          <span>Level {lesson.level}{level ? ` · ${level.title}` : ""}</span>
          <TrackBadge track={lesson.track} />
          {done && <span className="font-semibold text-good">✓ done{done.bestScore < 1 ? ` · best ${Math.round(done.bestScore * 100)}%` : ""}</span>}
        </div>
        <h1 className="text-4xl leading-tight font-bold text-fg">{lesson.title}</h1>
        <p className="mt-2 text-lg text-fg-2">{lesson.summary}</p>
      </header>

      {phase === "read" && (
        <>
          {lesson.blocks.map((b, i) => (b.type === "prose" ? <Markdown key={i} source={b.markdown} /> : <RenderWidget key={i} type={b.widget} params={b.params} />))}
          <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            {questions.length > 0 ? (
              <>
                <div>
                  <p className="font-display text-xl font-bold text-fg">Practice</p>
                  <p className="text-fg-2">{questions.length} questions on {lesson.concepts.map((c) => content.concepts.find((x) => x.id === c)?.title.toLowerCase() ?? c).join(", ")}.</p>
                </div>
                <Button variant="primary" onClick={() => { setPhase("practice"); scrollTop(); }}>Start practice</Button>
              </>
            ) : (
              <>
                <p className="text-fg-2">This lesson has no exercises.</p>
                <Button variant="primary" onClick={finishNoExercises}>Mark as done{next ? " and continue" : ""}</Button>
              </>
            )}
          </Card>
        </>
      )}

      {phase === "practice" && (
        <Card className="px-5 py-5">
          <ExerciseRunner questions={questions} onDone={finish} onAnswer={onAnswer} />
          <div className="mt-5 text-center">
            <Button variant="ghost" size="sm" onClick={() => setPhase("read")}>Back to the lesson</Button>
          </div>
        </Card>
      )}

      {phase === "done" && (
        <Card className="px-6 py-6">
          <p className="font-display text-3xl font-bold text-fg">{score >= 0.9 ? "Excellent." : score >= 0.7 ? "Good work." : "A solid start."}</p>
          <p className="mt-1 text-lg text-fg-2">
            {answered.filter((a) => a.correct).length} of {answered.length} correct.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5">
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
            <Button onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setAnswered([]); setPhase("practice"); }}>Practise again with new questions</Button>
            <Button variant="ghost" onClick={() => setPhase("read")}>Reread the lesson</Button>
            <Button variant="ghost" onClick={() => go("home")}>Back to the path</Button>
          </div>
        </Card>
      )}

      {phase === "read" && (
        <nav className="mt-6 flex justify-between gap-4 text-sm">
          {prev ? <a className="text-fg-3 hover:text-fg" href={href("lesson", prev.id)}>← {prev.title}</a> : <span />}
          {next ? <a className="text-right text-fg-3 hover:text-fg" href={href("lesson", next.id)}>{next.title} →</a> : <span />}
        </nav>
      )}
    </article>
  );
}
