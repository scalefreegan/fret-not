import type { AnswerResult, Progress } from "../../shared/progress.ts";
import { json, request } from "./client.ts";

// Client for /api/progress (web/server/progress.ts): the progress of the
// learner this page shows. Every call returns the whole, current Progress so
// the caller can simply replace its state.

export interface ProgressReply {
  progress: Progress;
  /** The stored progress was damaged; it was kept aside (repaired where
   *  it could be, else empty). Worth telling the learner once. */
  recovered?: boolean;
  /** The id of the backup that holds the damaged original. */
  recoveredTo?: string;
  /** POST /answers only: how many answers were not recorded because their
   *  concept is not in the curriculum on disk. */
  dropped?: number;
  /** POST /answers only: the answers were kept but the lesson could not be
   *  marked done (its id is not in the curriculum on disk). */
  lessonDropped?: boolean;
}

async function call(learnerId: string, path: string, body?: unknown): Promise<ProgressReply> {
  const data = await request<unknown>(`/api/progress${path}`, body === undefined ? undefined : json(body), learnerId);
  if (!data || typeof data !== "object" || !("progress" in data)) throw new Error("the server sent no progress");
  return data as ProgressReply;
}

export function getProgress(learnerId: string): Promise<ProgressReply> {
  return call(learnerId, "");
}

/** Fold exercise answers in; with `lesson`, also mark that lesson's
 *  exercises finished with this score (0–1). */
export function postAnswers(learnerId: string, results: AnswerResult[], lesson?: { id: string; score: number }): Promise<ProgressReply> {
  return call(learnerId, "/answers", lesson ? { results, lesson } : { results });
}

/** The learner tested out of every level below `level`. */
export function postPlacement(learnerId: string, level: number): Promise<ProgressReply> {
  return call(learnerId, "/placement", { level });
}

/** Start over. The server keeps the old progress as a backup. */
export function resetProgress(learnerId: string): Promise<ProgressReply> {
  return call(learnerId, "/reset", {});
}
