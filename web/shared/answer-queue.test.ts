import assert from "node:assert/strict";
import { test } from "node:test";
import { AnswerQueue, type SaveResult } from "./answer-queue.ts";
import type { AnswerResult } from "./progress.ts";

const OK: SaveResult = { ok: true, dropped: 0, lessonDropped: false, recovered: false };
const a = (concept: string): AnswerResult => ({ concept, correct: true });

/** A send that waits until released, recording what it was given. */
function gate() {
  const sent: string[][] = [];
  const releases: (() => void)[] = [];
  const send = (results: AnswerResult[]) => {
    sent.push(results.map((r) => r.concept));
    return new Promise<SaveResult>((resolve) => releases.push(() => resolve(OK)));
  };
  const release = async () => {
    releases.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { sent, send, release };
}

test("a batch added while a save is in flight goes right after it", async () => {
  const g = gate();
  const q = new AnswerQueue(g.send);
  const first = q.add([a("x")]);
  const second = q.add([a("y")]);
  await g.release();
  await g.release();
  assert.deepEqual(await first, OK);
  assert.deepEqual(await second, OK);
  assert.deepEqual(g.sent, [["x"], ["y"]]);
  assert.deepEqual(q.state, { unsaved: 0, pending: false, status: "idle", error: null });
});

test("a failed save keeps the answers for the next attempt", async () => {
  let fail = true;
  const sent: string[][] = [];
  const q = new AnswerQueue(async (results) => {
    sent.push(results.map((r) => r.concept));
    return fail ? { ok: false, error: "offline" } : OK;
  });
  assert.deepEqual(await q.add([a("x")]), { ok: false, error: "offline" });
  assert.deepEqual(q.state, { unsaved: 1, pending: true, status: "failed", error: "offline" });
  fail = false;
  assert.deepEqual(await q.add([a("y")]), OK);
  assert.deepEqual(sent, [["x"], ["x", "y"]]);
});

test("once closed (the learner changed), a running loop sends nothing more, and nothing new is taken", async () => {
  const g = gate();
  const states: number[] = [];
  const q = new AnswerQueue(g.send, (s) => states.push(s.unsaved));
  const first = q.add([a("x")]);
  void q.add([a("y")]); // waits for the round after the one in flight
  q.close();
  await g.release();
  await first;
  assert.deepEqual(g.sent, [["x"]], "the queued batch did not go out under the next learner");
  assert.equal((await q.add([a("z")])).ok, false);
  assert.deepEqual(g.sent, [["x"]]);
  const told = states.length;
  await q.flush();
  assert.equal(states.length, told, "a closed queue tells its (gone) owner nothing");
});
