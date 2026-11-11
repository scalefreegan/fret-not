import { useEffect, useState } from "react";
import type { Timbre } from "../../../shared/exercise-types.ts";
import { freqOf, midiOf, parsePitch, pitchLabel } from "../../../shared/music/notes.ts";
import { playNote, renderNote } from "../../audio/index.ts";
import { PlayButton, WidgetFrame, pcColor } from "../../ui.tsx";
import { list, str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { fmtHz, harmonicStrengths } from "./common.ts";

// The same note from several sources. Each row is measured from that
// source's actual sound (rendered silently in the background): a few cycles
// of its wave, and how strong each harmonic is.

const LABELS: Record<string, string> = { sine: "Pure tone", triangle: "Triangle wave", square: "Square wave", saw: "Sawtooth wave", piano: "Piano", guitar: "Guitar" };
const HARMONICS = 12;
const CYCLES = 3;

interface Measured {
  wave: number[];
  strengths: number[];
  sampled: boolean;
}

async function measure(midi: number, timbre: Timbre): Promise<Measured> {
  const { samples, sampleRate, sampled } = await renderNote(midi, timbre, 0.7);
  const f0 = freqOf(midi);
  // Skip the attack, then start on an upward zero crossing so rows line up.
  let start = Math.floor(sampleRate * 0.1);
  while (start < samples.length - 2 && !(samples[start] <= 0 && samples[start + 1] > 0)) start++;
  const n = Math.round((CYCLES * sampleRate) / f0);
  const seg = Array.from(samples.subarray(start, start + n));
  const peak = Math.max(...seg.map(Math.abs), 1e-9);
  return { wave: seg.map((v) => v / peak), strengths: harmonicStrengths(samples, sampleRate, f0, HARMONICS, Math.floor(sampleRate * 0.06)), sampled };
}

function Row({ midi, timbre }: { midi: number; timbre: Timbre }) {
  const [m, setM] = useState<Measured | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    measure(midi, timbre).then(
      (r) => alive && setM(r),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [midi, timbre]);
  const W = 300;
  const H = 96;
  const path = m ? m.wave.map((v, i) => `${i ? "L" : "M"}${((i / (m.wave.length - 1)) * W).toFixed(1)},${(H / 2 - v * 40).toFixed(1)}`).join("") : "";
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0 @2xl:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center gap-2.5">
        <PlayButton onClick={() => playNote(midi, { timbre, duration: 1.6 })} label={`Play ${LABELS[timbre] ?? timbre}`} size={36} />
        <div>
          <div className="font-semibold text-fg">{LABELS[timbre] ?? timbre}</div>
          <div className="text-xs text-fg-3">{m ? (m.sampled ? "a recording" : "made by the computer") : failed ? "could not be measured" : "measuring…"}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="col-span-2 block w-full @2xl:col-span-1" role="img" aria-label={`${CYCLES} cycles of the ${LABELS[timbre] ?? timbre} wave`}>
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--line)" strokeDasharray="3 5" />
        {path && <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />}
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} className="col-span-2 block w-full @2xl:col-span-1" role="img" aria-label={`Strength of the first ${HARMONICS} harmonics of the ${LABELS[timbre] ?? timbre}`}>
        <line x1={4} x2={W - 4} y1={76} y2={76} stroke="var(--line-strong)" />
        {Array.from({ length: HARMONICS }, (_, i) => {
          const bw = (W - 8) / HARMONICS;
          const v = m?.strengths[i] ?? 0;
          return (
            <g key={i}>
              <rect x={6 + i * bw} y={76 - v * 66} width={bw - 5} height={Math.max(v * 66, 0.5)} rx={2} fill={pcColor(Math.round(midi + 12 * Math.log2(i + 1)))} />
              <text x={6 + i * bw + (bw - 5) / 2} y={91} textAnchor="middle" fontSize={10.5} fill="var(--fg-3)">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TimbreCompare({ params }: WidgetProps) {
  const note = str(params, "note", "A3");
  const midi = midiOf(note);
  const sources = list<Timbre>(params, "sources", ["sine", "piano", "guitar"]);
  return (
    <WidgetFrame title={`The same note, ${pitchLabel(parsePitch(note))}, from different sources`} hint={`Every one vibrates ${fmtHz(freqOf(midi)).replace(" Hz", "")} times a second.`}>
      <div className="hidden grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 pb-1 text-xs font-semibold tracking-wide text-fg-3 uppercase @2xl:grid">
        <span />
        <span>{CYCLES} cycles of the wave</span>
        <span>Strength of each harmonic</span>
      </div>
      {sources.map((s) => (
        <Row key={s} midi={midi} timbre={s} />
      ))}
      <p className="mt-1 text-sm text-fg-2">Every wave repeats at the same rate, which is why you hear the same pitch. What differs is the shape of each cycle: how much of harmonics 2, 3, 4 and up is mixed in with harmonic 1. That mix is the timbre.</p>
    </WidgetFrame>
  );
}
