import { useMemo } from "react";
import type { Lesson } from "../../shared/content.ts";
import { dueConcepts, isMastered, lessonState, levelStatuses, nextLesson, reviewableConcepts, UNLOCK_FRACTION } from "../../shared/progress.ts";
import { go, href } from "../router.ts";
import { useAppData } from "../app-data.ts";
import { Button, Card, cx } from "../ui.tsx";

// The path: every level, its lessons in three columns (theory, piano,
// guitar), what is done, what is next, and what is due for review.

/** `state`: "attempted" is a batch finished below the pass mark (two right
 *  out of eleven is not "done"): shown as tried, with its best score, not
 *  with the green tick. */
function LessonRow({ lesson, state, best, isNext, locked }: { lesson: Lesson; state: "new" | "attempted" | "done"; best: number; isNext: boolean; locked: boolean }) {
  const done = state !== "new";
  const weak = state === "attempted";
  return (
    <a
      href={locked ? undefined : href("lesson", lesson.id)}
      aria-disabled={locked}
      title={lesson.summary}
      className={cx("group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors pointer-coarse:min-h-11 pointer-coarse:items-start pointer-coarse:py-2", locked ? "cursor-not-allowed opacity-50" : "hover:bg-raised active:bg-raised", isNext && "bg-accent-soft")}
    >
      <span aria-hidden="true" className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[0.7rem] font-bold", done && weak ? "border-warn text-warn" : done ? "border-good bg-good text-panel" : isNext ? "border-accent" : "border-line-strong")}>{done ? (weak ? "~" : "✓") : ""}</span>
      {done && <span className="sr-only">{weak ? `Tried, best ${Math.round(best * 100)}%, not done yet: ` : "Done: "}</span>}
      {/* A mouse gets the summary as a tooltip. A finger cannot hover, so on
          a touch screen the title wraps in full and the summary sits under it. */}
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate pointer-coarse:overflow-visible pointer-coarse:whitespace-normal", done && !weak ? "text-fg-2" : "font-medium text-fg")}>{lesson.title}</span>
        <span className="hidden text-sm leading-snug text-fg-3 pointer-coarse:block">{lesson.summary}</span>
      </span>
      {weak && !isNext && <span aria-hidden="true" className="text-xs font-semibold text-warn">best {Math.round(best * 100)}%</span>}
      {isNext && <span className="text-xs font-bold text-accent">NEXT</span>}
    </a>
  );
}

export function HomePage() {
  const { content, progress, reset } = useAppData();
  const now = useMemo(() => new Date(), []);
  if (!content) return null;
  const statuses = levelStatuses(content, progress);
  const next = nextLesson(content, progress);
  const due = dueConcepts(progress, now, reviewableConcepts(content));
  const started = Object.keys(progress.lessons).length > 0 || progress.placedLevel > 0;
  const mastered = content.concepts.filter((c) => isMastered(progress.concepts[c.id])).length;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <section className="grid gap-4 @container md:grid-cols-[1.5fr_1fr]">
        <Card className="flex flex-col justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-sm font-bold tracking-wide text-accent uppercase">{started ? "Continue" : "Start here"}</p>
            {next ? (
              <>
                <h1 className="mt-1 text-3xl leading-tight font-bold text-fg">{next.title}</h1>
                <p className="mt-1 text-fg-2">{next.summary}</p>
              </>
            ) : (
              <>
                <h1 className="mt-1 text-3xl font-bold text-fg">Everything open is done.</h1>
                <p className="mt-1 text-fg-2">Keep reviewing to unlock the next level, or ask the Tutor to write you a new lesson.</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {next && <Button variant="primary" onClick={() => go("lesson", next.id)}>{started ? "Continue" : "Begin"} · Level {next.level}</Button>}
            {!started && <Button variant="ghost" onClick={() => go("placement")}>I already know some of this: place me</Button>}
          </div>
        </Card>
        <Card className="flex flex-col justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <p className="text-sm font-bold tracking-wide text-fg-3 uppercase">Review</p>
            <p className="mt-1 font-display text-3xl font-bold text-fg">{due.length ? `${due.length} due` : "Nothing due"}</p>
            <p className="mt-1 text-fg-2">{due.length ? "Short questions on ideas you have already mastered, spaced so they stick." : `${mastered} of ${content.concepts.length} concepts mastered. Mastered ideas come back here at growing intervals.`}</p>
          </div>
          <div>{due.length > 0 ? <Button variant="primary" onClick={() => go("review")}>Review now</Button> : mastered > 0 ? <Button onClick={() => go("review")}>Practise anyway</Button> : null}</div>
        </Card>
      </section>

      {content.problems.length > 0 && (
        <Card className="mt-4 border-warn bg-warn-soft px-5 py-3">
          <p className="font-semibold text-fg">Content problems ({content.problems.length})</p>
          <p className="text-sm text-fg-2">These files were refused by the loader and are not shown. Fix them, or ask the Tutor to.</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs break-words text-fg-2">
            {content.problems.slice(0, 12).map((p, i) => (
              <li key={i}>{p.file}: {p.message}</li>
            ))}
          </ul>
        </Card>
      )}

      {content.levels.map((level) => {
        const st = statuses.find((s) => s.level === level.id)!;
        const lessons = content.lessons.filter((l) => l.level === level.id);
        const outline = level.status === "outline";
        // The level that gates this one is the nearest earlier level with
        // something to master, which is not always the one just before.
        const target = Math.ceil(st.gateTotal * UNLOCK_FRACTION - 1e-9);
        const need = Math.max(0, target - st.gateMastered);
        // Which concepts the count is over: the theory plus the instrument(s)
        // this learner is furthest along with, not every concept of the level
        // (which is what the "n/m mastered" bar beside the heading counts).
        const trackNames = st.gateTracks.map((t) => (t === "core" ? "theory" : (content.tracks.find((x) => x.id === t)?.title ?? t).toLowerCase()));
        const over = trackNames.length > 1 ? `${trackNames.slice(0, -1).join(", ")} and ${trackNames[trackNames.length - 1]}` : (trackNames[0] ?? "");
        return (
          <section key={level.id} className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
              <div className="min-w-0">
                <h2 className={cx("text-2xl font-bold", st.unlocked ? "text-fg" : "text-fg-3")}>
                  <span className="mr-2 text-fg-3">{level.id}</span>
                  {level.title}
                </h2>
                <p className="text-fg-2">{level.summary}</p>
              </div>
              {!outline && (
                <div className="flex items-center gap-2 text-sm text-fg-3">
                  <span className="h-2 w-32 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-good transition-[width]" style={{ width: `${st.total ? (st.mastered / st.total) * 100 : 0}%` }} /></span>
                  <span className="tabular-nums">{st.mastered}/{st.total} mastered</span>
                </div>
              )}
            </div>
            {outline ? (
              <Card className="mt-3 border-dashed px-5 py-3">
                <p className="text-sm font-semibold text-fg-3">Outlined, not yet written. Ask the Tutor to write a lesson on any of these:</p>
                <ul className="mt-1 grid gap-x-6 text-fg-2 sm:grid-cols-2">
                  {level.topics.map((t) => (
                    <li key={t} className="before:mr-2 before:text-fg-3 before:content-['·']">{t}</li>
                  ))}
                </ul>
              </Card>
            ) : (
              <>
                {!st.unlocked && (
                  <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-sm text-fg-2">
                    Locked. {st.gate !== null ? `It opens when ${target} of level ${st.gate}'s ${st.gateTotal} ${over} concepts are mastered: you have ${st.gateMastered}, so ${need} more. Or ` : "To open it, "}<a className="font-semibold underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center" href={href("placement")}>take the placement check</a>.
                  </p>
                )}
                <Card className="mt-3 grid gap-x-4 gap-y-3 px-2 py-3 sm:px-3 md:grid-cols-3">
                  {content.tracks.map((track) => {
                    const mine = lessons.filter((l) => l.track === track.id);
                    return (
                      <div key={track.id}>
                        <p className="px-2.5 pb-1 text-xs font-bold tracking-wide text-fg-3 uppercase">{track.id === "core" ? "Theory" : track.title}</p>
                        {mine.length === 0 && <p className="px-2.5 text-sm text-fg-3">—</p>}
                        {mine.map((l) => (
                          <LessonRow key={l.id} lesson={l} state={lessonState(progress.lessons[l.id])} best={progress.lessons[l.id]?.bestScore ?? 0} isNext={next?.id === l.id} locked={!st.unlocked} />
                        ))}
                      </div>
                    );
                  })}
                </Card>
              </>
            )}
          </section>
        );
      })}

      {started && (
        <p className="mt-10 text-center text-sm text-fg-3">
          <button type="button" className="min-h-11 px-2 py-3 underline hover:text-fg" onClick={() => { if (window.confirm("Start over? Your current progress is archived in data/profiles/default/, not deleted.")) void reset(); }}>Reset progress</button>
          {" · "}
          <a className="inline-flex min-h-11 items-center px-2 py-3 underline hover:text-fg" href={href("placement")}>Placement check</a>
        </p>
      )}
    </div>
  );
}
