import { useCallback, useEffect, useRef, useState } from "react";
import { claimStage } from "../../audio/index.ts";

// Shared by the sound widgets: animation, the one-sound-at-a-time stage,
// drawing helpers and a small FFT.

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Call `frame(seconds since start)` every animation frame while `active`. */
export function useRaf(frame: (t: number) => void, active: boolean): void {
  const ref = useRef(frame);
  useEffect(() => {
    ref.current = frame;
  });
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      ref.current((now - t0) / 1000);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** A held sound that stops when the widget unmounts or another widget
 *  starts. `start(make)` begins it (make returns how to stop it); `stop()`
 *  ends it. `playing` drives the button. */
export function useHeldSound(): { playing: boolean; start: (make: () => () => void) => void; stop: () => void } {
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    const s = stopRef.current;
    stopRef.current = null;
    s?.();
    setPlaying(false);
  }, []);
  const start = useCallback(
    (make: () => () => void) => {
      stopRef.current?.();
      // Start, then take the stage: whoever held it before is told to stop.
      let release = () => {};
      const stopSound = make();
      const end = () => {
        release();
        stopSound();
      };
      stopRef.current = end;
      release = claimStage(() => {
        if (stopRef.current === end) {
          stopRef.current = null;
          stopSound();
          setPlaying(false);
        }
      });
      setPlaying(true);
    },
    [],
  );
  useEffect(() => () => stopRef.current?.(), []);
  return { playing, start, stop };
}

/** An SVG path through y = fn(x) for x in 0…1, drawn in a w×h box with y = 0
 *  on the middle line and ±1 at `amp` pixels. */
export function wavePath(fn: (x: number) => number, w: number, h: number, amp: number, points = 240, x0 = 0): string {
  let d = "";
  for (let i = 0; i <= points; i++) {
    const x = i / points;
    d += `${i ? "L" : "M"}${(x0 + x * w).toFixed(1)},${(h / 2 - fn(x) * amp).toFixed(1)}`;
  }
  return d;
}

/** In-place radix-2 FFT. Lengths must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Strength of each of the first `count` harmonics of `f0` in a stretch of
 *  samples (Hann window, peak magnitude near each harmonic), scaled so the
 *  strongest is 1. */
export function harmonicStrengths(samples: Float32Array, sampleRate: number, f0: number, count: number, start = 0, size = 16384): number[] {
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let i = 0; i < size; i++) re[i] = (samples[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  fft(re, im);
  const out: number[] = [];
  for (let k = 1; k <= count; k++) {
    const bin = (k * f0 * size) / sampleRate;
    let peak = 0;
    for (let b = Math.max(1, Math.floor(bin) - 2); b <= Math.min(size / 2 - 1, Math.ceil(bin) + 2); b++) peak = Math.max(peak, Math.hypot(re[b], im[b]));
    out.push(k * f0 < sampleRate / 2 ? peak : 0);
  }
  const max = Math.max(...out, 1e-9);
  return out.map((v) => v / max);
}

export function fmtHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz` : `${hz >= 100 ? Math.round(hz) : hz.toFixed(1)} Hz`;
}
