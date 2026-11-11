import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Content } from "../shared/content.ts";
import { emptyProgress, type AnswerResult, type Progress } from "../shared/progress.ts";
import { getProgress, postAnswers, postPlacement, resetProgress } from "./api/progress.ts";

// The two things every page needs: the curriculum (re-read from disk by the
// server on every request) and the learner's progress.

interface AppData {
  content: Content | null;
  progress: Progress;
  error: string | null;
  /** The stored progress file was unreadable and has been set aside. */
  recovered: boolean;
  reloadContent: () => Promise<void>;
  /** Record answers (and, with `lesson`, that its exercises were finished). */
  record: (results: AnswerResult[], lesson?: { id: string; score: number }) => Promise<void>;
  place: (level: number) => Promise<void>;
  reset: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [progress, setProgress] = useState<Progress>(() => emptyProgress("default", new Date()));
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);

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
        if (r.recovered) setRecovered(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadContent]);

  const value = useMemo<AppData>(
    () => ({
      content,
      progress,
      error,
      recovered,
      reloadContent,
      record: async (results, lesson) => {
        try {
          setProgress((await postAnswers(results, lesson)).progress);
        } catch (e) {
          setError(`Your answers could not be saved: ${(e as Error).message}`);
        }
      },
      place: async (level) => setProgress((await postPlacement(level)).progress),
      reset: async () => setProgress((await resetProgress()).progress),
    }),
    [content, progress, error, recovered, reloadContent],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData outside AppDataProvider");
  return v;
}
