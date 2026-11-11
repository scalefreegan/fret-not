import { useState } from "react";
import { freqOf, midiOf, pitchLabel, parsePitch } from "../../../shared/music/notes.ts";
import { startPartials } from "../../audio/index.ts";
import { Button, Segmented, WidgetFrame } from "../../ui.tsx";
import { list, str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { fmtHz, useHeldSound, wavePath } from "./common.ts";

// Two tones a whole-number frequency ratio apart. Simple ratios make a
// combined wave that repeats soon and harmonics that land on each other;
// complicated ratios do neither.

const NAMES: Record<string, string> = {
  "1:1": "unison",
  "2:1": "octave",
  "3:2": "perfect fifth",
  "4:3": "perfect fourth",
  "5:4": "major third",
  "6:5": "minor third",
  "5:3": "major sixth",
  "8:5": "minor sixth",
  "9:8": "whole step",
  "16:15": "half step",
  "15:8": "major seventh",
  "45:32": "tritone",
};
const TONE = [1, 0.5, 0.33, 0.25, 0.2, 0.16]; // each tone is itself a note with harmonics
const LADDER = 10;

function parseRatio(s: string): [number, number] | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(s.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a >= b && b > 0 && a / b <= 4 ? [a, b] : null;
}

export function Consonance({ params }: WidgetProps) {
  const baseName = str(params, "base", "A3");
  const f1 = freqOf(midiOf(baseName));
  const ratios = list<string>(params, "ratios", ["2:1", "3:2", "4:3", "5:4", "16:15"]).filter((r) => parseRatio(r));
  const options = ratios.length ? ratios : ["2:1", "3:2"];
  const [ratio, setRatio] = useState(options[0]);
  const [which, setWhich] = useState<"low" | "high" | "both" | null>(null);
  const held = useHeldSound();
  const [p, q] = parseRatio(ratio) ?? [2, 1];
  const f2 = (f1 * p) / q;

  const play = (w: "low" | "high" | "both") => {
    if (held.playing && which === w) {
      setWhich(null);
      return held.stop();
    }
    setWhich(w);
    held.start(() => {
      const hs = [w !== "high" ? startPartials(f1, TONE, { level: 0.75 }) : null, w !== "low" ? startPartials(f2, TONE, { level: 0.75 }) : null];
      return () => hs.forEach((h) => h?.stop());
    });
  };
  const sounding = held.playing ? which : null;

  // The window shows `span` cycles of the lower tone; the pair repeats every q of them.
  const span = Math.max(8, q <= 8 ? q * 2 : q + 1);
  const W = 640;
  const low = (x: number) => Math.sin(2 * Math.PI * span * x);
  const high = (x: number) => Math.sin((2 * Math.PI * span * x * p) / q);
  const repeatW = (W * q) / span;

  // Harmonic ladders on one frequency axis.
  const top = f1 * LADDER * 1.04;
  const fx = (f: number) => 16 + ((W - 32) * f) / top;
  const lowH = Array.from({ length: LADDER }, (_, i) => f1 * (i + 1));
  const highH = Array.from({ length: LADDER }, (_, i) => f2 * (i + 1)).filter((f) => f <= top);
  const meets = (f: number, others: number[]) => others.some((o) => Math.abs(o - f) / f < 0.004);
  const shared = highH.filter((f) => meets(f, lowH)).length;

  return (
    <WidgetFrame
      title="Two notes together"
      hint={`${pitchLabel(parsePitch(baseName))} (${fmtHz(f1)}) and a note ${p}:${q} above it (${fmtHz(f2)})`}
      controls={
        <>
          <Segmented label="Frequency ratio" value={ratio} onChange={setRatio} options={options.map((r) => ({ value: r, label: r }))} />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" aria-pressed={sounding === "low"} onClick={() => play("low")}>
              {sounding === "low" ? "Stop" : "Lower"}
            </Button>
            <Button size="sm" aria-pressed={sounding === "high"} onClick={() => play("high")}>
              {sounding === "high" ? "Stop" : "Upper"}
            </Button>
            <Button size="sm" variant="primary" aria-pressed={sounding === "both"} onClick={() => play("both")}>
              {sounding === "both" ? "Stop" : "Both together"}
            </Button>
          </div>
        </>
      }
    >
      <p className="mb-2 text-sm text-fg-2">
        <strong className="text-fg">
          {p}:{q}
        </strong>
        {NAMES[ratio] ? ` — ${NAMES[ratio]}` : ""}. For every {q} vibration{q > 1 ? "s" : ""} of the lower note, the upper makes {p}.
      </p>
      <svg viewBox={`0 0 ${W} 250`} className="block w-full" role="img" aria-label={`Waves of the two notes and their sum; the pattern repeats every ${q} cycles of the lower note`}>
        <rect x={0} y={4} width={repeatW} height={242} rx={6} fill="var(--accent-soft)" />
        <path d={wavePath(low, W, 60, 22, 700)} fill="none" stroke="var(--pc-9)" strokeWidth={1.8} />
        <g transform="translate(0,62)">
          <path d={wavePath(high, W, 60, 22, 900)} fill="none" stroke="var(--pc-4)" strokeWidth={1.8} />
        </g>
        <g transform="translate(0,128)">
          <path d={wavePath((x) => 0.5 * (low(x) + high(x)), W, 100, 44, 1200)} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinejoin="round" />
        </g>
        {[
          { y: 16, w: 44, text: "lower" },
          { y: 78, w: 46, text: "upper" },
          { y: 144, w: 132, text: "both added together" },
        ].map((l) => (
          <g key={l.text}>
            <rect x={3} y={l.y - 13} width={l.w} height={18} rx={5} fill="var(--panel)" opacity={0.85} />
            <text x={8} y={l.y} fontSize={12} fontWeight={600} fill="var(--fg-2)">
              {l.text}
            </text>
          </g>
        ))}
        <text x={Math.min(repeatW, W) - 6} y={242} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--accent)">
          {repeatW <= W ? "one full pattern" : "the pattern has not repeated yet"}
        </text>
      </svg>
      <p className="mt-1 text-sm text-fg-2">
        The shaded stretch is one full pattern of the combined wave: {q} cycle{q > 1 ? "s" : ""} of the lower note. {q <= 4 ? "It repeats quickly, and the ear hears the pair as smooth." : "It takes a long time to repeat, and the ear hears the pair as rough."}
      </p>
      <svg viewBox={`0 0 ${W} 112`} className="mt-3 block w-full" role="img" aria-label={`Harmonics of both notes; ${shared} of the upper note's harmonics coincide with harmonics of the lower`}>
        <line x1={16} x2={W - 16} y1={56} y2={56} stroke="var(--line-strong)" />
        {lowH.map((f, i) => (
          <g key={`l${i}`}>
            <line x1={fx(f)} x2={fx(f)} y1={20} y2={56} stroke="var(--pc-9)" strokeWidth={meets(f, highH) ? 5 : 2.5} strokeLinecap="round" />
            <text x={fx(f)} y={14} textAnchor="middle" fontSize={11} fill="var(--fg-3)">
              {i + 1}
            </text>
          </g>
        ))}
        {highH.map((f, i) => (
          <g key={`h${i}`}>
            <line x1={fx(f)} x2={fx(f)} y1={56} y2={92} stroke="var(--pc-4)" strokeWidth={meets(f, lowH) ? 5 : 2.5} strokeLinecap="round" />
            {meets(f, lowH) && <circle cx={fx(f)} cy={56} r={6.5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />}
            <text x={fx(f)} y={107} textAnchor="middle" fontSize={11} fill="var(--fg-3)">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-sm text-fg-2">
        The harmonics of the lower note (above the line) and the upper note (below), by frequency. {shared > 0 ? `${shared} of the upper note's first ${highH.length} land exactly on a harmonic of the lower (the dots).` : "None of them land on each other; several sit close together and clash."}
      </p>
    </WidgetFrame>
  );
}
