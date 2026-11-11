// Wire types for the tutor chat and its settings: what the server
// (server/chat.ts) and the drawer (src/tutor/) exchange. The curriculum's
// wire shape is shared/content.ts.

/** What the learner is looking at, sent with each message so the tutor can
 *  answer about it. */
export interface TutorContext {
  page: "home" | "lesson" | "review" | "lab" | "sketchpad" | "placement";
  /** Set on a lesson page. */
  lesson?: { id: string; title: string; file: string; concepts: string[] };
  /** Set on a lab page: which explorer is open. */
  lab?: string;
  /** The most recent exercise answers on this page, newest last (at most 10). */
  recent?: { prompt: string; concept: string; correct: boolean; explain: string }[];
}

/** One line of data/chat.jsonl. `commit` lines record an auto-commit the
 *  server made after a tutor turn: text is "<short hash>: <summary>". `note`
 *  lines are the server speaking: content it had to refuse, and why. */
export type ChatRole = "user" | "assistant" | "commit" | "note";

export interface ChatMessage {
  role: ChatRole;
  text: string;
  /** ISO timestamp. */
  ts: string;
}

/** GET /api/chat/history */
export interface ChatHistoryReply {
  messages: ChatMessage[];
}

/** POST /api/chat — answered as SSE (see the Chat* event shapes). 409 when a
 *  run is already in progress: one tutor turn at a time, by design. */
export interface ChatRequest {
  message: string;
  context?: TutorContext;
}

/** SSE `start`: the run began, with the model it went out on. */
export interface ChatStart {
  model: string;
}

/** SSE `heartbeat`, every few seconds while the tutor works. */
export interface ChatHeartbeat {
  elapsed: number;
}

/** SSE `message`: a finished reply (the CLI buffers the whole turn, so there
 *  is nothing to stream before it). A turn that needed the automatic fix
 *  round sends two. `denied` counts tool calls the sandbox refused — a Write
 *  outside content/, say. */
export interface ChatReply extends ChatMessage {
  role: "assistant";
  costUsd: number | null;
  numTurns: number | null;
  denied: number;
}

/** A file the loader refused, as in shared/content.ts. */
export interface ChatProblem {
  file: string;
  message: string;
}

/** SSE `fixing`: the reply's edits broke the content format; the tutor is
 *  getting one automatic turn to repair these. */
export interface ChatFixing {
  problems: ChatProblem[];
}

/** SSE `problems`: what is still refused after the fix round. Also stored in
 *  the history as a `note`, whose text is `text` here. */
export interface ChatProblems {
  problems: ChatProblem[];
  text: string;
  ts: string;
}

/** SSE `commit`, after the reply: what the server did with content/. */
export type ChatCommit = { hash: string; summary: string } | { skipped: true } | { error: string };

/** SSE `error` (the run failed; `error` is a sentence with a hint when the
 *  cause is known: sign-in, usage limit) and `done` (always last). */
export interface ChatError {
  error: string;
}
export interface ChatDone {
  ok: boolean;
}

export interface AgentModel {
  /** What the CLI's --model accepts, e.g. "claude-sonnet-5-5". */
  id: string;
  label: string;
  note: string;
}

/** GET/PUT /api/settings — `models` is the list the UI may pick from; PUT
 *  takes {model} and answers with the same shape. */
export interface SettingsReply {
  model: string;
  models: AgentModel[];
}

export interface SettingsRequest {
  model: string;
}
