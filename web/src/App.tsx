import { useCallback, useMemo, useState } from "react";
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
import { cx, UnsavedBanner } from "./ui.tsx";
import { dueConcepts, reviewableConcepts } from "../shared/progress.ts";

function Logo() {
  return (
    <a href={href("home")} aria-label="Fret Not: the path" className="flex min-h-11 shrink-0 items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <span className="font-display text-[1.35rem] font-bold tracking-tight text-fg">Fret Not</span>
    </a>
  );
}

function Shell() {
  const route = useRoute();
  const { content, progress, error, recovered, recoveredTo, reloadContent, saver } = useAppData();
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
  else if (route.name === "lesson") page = lesson ? <LessonPage key={lesson.id} lesson={lesson} onAnswer={onAnswer} /> : <p className="p-6 text-fg-2 sm:p-10">There is no lesson called “{route.arg}”. <a className="underline" href={href("home")}>Back to the path</a></p>;
  else if (route.name === "review") page = <ReviewPage onAnswer={onAnswer} />;
  else if (route.name === "placement") page = <PlacementPage />;
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
