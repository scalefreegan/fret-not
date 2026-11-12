import { useCallback, useEffect, useMemo, useState } from "react";
import type { Answered } from "./exercises/Runner.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Gallery } from "./pages/Gallery.tsx";
import { HomePage } from "./pages/Home.tsx";
import { LabPage } from "./pages/Lab.tsx";
import { LessonPage } from "./pages/Lesson.tsx";
import { PlacementPage, ReviewPage } from "./pages/Review.tsx";
import { SketchpadPage } from "./pages/Sketchpad.tsx";
import { href, useRoute } from "./router.ts";
import { useAppData } from "./app-data.ts";
import { AppDataProvider } from "./state.tsx";
import { TutorDrawer, type TutorContext } from "./tutor/index.tsx";
import { Button, Card, cx, UnsavedBanner } from "./ui.tsx";
import { dueConcepts, levelStatuses, reviewableConcepts } from "../shared/progress.ts";

function Logo() {
  return (
    <a href={href("home")} aria-label="Fret Not: the path" className="flex min-h-11 shrink-0 items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <span className="font-display text-[1.35rem] font-bold tracking-tight text-fg">Fret Not</span>
    </a>
  );
}

/** "Saving…" in the header once a save has been in flight for a moment, so
 *  a slow connection is not silent. A quick save never shows it. */
function SavingPill({ saving }: { saving: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!saving) return setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 700);
    return () => window.clearTimeout(t);
  }, [saving]);
  return (
    <span role="status" className="shrink-0 text-sm font-medium text-fg-3">
      {slow && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
          Saving…
        </span>
      )}
    </span>
  );
}

/** A lesson of a level that is not open yet, reached by its address. */
function LockedLesson({ title, level, onOpen }: { title: string; level: number; onOpen: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <Card className="px-4 py-5 sm:px-6 sm:py-6">
        <p className="text-sm font-bold tracking-wide text-fg-3 uppercase">Level {level} · locked</p>
        <h1 className="mt-1 text-3xl leading-tight font-bold text-fg">{title}</h1>
        <p className="mt-2 text-lg text-fg-2">This lesson belongs to a level that is not open yet. It opens when enough of the level before it is mastered (the path says how much is left), or at once if the placement check shows you already know that material.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={href("placement")} className="inline-flex min-h-11 items-center rounded-lg border border-accent-edge bg-accent px-4 font-display font-semibold text-accent-ink hover:bg-accent-hover">Take the placement check</a>
          <a href={href("home")} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-raised px-4 font-display font-semibold text-fg hover:border-line-strong">Back to the path</a>
          <Button variant="ghost" onClick={onOpen}>Read it anyway</Button>
        </div>
      </Card>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { content, progress, progressLoaded, error, recovered, recoveredTo, reloadContent, saver } = useAppData();
  /** Locked lessons the learner chose to open anyway, for this visit. */
  const [peeked, setPeeked] = useState<string[]>([]);
  const [recent, setRecent] = useState<NonNullable<TutorContext["recent"]>>([]);
  const onAnswer = useCallback((a: Answered) => setRecent((r) => [...r, { prompt: a.question.prompt, concept: a.question.concept, correct: a.correct, explain: a.question.explain }].slice(-10)), []);
  const lesson = route.name === "lesson" ? content?.lessons.find((l) => l.id === route.arg) : undefined;
  const due = useMemo(() => dueConcepts(progress, new Date(), content ? reviewableConcepts(content) : undefined).length, [progress, content]);
  const context: TutorContext = useMemo(() => {
    const page = (["lesson", "review", "lab", "sketchpad", "placement"].includes(route.name) ? route.name : "home") as TutorContext["page"];
    return { page, ...(lesson ? { lesson: { id: lesson.id, title: lesson.title, file: `content/${lesson.file}`, concepts: lesson.concepts } } : {}), ...(route.name === "lab" && route.arg ? { lab: route.arg } : {}), ...(recent.length ? { recent } : {}) };
  }, [route, lesson, recent]);

  if (route.name === "gallery") return <Gallery only={route.arg} />;
  const tabs: { name: string; label: string; badge?: number }[] = [
    { name: "home", label: "Path" },
    { name: "review", label: "Review", badge: due },
    { name: "lab", label: "Lab" },
    { name: "sketchpad", label: "Sketchpad" },
  ];
  const activeTab = route.name === "lesson" || route.name === "placement" ? "home" : route.name;
  let page;
  if (!content) page = <p className="p-6 text-fg-3 sm:p-10">{error ?? "Loading…"}</p>;
  else if (route.name === "lesson" && lesson && !progressLoaded) page = <p className="p-6 text-fg-3 sm:p-10">Loading…</p>;
  else if (route.name === "lesson" && lesson && !peeked.includes(lesson.id) && !progress.lessons[lesson.id] && levelStatuses(content, progress).find((s) => s.level === lesson.level)?.unlocked === false) page = <LockedLesson title={lesson.title} level={lesson.level} onOpen={() => setPeeked((p) => [...p, lesson.id])} />;
  else if (route.name === "lesson") page = lesson ? <LessonPage key={lesson.id} lesson={lesson} onAnswer={onAnswer} /> : <p className="p-6 text-fg-2 sm:p-10">There is no lesson called “{route.arg}”. <a className="underline" href={href("home")}>Back to the path</a></p>;
  else if (route.name === "review") page = <ReviewPage onAnswer={onAnswer} />;
  // The placement check asks about the tracks the learner follows, which it
  // reads from saved progress when it starts: not from the empty placeholder.
  else if (route.name === "placement") page = progressLoaded ? <PlacementPage /> : <p className="p-6 text-fg-3 sm:p-10">Loading…</p>;
  else if (route.name === "lab") page = <LabPage tool={route.arg} />;
  else if (route.name === "sketchpad") page = <SketchpadPage />;
  else page = <HomePage />;

  const tabLink = (t: (typeof tabs)[number], bar: boolean) => (
    <a
      key={t.name}
      href={href(t.name)}
      aria-current={activeTab === t.name ? "page" : undefined}
      className={cx(
        "flex shrink-0 items-center justify-center gap-1.5 font-semibold transition-colors",
        bar ? "min-h-14 flex-1 text-[0.95rem]" : "rounded-lg px-3 py-1.5 text-base pointer-coarse:min-h-11",
        activeTab === t.name ? (bar ? "text-fg shadow-[inset_0_3px_0_var(--accent)]" : "bg-accent-soft text-fg") : "text-fg-3 hover:bg-raised hover:text-fg active:bg-raised",
      )}
    >
      {t.label}
      {!!t.badge && <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-ink">{t.badge}</span>}
    </a>
  );

  // The shell fills the visible viewport (dvh: a phone's browser bars come
  // and go) and keeps clear of the notch and the home indicator. Sections sit
  // in the header on a tablet or desktop and in a bottom bar on a phone,
  // where a thumb reaches them.
  return (
    <div className="flex h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <div id="app-page" className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex shrink-0 items-center gap-6 border-b border-line bg-panel px-4 pt-[env(safe-area-inset-top)] pr-28 sm:px-5 sm:pr-32">
          <div className="flex h-14 min-w-0 items-center gap-6">
            <Logo />
            <nav className="hidden min-w-0 gap-1 sm:flex" aria-label="Sections">
              {tabs.map((t) => tabLink(t, false))}
            </nav>
            <SavingPill saving={saver.status === "saving"} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" id="main-scroll">
          {saver.status === "failed" && <UnsavedBanner count={saver.unsaved} lesson={saver.pending} error={saver.error} onRetry={() => void saver.retry()} />}
          {error && content && <p className="mx-4 mt-4 rounded-lg border border-bad bg-bad-soft px-4 py-2 text-fg sm:mx-5">{error}</p>}
          {recovered && <p className="mx-4 mt-4 rounded-lg border border-warn bg-warn-soft px-4 py-2 text-fg sm:mx-5">Your saved progress file could not be read. It has been set aside {recoveredTo ? <>as <code className="font-mono text-sm break-all">{recoveredTo}</code></> : "in data/profiles/default/"} and progress starts fresh.</p>}
          <ErrorBoundary key={`${route.name}/${route.arg ?? ""}`} label="page">{page}</ErrorBoundary>
        </main>
        <nav className="z-10 flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Sections">
          {tabs.map((t) => tabLink(t, true))}
        </nav>
      </div>
      <TutorDrawer context={context} onContentChanged={() => void reloadContent()} />
    </div>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
