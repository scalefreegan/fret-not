import type { FirstRunReply, FirstRunRequest, LearnerReply, LearnerRequest, LoginRequest, MeReply, PickLearnerRequest } from "../../shared/wire.ts";
import { json, request } from "./client.ts";

// Client for /api/auth and /api/learners (web/server/auth.ts).

/** Who is logged in, on which learner (or that no account exists yet). */
export function getMe(): Promise<MeReply> {
  return request<MeReply>("/api/auth/me");
}

/** Sets the session cookie. A wrong password is a 401 with a sentence. */
export function login(username: string, password: string): Promise<MeReply> {
  return request<MeReply>("/api/auth/login", json({ username, password } satisfies LoginRequest));
}

/** The first account (an admin), only while there are none, only on this Mac. */
export function createFirstAccount(username: string, password: string, learnerName?: string): Promise<FirstRunReply> {
  return request<FirstRunReply>("/api/auth/first-run", json({ username, password, ...(learnerName?.trim() ? { learnerName } : {}) } satisfies FirstRunRequest));
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/logout", json({}));
}

/** Which learner this session shows (null: back to the picker). */
export function pickLearner(learnerId: string | null): Promise<MeReply> {
  return request<MeReply>("/api/auth/learner", json({ learnerId } satisfies PickLearnerRequest, "PUT"));
}

export function createLearner(name: string): Promise<LearnerReply> {
  return request<LearnerReply>("/api/learners", json({ name } satisfies LearnerRequest));
}

export function renameLearner(id: string, name: string): Promise<LearnerReply> {
  return request<LearnerReply>(`/api/learners/${encodeURIComponent(id)}`, json({ name } satisfies LearnerRequest, "PATCH"));
}

/** The learner leaves the lists; its progress and chat are kept. */
export function archiveLearner(id: string): Promise<LearnerReply> {
  return request<LearnerReply>(`/api/learners/${encodeURIComponent(id)}/archive`, json({}));
}
