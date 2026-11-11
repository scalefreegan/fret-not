import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Touch behaviour shared by the drawn instruments (keyboard, fretboard,
// circle, staff). Two rules:
//
//  1. A finger that lands on an instrument may be starting a scroll, not a
//     note. The sound starts at once (an instrument that waits feels dead),
//     but the press only counts (an exercise answer, a moved note) when the
//     finger lifts without the browser having taken the gesture for a scroll.
//     A mouse press counts immediately, as before.
//  2. On a touch screen nothing is drawn smaller than a finger can hit; an
//     instrument too wide for the screen scrolls sideways inside its own box
//     instead of shrinking.

const coarseQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
const subscribeCoarse = (fn: () => void) => {
  coarseQuery?.addEventListener("change", fn);
  return () => coarseQuery?.removeEventListener("change", fn);
};
/** True on a device whose main pointer is a finger. */
export function useCoarse(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => coarseQuery?.matches ?? false, () => false);
}

const shortQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-height: 500px) and (min-width: 640px)") : null;
const subscribeShort = (fn: () => void) => {
  shortQuery?.addEventListener("change", fn);
  return () => shortQuery?.removeEventListener("change", fn);
};
/** True on a wide, short screen (a phone on its side): the same condition as
 *  the `short:` CSS variant in index.css. There a question is laid out in two
 *  columns, so what is asked, where it is answered and the verdict are all
 *  on screen together. */
export function useShort(): boolean {
  return useSyncExternalStore(subscribeShort, () => shortQuery?.matches ?? false, () => false);
}

/** The word for pressing something on this device: "Tap" under a finger,
 *  "Click" under a mouse. For hints, so a phone is never told to click. */
export function usePressWord(): { Press: "Tap" | "Click"; press: "tap" | "click"; coarse: boolean } {
  const coarse = useCoarse();
  return coarse ? { Press: "Tap", press: "tap", coarse } : { Press: "Click", press: "click", coarse };
}

export interface PressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/** Press handling for one instrument. `begin(key)` runs the moment a pointer
 *  goes down (start the sound, light the key) and may return a handle that
 *  takes the sound back; `commit(key)` runs when the press counts. Each
 *  finger is tracked on its own, so two fingers are two notes. */
export function usePress<K>(begin: (key: K) => { stop(): void } | void, commit: (key: K) => void): (key: K) => PressHandlers {
  const live = useRef(new Map<number, { key: K; voice: { stop(): void } | void }>());
  const beginRef = useRef(begin);
  beginRef.current = begin;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  return useCallback(
    (key: K): PressHandlers => ({
      onPointerDown: (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const voice = beginRef.current(key);
        if (e.pointerType === "touch") live.current.set(e.pointerId, { key, voice });
        else commitRef.current(key);
      },
      onPointerUp: (e) => {
        const held = live.current.get(e.pointerId);
        if (!held) return;
        live.current.delete(e.pointerId);
        commitRef.current(held.key);
      },
      onPointerCancel: (e) => {
        // The browser took the gesture (a scroll): it was never a press.
        const held = live.current.get(e.pointerId);
        if (!held) return;
        live.current.delete(e.pointerId);
        held.voice?.stop();
      },
    }),
    [],
  );
}

/** A horizontally scrolling box for an instrument wider than the screen.
 *  `focusX` (px from the left of the content, or null) is brought to the
 *  middle when the content first becomes wider than the box, and again only
 *  if it later moves out of sight. Reports whether there is
 *  more to either side, for the "swipe for more" hint. */
export function useScrollBox(contentW: number, boxW: number, focusX: number | null): { ref: React.RefObject<HTMLDivElement | null>; scrollable: boolean; more: { left: boolean; right: boolean } } {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollable = boxW > 0 && contentW > boxW + 1;
  const [more, setMore] = useState({ left: false, right: false });
  const placedFor = useRef<string | null>(null);
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (scrollable) {
      const sig = `${Math.round(contentW)}/${Math.round(boxW)}/${focusX === null ? "" : Math.round(focusX)}`;
      if (placedFor.current !== sig) {
        const first = placedFor.current === null;
        placedFor.current = sig;
        // First time: centre it. Later (the marked note moved): only if it
        // has gone out of sight, so the board never jumps under a finger.
        const hidden = focusX !== null && (focusX < el.scrollLeft + 24 || focusX > el.scrollLeft + boxW - 24);
        if (first || hidden) el.scrollLeft = focusX === null ? 0 : Math.max(0, Math.min(contentW - boxW, focusX - boxW / 2));
      }
    } else placedFor.current = null;
    update();
  }, [scrollable, contentW, boxW, focusX, update]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [update]);
  return { ref, scrollable, more };
}

/** Audio-clock seconds at which a DOM event happened, given the audio
 *  clock's reading now. Handlers run some milliseconds after the finger or
 *  key actually landed (more on a busy page); the event's own timestamp says
 *  when that was. */
export function eventAudioTime(e: { timeStamp: number } | undefined | null, audioNow: number): number {
  const ts = e && typeof e.timeStamp === "number" ? e.timeStamp : 0;
  if (!ts) return audioNow;
  const lag = performance.now() - ts;
  // A timestamp on another time base (very old browsers) shows as a wild lag.
  return lag >= 0 && lag < 500 ? audioNow - lag / 1000 : audioNow;
}
