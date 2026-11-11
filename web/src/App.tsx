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
import { AppDataProvider, useAppData } from "./state.tsx";
import { TutorDrawer, type TutorContext } from "./tutor/index.tsx";
import { cx } from "./ui.tsx";
import { dueConcepts } from "../shared/progress.ts";

function Logo() {
  return (
    <a href={href("home")} className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <span className="font-display text-[1.35rem] font-bold tracking-tight text-fg">Fret Not</span>
    </a>
  );
}

function Shell() {
  const route = useRoute();
  const { content, progress, error, recovered, reloadContent } = useAppData();
  const [recent, setRecent] = useState<NonNullable<TutorContext["recent"]>>([]);
  const onAnswer = useCallback((a: Answered) => setRecent((r) => [...r, { prompt: a.question.prompt, concept: a.question.concept, correct: a.correct, explain: a.question.explain }].slice(-10)), []);
  const lesson = route.name === "lesson" ? content?.lessons.find((l) => l.id === route.arg) : undefined;
  const due = useMemo(() => dueConcepts(progress, new Date()).length, [progress]);
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
  if (!content) page = <p className="p-10 text-fg-3">{error ?? "Loading…"}</p>;
  else if (route.name === "lesson") page = lesson ? <LessonPage key={lesson.id} lesson={lesson} onAnswer={onAnswer} /> : <p className="p-10 text-fg-2">There is no lesson called “{route.arg}”. <a className="underline" href={href("home")}>Back to the path</a></p>;
  else if (route.name === "review") page = <ReviewPage onAnswer={onAnswer} />;
  else if (route.name === "placement") page = <PlacementPage />;
  else if (route.name === "lab") page = <LabPage tool={route.arg} />;
  else if (route.name === "sketchpad") page = <SketchpadPage />;
  else page = <HomePage />;

  return (
    <div className="flex h-screen">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-14 shrink-0 items-center gap-6 border-b border-line bg-panel px-5">
          <Logo />
          <nav className="flex gap-1" aria-label="Sections">
            {tabs.map((t) => (
              <a key={t.name} href={href(t.name)} aria-current={activeTab === t.name ? "page" : undefined} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors", activeTab === t.name ? "bg-accent-soft text-fg" : "text-fg-3 hover:bg-raised hover:text-fg")}>
                {t.label}
                {!!t.badge && <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-ink">{t.badge}</span>}
              </a>
            ))}
          </nav>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto" id="main-scroll">
          {error && content && <p className="mx-5 mt-4 rounded-lg border border-bad bg-bad-soft px-4 py-2 text-fg">{error}</p>}
          {recovered && <p className="mx-5 mt-4 rounded-lg border border-warn bg-warn-soft px-4 py-2 text-fg">Your saved progress file could not be read. It has been set aside in data/profiles/default/ and progress starts fresh.</p>}
          <ErrorBoundary key={`${route.name}/${route.arg ?? ""}`} label="page">{page}</ErrorBoundary>
        </main>
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
