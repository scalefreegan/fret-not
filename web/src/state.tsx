import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppDataContext, type AppData, type Saver, type SaveResult } from "./app-data.ts";
import type { Content } from "../shared/content.ts";
import { emptyProgress, type AnswerResult, type Progress } from "../shared/progress.ts";
import { getProgress, postAnswers, postPlacement, resetProgress } from "./api/progress.ts";

// The two things every page needs: the curriculum (re-read from disk by the
// server on every request) and the learner's progress. This file holds only
// the provider; the types and the hooks that read it are in app-data.ts.

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [progress, setProgress] = useState<Progress>(() => emptyProgress("default", new Date()));
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecoveredFlag] = useState(false);
  const [recoveredTo, setRecoveredTo] = useState<string | null>(null);
  const setRecovered = useCallback((on: boolean, to?: string) => {
    setRecoveredFlag(on);
    setRecoveredTo(on ? (to ?? null) : null);
  }, []);
  const [progressLoaded, setProgressLoaded] = useState(false);

  const reloadContent = useCallback(async () => {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error(`could not load the curriculum (${res.status})`);
      setContent((await res.json()) as Content);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reloadContent();
    getProgress()
      .then((r) => {
        setProgress(r.progress);
        setProgressLoaded(true);
        if (r.recovered) setRecovered(true, r.recoveredTo);
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadContent, setRecovered]);

  const record = useCallback(
    async (results: AnswerResult[], lesson?: { id: string; score: number }): Promise<SaveResult> => {
      try {
        const reply = await postAnswers(results, lesson);
        setProgress(reply.progress);
        setProgressLoaded(true);
        if (reply.recovered) setRecovered(true, reply.recoveredTo);
        return { ok: true, dropped: typeof reply.dropped === "number" && reply.dropped > 0 ? reply.dropped : 0, lessonDropped: reply.lessonDropped === true, recovered: reply.recovered === true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [setRecovered],
  );

  // The queue of answers on their way to the server. It lives here, above
  // the pages, so answers that have not been saved yet survive moving to
  // another page: every answer waits in the list until the server has taken
  // it. A batch that finishes while a save is in flight is sent right after
  // it, and after a failed save the answers stay and go with the next
  // attempt (the retry button, or the next batch).
  const waiting = useRef<AnswerResult[]>([]);
  /** The lesson completion still to be recorded, if any (the latest wins). */
  const lessonWaiting = useRef<{ id: string; score: number } | null>(null);
  const running = useRef<Promise<SaveResult> | null>(null);
  const again = useRef(false);
  const [unsaved, setUnsaved] = useState(0);
  const [pending, setPending] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const sync = useCallback(() => {
    setUnsaved(waiting.current.length);
    setPending(waiting.current.length > 0 || lessonWaiting.current !== null);
  }, []);
  const flush = useCallback((): Promise<SaveResult> => {
    if (running.current) {
      // A save is in flight: it sends what it took; ask it to go round again.
      again.current = true;
      return running.current;
    }
    setSaveStatus("saving");
    const run = (async () => {
      let res: SaveResult;
      let sum: SaveResult = { ok: true, dropped: 0, lessonDropped: false, recovered: false };
      do {
        again.current = false;
        const sending = waiting.current;
        const lesson = lessonWaiting.current;
        res = await record(sending, lesson ?? undefined);
        if (res.ok) {
          waiting.current = waiting.current.slice(sending.length);
          if (lessonWaiting.current === lesson) lessonWaiting.current = null;
          sum = { ok: true, dropped: sum.dropped + res.dropped, lessonDropped: sum.lessonDropped || res.lessonDropped, recovered: sum.recovered || res.recovered };
        }
      } while (res.ok && (again.current || waiting.current.length > 0 || lessonWaiting.current));
      const out = res.ok ? sum : res;
      running.current = null;
      sync();
      setSaveStatus(out.ok ? "idle" : "failed");
      setSaveError(out.ok ? null : out.error);
      return out;
    })();
    running.current = run;
    return run;
  }, [record, sync]);
  const addAnswers = useCallback(
    (results: AnswerResult[], lesson?: { id: string; score: number }) => {
      waiting.current = [...waiting.current, ...results];
      if (lesson) lessonWaiting.current = lesson;
      sync();
      return flush();
    },
    [flush, sync],
  );
  // Closing or reloading the page while answers are still on their way (or
  // stuck after a failed save) would lose them: the browser asks first.
  const leaving = pending || saveStatus === "saving";
  useEffect(() => {
    if (!leaving) return;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [leaving]);
  const saver = useMemo<Saver>(() => ({ add: addAnswers, retry: flush, unsaved, pending, status: saveStatus, error: saveError }), [addAnswers, flush, unsaved, pending, saveStatus, saveError]);

  const value = useMemo<AppData>(
    () => ({
      content,
      progress,
      progressLoaded,
      error,
      recovered,
      recoveredTo,
      reloadContent,
      record,
      saver,
      place: async (level) => {
        const reply = await postPlacement(level);
        setProgress(reply.progress);
        setProgressLoaded(true);
        if (reply.recovered) setRecovered(true, reply.recoveredTo);
      },
      reset: async () => {
        setProgress((await resetProgress()).progress);
        setProgressLoaded(true);
        setRecovered(false);
      },
    }),
    [content, progress, progressLoaded, error, recovered, recoveredTo, reloadContent, record, saver, setRecovered],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
