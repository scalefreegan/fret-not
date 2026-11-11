import type { AnswerResult, Progress } from "../../shared/progress.ts";

// Client for /api/progress (web/server/progress.ts). Every call returns the
// whole, current Progress so the caller can simply replace its state.

export interface ProgressReply {
  progress: Progress;
  /** The stored file was unreadable; it was moved aside and progress starts
   *  empty. Worth telling the learner once. */
  recovered?: boolean;
}

async function call(path: string, body?: unknown): Promise<ProgressReply> {
  const res = await fetch(`/api/progress${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON: handled below */
  }
  if (!res.ok) {
    const message = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : `request failed (${res.status})`;
    throw new Error(message);
  }
  if (!data || typeof data !== "object" || !("progress" in data)) throw new Error("the server sent no progress");
  return data as ProgressReply;
}

export function getProgress(): Promise<ProgressReply> {
  return call("");
}

/** Fold exercise answers in; with `lesson`, also mark that lesson's
 *  exercises finished with this score (0–1). */
export function postAnswers(results: AnswerResult[], lesson?: { id: string; score: number }): Promise<ProgressReply> {
  return call("/answers", lesson ? { results, lesson } : { results });
}

/** The learner tested out of every level below `level`. */
export function postPlacement(level: number): Promise<ProgressReply> {
  return call("/placement", { level });
}

/** Start over. The server keeps the old file under another name. */
export function resetProgress(): Promise<ProgressReply> {
  return call("/reset", {});
}
