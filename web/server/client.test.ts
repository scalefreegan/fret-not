import assert from "node:assert/strict";
import { test } from "node:test";
import { apiFetch, request } from "../src/api/client.ts";
import { getProgress } from "../src/api/progress.ts";

// The browser's one fetch (web/src/api/client.ts): the learner a call names
// is the one its caller passed, never a page-wide "current learner" that a
// switch could change under a save already on its way.

test("a call names exactly the learner it was given, and an account-level call names none", async () => {
  const seen: (string | null)[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("X-Learner-Id"));
    return new Response(JSON.stringify({ progress: { version: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    await getProgress("learner-a");
    const later = getProgress("learner-b");
    await request("/api/auth/me");
    await apiFetch("/api/content", {}, "learner-a");
    await later;
    assert.deepEqual(seen, ["learner-a", "learner-b", null, "learner-a"]);
  } finally {
    globalThis.fetch = real;
  }
});
