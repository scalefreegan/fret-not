import { useEffect, useRef, useState } from "react";
import { analyserIfRunning, playChord, playNote } from "../../audio/index.ts";
import { Button, WidgetFrame } from "../../ui.tsx";
import { str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { useReducedMotion } from "./common.ts";

// A live oscilloscope and spectrum of whatever the app is playing. The paths
// are written straight to the DOM each frame; React only hears about the
// change between silent and sounding.

const W = 640;
const WAVE_H = 150;
const SPEC_H = 130;
const F_LO = 50;
const F_HI = 8000;
const COLS = 260;
const DB_FLOOR = -72;
const DB_TOP = -18;
const MARKS = [100, 200, 500, 1000, 2000, 5000];

const fx = (hz: number) => (W * Math.log(hz / F_LO)) / Math.log(F_HI / F_LO);

export function Scope({ params }: WidgetProps) {
  const show = str(params, "show", "both");
  const waveRef = useRef<SVGPathElement>(null);
  const specRef = useRef<SVGPathElement>(null);
  const [live, setLive] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    let id = 0;
    let last = 0;
    let wasLive = false;
    let time: Float32Array<ArrayBuffer> | null = null;
    let freq: Float32Array<ArrayBuffer> | null = null;
    const frame = (now: number) => {
      id = requestAnimationFrame(frame);
      if (reduced && now - last < 200) return;
      last = now;
      const an = analyserIfRunning();
      if (!an) return;
      time ??= new Float32Array(an.fftSize);
      freq ??= new Float32Array(an.frequencyBinCount);
      an.getFloatTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
      const isLive = Math.sqrt(sum / time.length) > 0.002;
      if (isLive !== wasLive) {
        wasLive = isLive;
        setLive(isLive);
      }
      if (waveRef.current) {
        // Start at an upward zero crossing so a steady tone stands still.
        const span = 1024;
        let start = 0;
        for (let i = 1; i < time.length - span; i++) {
          if (time[i - 1] <= 0 && time[i] > 0) {
            start = i;
            break;
          }
        }
        let peak = 0.05;
        for (let i = 0; i < span; i++) peak = Math.max(peak, Math.abs(time[start + i]));
        let d = "";
        for (let i = 0; i < span; i += 2) d += `${i ? "L" : "M"}${((i / span) * W).toFixed(1)},${(WAVE_H / 2 - (isLive ? time[start + i] / peak : 0) * (WAVE_H / 2 - 10)).toFixed(1)}`;
        waveRef.current.setAttribute("d", d);
      }
      if (specRef.current) {
        an.getFloatFrequencyData(freq);
        const hzPerBin = an.context.sampleRate / an.fftSize;
        // One point per column on a logarithmic frequency axis: the loudest
        // bin the column covers, from DB_FLOOR (bottom) to DB_TOP (top).
        let d = `M0,${SPEC_H}`;
        for (let c = 0; c < COLS; c++) {
          const lo = F_LO * (F_HI / F_LO) ** (c / COLS);
          const hi = F_LO * (F_HI / F_LO) ** ((c + 1) / COLS);
          let db = -Infinity;
          for (let k = Math.round(lo / hzPerBin); k <= Math.max(Math.round(lo / hzPerBin), Math.round(hi / hzPerBin) - 1); k++) db = Math.max(db, freq[k] ?? -Infinity);
          const v = isLive ? Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_TOP - DB_FLOOR))) : 0;
          d += `L${(((c + 0.5) / COLS) * W).toFixed(1)},${(SPEC_H - v * (SPEC_H - 6)).toFixed(1)}`;
        }
        specRef.current.setAttribute("d", `${d}L${W},${SPEC_H}Z`);
      }
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  return (
    <WidgetFrame
      title="What the sound looks like"
      hint={live ? "Live" : "Silent. Play something."}
      controls={
        <>
          <span className="text-sm text-fg-2">Try it:</span>
          <Button size="sm" onClick={() => playNote(57, { timbre: "sine", duration: 2 })}>
            Pure tone
          </Button>
          <Button size="sm" onClick={() => playNote(57, { timbre: "piano", duration: 2.5 })}>
            Piano note
          </Button>
          <Button size="sm" onClick={() => playNote(45, { timbre: "guitar", duration: 2.5 })}>
            Guitar note
          </Button>
          <Button size="sm" onClick={() => playChord([48, 55, 60, 64], { timbre: "piano", duration: 2.5 })}>
            Piano chord
          </Button>
        </>
      }
    >
      {show !== "spectrum" && (
        <figure>
          <svg viewBox={`0 0 ${W} ${WAVE_H}`} className="block w-full rounded-lg bg-raised/60" role="img" aria-label="Oscilloscope: the pressure wave over a few hundredths of a second">
            <line x1={0} x2={W} y1={WAVE_H / 2} y2={WAVE_H / 2} stroke="var(--line)" strokeDasharray="3 5" />
            <path ref={waveRef} d={`M0,${WAVE_H / 2}L${W},${WAVE_H / 2}`} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
          </svg>
          <figcaption className="mt-1 text-xs text-fg-3">The wave: air pressure against time (about two hundredths of a second).</figcaption>
        </figure>
      )}
      {show !== "wave" && (
        <figure className={show === "both" ? "mt-3" : ""}>
          <svg viewBox={`0 0 ${W} ${SPEC_H + 18}`} className="block w-full" role="img" aria-label="Spectrum: how much of each frequency is in the sound">
            <rect x={0} y={0} width={W} height={SPEC_H} rx={8} fill="var(--raised)" opacity={0.6} />
            <path ref={specRef} d="" fill="var(--accent)" opacity={0.85} />
            {MARKS.map((hz) => (
              <g key={hz}>
                <line x1={fx(hz)} x2={fx(hz)} y1={0} y2={SPEC_H} stroke="var(--line)" />
                <text x={fx(hz)} y={SPEC_H + 14} textAnchor="middle" fontSize={11} fill="var(--fg-3)">
                  {hz >= 1000 ? `${hz / 1000}k` : hz}
                </text>
              </g>
            ))}
          </svg>
          <figcaption className="mt-1 text-xs text-fg-3">The spectrum: how much of each frequency (in Hz) is in the sound. Each peak is one harmonic.</figcaption>
        </figure>
      )}
    </WidgetFrame>
  );
}
