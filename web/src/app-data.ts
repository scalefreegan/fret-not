import { createContext, useCallback, useContext, useState } from "react";
import type { Content } from "../shared/content.ts";
import type { AnswerResult, Progress } from "../shared/progress.ts";

// The app's shared data as pages see it: the types, the context and the hooks
// that read it. The provider that fills it is in state.tsx. They are separate
// files so that each hot-reloads cleanly: a file that exported both the
// provider component and these hooks could not be fast-refreshed, and an edit
// to it left pages reading a new context that no provider was filling
// ("useAppData outside AppDataProvider").

/** What became of a save. On `ok: true` the server answered, and says what
 *  it did not keep: `dropped` answers whose concept the curriculum on disk
 *  does not list; `lessonDropped` when the answers were kept but the lesson
 *  could not be marked done (its id is not in the curriculum on disk);
 *  `recovered` when the progress file was unreadable, was set aside, and
 *  this save started a fresh one. On `ok: false` nothing was recorded: the
 *  caller keeps the answers and offers a retry. */
export type SaveResult = { ok: true; dropped: number; lessonDropped: boolean; recovered: boolean } | { ok: false; error: string };

/** The save queue every page shares. `pending`: something is still waiting
 *  (answers, or a lesson to mark done). `status: "failed"`: the last attempt
 *  did not get through and `error` says why; nothing is lost, `retry` sends
 *  it again. */
export interface Saver {
  add: (results: AnswerResult[], lesson?: { id: string; score: number }) => Promise<SaveResult>;
  retry: () => Promise<SaveResult>;
  unsaved: number;
  pending: boolean;
  status: "idle" | "saving" | "failed";
  error: string | null;
}

export interface AppData {
  content: Content | null;
  progress: Progress;
  /** False until the saved progress has arrived: until then `progress` is an
   *  empty placeholder, and nothing should be decided from it. */
  progressLoaded: boolean;
  error: string | null;
  /** The stored progress file was unreadable and has been set aside. */
  recovered: boolean;
  /** Where it was set aside, when the server says. */
  recoveredTo: string | null;
  reloadContent: () => Promise<void>;
  /** Record answers (and, with `lesson`, that its exercises were finished). */
  record: (results: AnswerResult[], lesson?: { id: string; score: number }) => Promise<SaveResult>;
  /** The shared queue of answers on their way to the server. */
  saver: Saver;
  /** Rejects when the placement could not be saved; the caller shows it. */
  place: (level: number) => Promise<void>;
  reset: () => Promise<void>;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(AppDataContext);
  if (!v) throw new Error("useAppData outside AppDataProvider");
  return v;
}

const SAVED: SaveResult = { ok: true, dropped: 0, lessonDropped: false, recovered: false };

/** A page's view of the shared save queue (see AppDataProvider): `save` is
 *  what became of the saves this page asked for, `unsaved` how many answers
 *  are still waiting in the queue. The queue outlives the page, so answers
 *  handed over just before leaving are still saved (or kept for a retry,
 *  which the shell offers on every page). */
export function useAnswerSaver(): {
  save: SaveResult | "saving" | null;
  unsaved: number;
  /** Add a batch (and, for a lesson, its completion) and save. */
  add: (results: AnswerResult[], lesson?: { id: string; score: number }) => Promise<SaveResult>;
  /** Try again with whatever is waiting. */
  retry: () => Promise<SaveResult>;
} {
  const { saver } = useAppData();
  const [mine, setMine] = useState<SaveResult | "saving" | null>(null);
  const follow = useCallback((p: Promise<SaveResult>) => {
    setMine("saving");
    return p.then((r) => {
      setMine(r);
      return r;
    });
  }, []);
  const { add: queueAdd, retry: queueRetry } = saver;
  const add = useCallback((results: AnswerResult[], lesson?: { id: string; score: number }) => follow(queueAdd(results, lesson)), [follow, queueAdd]);
  const retry = useCallback(() => follow(queueRetry()), [follow, queueRetry]);
  // A save that failed here and has since gone through (retried from the
  // shell's notice) is saved.
  const save = mine !== null && mine !== "saving" && !mine.ok && !saver.pending && saver.status === "idle" ? SAVED : mine;
  return { save, unsaved: saver.unsaved, add, retry };
}
