import type { ErrorCode, ErrorReply, LearnerHeader } from "../../shared/wire.ts";

// The one fetch every API call goes through (progress, Listen, the tutor,
// the curriculum, logins). It names the learner this page shows in
// X-Learner-Id: the session cookie is shared by every tab, so that header is
// how the server tells a stale tab (one still showing a learner another tab
// switched away from) and refuses it with 409 `stale_learner` instead of
// writing into the wrong learner's progress. It also turns the two replies
// the auth gate must hear about into window events, so no caller has to:
//
//   401                   → UNAUTHORIZED_EVENT  (logged out, expired, disabled)
//   409 stale_learner     → STALE_LEARNER_EVENT (another tab switched learner)
//
// The gate re-reads /api/auth/me on either and shows the right screen.

export const UNAUTHORIZED_EVENT = "fret-not:unauthorized";
export const STALE_LEARNER_EVENT = "fret-not:stale-learner";

const LEARNER_HEADER: LearnerHeader = "X-Learner-Id";
const STALE_LEARNER: ErrorCode = "stale_learner";

/** A non-2xx reply: `message` is the server's `{error}` sentence. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: ErrorCode;
  constructor(message: string, status: number, code?: ErrorCode) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) this.code = code;
  }
}

let pageLearner: string | null = null;

/** Set by the auth gate whenever the learner it shows changes. */
export function setPageLearner(learnerId: string | null): void {
  pageLearner = learnerId;
}

/** The learner this page shows, or null before one is picked. */
export function getPageLearner(): string | null {
  return pageLearner;
}

function errorOf(body: unknown): Partial<ErrorReply> | null {
  return body && typeof body === "object" ? (body as Partial<ErrorReply>) : null;
}

/** fetch with the page's learner, raising the 401 and stale-learner events.
 *  The body is left unread for the caller (a stream stays a stream). */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (pageLearner) headers.set(LEARNER_HEADER, pageLearner);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (res.status === 409) {
    const body: unknown = await res.clone().json().catch(() => null);
    if (errorOf(body)?.code === STALE_LEARNER) window.dispatchEvent(new Event(STALE_LEARNER_EVENT));
  }
  return res;
}

/** apiFetch, then the JSON body; a non-2xx reply throws an ApiError with
 *  the server's sentence. */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: an error page, handled below */
  }
  if (!res.ok) {
    const reply = errorOf(body);
    throw new ApiError(typeof reply?.error === "string" ? reply.error : text.slice(0, 200) || `request failed (${res.status})`, res.status, reply?.code);
  }
  return body as T;
}

/** A JSON request body. */
export function json(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
