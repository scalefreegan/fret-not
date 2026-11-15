import type { ErrorCode, ErrorReply, LearnerHeader } from "../../shared/wire.ts";

// The one fetch every API call goes through (progress, Listen, the tutor,
// the curriculum, logins). A learner-scoped call names its learner in
// X-Learner-Id, passed in by the caller: the app for one learner (keyed by
// it in the auth gate) passes its own id, never "whoever is shown now", so a
// save still in flight from before a switch cannot go out as the next
// learner. The session cookie is shared by every tab, so that header is also
// how the server tells a stale tab and refuses it with 409 `stale_learner`
// instead of writing into the wrong learner's progress. It also turns the two replies
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

/** Tell the page (the window, in a browser; nothing under node --test). */
function emit(name: string): void {
  (globalThis as { dispatchEvent?: (e: Event) => boolean }).dispatchEvent?.(new Event(name));
}

function errorOf(body: unknown): Partial<ErrorReply> | null {
  return body && typeof body === "object" ? (body as Partial<ErrorReply>) : null;
}

/** fetch naming `learnerId` (null for the account-level routes), raising
 *  the 401 and stale-learner events. The body is left unread for the caller
 *  (a stream stays a stream). */
export async function apiFetch(url: string, init: RequestInit = {}, learnerId: string | null = null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (learnerId) headers.set(LEARNER_HEADER, learnerId);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) emit(UNAUTHORIZED_EVENT);
  if (res.status === 409) {
    const body: unknown = await res.clone().json().catch(() => null);
    if (errorOf(body)?.code === STALE_LEARNER) emit(STALE_LEARNER_EVENT);
  }
  return res;
}

/** apiFetch, then the JSON body; a non-2xx reply throws an ApiError with
 *  the server's sentence. */
export async function request<T>(url: string, init?: RequestInit, learnerId: string | null = null): Promise<T> {
  const res = await apiFetch(url, init, learnerId);
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
