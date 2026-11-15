import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppDataContext, type AppData, type Saver, type SaveResult } from "./app-data.ts";
import type { Content } from "../shared/content.ts";
import { AnswerQueue, type QueueState } from "../shared/answer-queue.ts";
import { emptyProgress, type AnswerResult, type Progress } from "../shared/progress.ts";
import { apiFetch } from "./api/client.ts";
import { getProgress, postAnswers, postPlacement, resetProgress } from "./api/progress.ts";

// The two things every page needs: the curriculum (re-read from disk by the
// server on every request) and the progress of the learner this app shows.
// Every call names `learnerId`, this provider's own learner: the auth gate
// remounts the app when the learner changes, and a request still in flight
// from before then goes out as the learner it was made for (the server
// refuses it as stale) rather than as whoever is shown now. This file holds
// only the provider; the types and the hooks that read it are in app-data.ts.

export function AppDataProvider({ learnerId, children }: { learnerId: string; children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [progress, setProgress] = useState<Progress>(() => emptyProgress(learnerId, new Date()));
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
      const res = await apiFetch("/api/content", {}, learnerId);
      if (!res.ok) throw new Error(`could not load the curriculum (${res.status})`);
      setContent((await res.json()) as Content);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [learnerId]);

  useEffect(() => {
    void reloadContent();
    getProgress(learnerId)
      .then((r) => {
        setProgress(r.progress);
        setProgressLoaded(true);
        if (r.recovered) setRecovered(true, r.recoveredTo);
      })
      .catch((e: Error) => setError(e.message));
  }, [learnerId, reloadContent, setRecovered]);

  const record = useCallback(
    async (results: AnswerResult[], lesson?: { id: string; score: number }): Promise<SaveResult> => {
      try {
        const reply = await postAnswers(learnerId, results, lesson);
        setProgress(reply.progress);
        setProgressLoaded(true);
        if (reply.recovered) setRecovered(true, reply.recoveredTo);
        return { ok: true, dropped: typeof reply.dropped === "number" && reply.dropped > 0 ? reply.dropped : 0, lessonDropped: reply.lessonDropped === true, recovered: reply.recovered === true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [learnerId, setRecovered],
  );

  // The queue of answers on their way to the server (web/shared/answer-queue.ts).
  // It lives here, above the pages, so unsaved answers survive moving to
  // another page; it is this learner's, and is closed when the provider goes
  // (a learner switch), so its loop sends nothing more.
  const [queueState, setQueueState] = useState<QueueState>({ unsaved: 0, pending: false, status: "idle", error: null });
  const [queue] = useState(() => new AnswerQueue((results, lesson) => record(results, lesson), setQueueState));
  useEffect(() => {
    queue.open();
    return () => queue.close();
  }, [queue]);
  const { unsaved, pending, status: saveStatus, error: saveError } = queueState;

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
  const saver = useMemo<Saver>(
    () => ({ add: (results, lesson) => queue.add(results, lesson), retry: () => queue.flush(), unsaved, pending, status: saveStatus, error: saveError }),
    [queue, unsaved, pending, saveStatus, saveError],
  );

  const value = useMemo<AppData>(
    () => ({
      learnerId,
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
        const reply = await postPlacement(learnerId, level);
        setProgress(reply.progress);
        setProgressLoaded(true);
        if (reply.recovered) setRecovered(true, reply.recoveredTo);
      },
      reset: async () => {
        setProgress((await resetProgress(learnerId)).progress);
        setProgressLoaded(true);
        setRecovered(false);
      },
    }),
    [learnerId, content, progress, progressLoaded, error, recovered, recoveredTo, reloadContent, record, saver, setRecovered],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
