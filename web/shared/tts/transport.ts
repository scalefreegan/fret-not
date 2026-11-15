// Listen mode's transport (Back, -5s, Start/Pause, +5s, Skip, Stop) as pure
// decisions: where Back and Skip go in a lesson's blocks, and where a seek
// lands. The player (web/src/audio/speech.ts) and the pages do the playing;
// this only answers "which block next" and "what time", so it can be tested
// with node --test.

/** What a lesson block is to the narrator: prose it reads aloud, a widget
 *  it stops at (the learner tries it, then goes on), or nothing to say. */
export type StopKind = "text" | "widget" | "empty";

/** Back restarts the block being read if it has been playing longer than
 *  this; otherwise it goes to the block before. */
export const RESTART_AFTER_SECONDS = 2;

/** The first block at or after `from` the narrator stops at (prose to read
 *  or a widget to wait at), or null when the lesson's reading is over. */
export function nextStop(kinds: readonly StopKind[], from: number): number | null {
  for (let i = Math.max(0, from); i < kinds.length; i++) if (kinds[i] !== "empty") return i;
  return null;
}

/** Skip: the stop after the one at `at` (a block being read, or the widget
 *  the narrator waits at); from nowhere (idle), the first. */
export function skipTarget(kinds: readonly StopKind[], at: number | null): number | null {
  return nextStop(kinds, at === null ? 0 : at + 1);
}

/** Back: restart the block being read when it is more than a moment in (or
 *  there is nothing before it); else the nearest prose block before it.
 *  Waiting at a widget, Back reads the prose before the widget again.
 *  Widgets are passed over going back: the learner can see them. */
export function backTarget(kinds: readonly StopKind[], at: number | null, elapsedSeconds: number): number | null {
  if (at === null) return nextStop(kinds, 0);
  if (kinds[at] === "text" && elapsedSeconds > RESTART_AFTER_SECONDS) return at;
  for (let i = at - 1; i >= 0; i--) if (kinds[i] === "text") return i;
  return kinds[at] === "text" ? at : nextStop(kinds, 0);
}

/** Where a seek by `delta` seconds lands: inside [0, duration]. A duration
 *  not yet known (NaN, Infinity: the audio is still loading) only clamps at
 *  0. A seek to the very end lands just short of it, so the audio still
 *  ends by itself (and its end moves the lesson on) instead of stalling. */
export function seekTarget(current: number, delta: number, duration: number): number {
  const to = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
  if (!Number.isFinite(duration) || duration <= 0) return to;
  return Math.min(to, Math.max(0, duration - 0.05));
}
