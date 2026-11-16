import type { AnswerResult } from "./progress.ts";

// The queue of answers on their way to the server, for one learner. It lives
// above the pages (web/src/state.tsx), so answers that have not been saved
// yet survive moving to another page: every answer waits in the list until
// the server has taken it. A batch that finishes while a save is in flight
// is sent right after it, and after a failed save the answers stay and go
// with the next attempt (the retry button, or the next batch).
//
// It belongs to one learner: `send` names that learner on every request, and
// once the app switches learner the queue is closed, so a save loop still
// running cannot send anything more (whatever was waiting is the old
// learner's, and is not sent as anyone's). Pure: no DOM, no React.

export type SaveResult = { ok: true; dropped: number; lessonDropped: boolean; recovered: boolean } | { ok: false; error: string };

export type LessonDone = { id: string; score: number };

export interface QueueState {
  /** Answers still waiting. */
  unsaved: number;
  /** Something is waiting: answers, or a lesson to mark done. */
  pending: boolean;
  status: "idle" | "saving" | "failed";
  error: string | null;
}

const SAVED: Extract<SaveResult, { ok: true }> = { ok: true, dropped: 0, lessonDropped: false, recovered: false };
const CLOSED: SaveResult = { ok: false, error: "the learner changed before these answers were saved" };

export class AnswerQueue {
  #send: (results: AnswerResult[], lesson?: LessonDone) => Promise<SaveResult>;
  #changed: (state: QueueState) => void;
  #waiting: AnswerResult[] = [];
  #lesson: LessonDone | null = null;
  #running: Promise<SaveResult> | null = null;
  #again = false;
  #closed = false;
  #status: QueueState["status"] = "idle";
  #error: string | null = null;

  constructor(send: (results: AnswerResult[], lesson?: LessonDone) => Promise<SaveResult>, changed: (state: QueueState) => void = () => {}) {
    this.#send = send;
    this.#changed = changed;
  }

  get state(): QueueState {
    return { unsaved: this.#waiting.length, pending: this.#waiting.length > 0 || this.#lesson !== null, status: this.#status, error: this.#error };
  }

  get closed(): boolean {
    return this.#closed;
  }

  #tell(): void {
    if (!this.#closed) this.#changed(this.state);
  }

  /** Queue a batch (and, for a lesson, its completion; the latest wins) and save. */
  add(results: AnswerResult[], lesson?: LessonDone): Promise<SaveResult> {
    if (this.#closed) return Promise.resolve(CLOSED);
    this.#waiting = [...this.#waiting, ...results];
    if (lesson) this.#lesson = lesson;
    this.#tell();
    return this.flush();
  }

  /** Send what is waiting. While a save is in flight, it is asked to go
   *  round again and its promise is returned. */
  flush(): Promise<SaveResult> {
    if (this.#closed) return Promise.resolve(CLOSED);
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#status = "saving";
    this.#tell();
    const run = (async (): Promise<SaveResult> => {
      let res: SaveResult = SAVED;
      let sum = SAVED;
      do {
        if (this.#closed) {
          res = CLOSED;
          break;
        }
        this.#again = false;
        const sending = this.#waiting;
        const lesson = this.#lesson;
        res = await this.#send(sending, lesson ?? undefined);
        if (res.ok) {
          this.#waiting = this.#waiting.slice(sending.length);
          if (this.#lesson === lesson) this.#lesson = null;
          sum = { ok: true, dropped: sum.dropped + res.dropped, lessonDropped: sum.lessonDropped || res.lessonDropped, recovered: sum.recovered || res.recovered };
        }
      } while (res.ok && (this.#again || this.#waiting.length > 0 || this.#lesson));
      const out = res.ok ? sum : res;
      this.#running = null;
      this.#status = out.ok ? "idle" : "failed";
      this.#error = out.ok ? null : out.error;
      this.#tell();
      return out;
    })();
    this.#running = run;
    return run;
  }

  /** The learner changed (or the app went away): send nothing more.
   *  Returns what was still waiting and so will never be saved (answers, and
   *  whether a lesson's completion was among it), for the learner to be told. */
  close(): { answers: number; lesson: boolean } {
    this.#closed = true;
    return { answers: this.#waiting.length, lesson: this.#lesson !== null };
  }

  /** Undo close(): React's development mode unmounts and remounts every
   *  effect once, and the queue must survive that. A real learner switch
   *  makes a new provider and a new queue, so this one is never reopened. */
  open(): void {
    this.#closed = false;
  }
}
