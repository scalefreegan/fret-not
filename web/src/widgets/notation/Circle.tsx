import { useState } from "react";
import { parsePitchClass, pcLabel, pcOfClass, toMidi } from "../../../shared/music/notes.ts";
import { CIRCLE_OF_FIFTHS, keySignature, parseKey, relativeMinor, scaleNotes } from "../../../shared/music/scales.ts";
import { playNote } from "../../audio/index.ts";
import { NoteChip, pcColor, WidgetFrame } from "../../ui.tsx";
import { str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { Score } from "./Score.tsx";

// The circle of fifths: twelve major keys, each a fifth above the last going
// clockwise, with the relative minors inside. Each step clockwise adds a
// sharp (or removes a flat).

const pretty = (key: string) => {
  const k = parseKey(key);
  return pcLabel(k.tonic) + (k.mode === "minor" ? "m" : "");
};

export function CircleOfFifthsWidget({ params }: WidgetProps) {
  const [key, setKey] = useState(str(params, "key", "C"));
  const k = parseKey(key);
  const sig = keySignature(key);
  const major = k.mode === "major" ? key : CIRCLE_OF_FIFTHS.find((m) => relativeMinor(m) === key) ?? "C";
  const scale = scaleNotes({ ...k.tonic, oct: pcOfClass(k.tonic) >= 9 ? 3 : 4 }, k.mode === "minor" ? "natural-minor" : "major", true);
  const R = 150;
  const pick = (next: string) => {
    setKey(next);
    const kk = parseKey(next);
    const s = scaleNotes({ ...kk.tonic, oct: pcOfClass(kk.tonic) >= 9 ? 3 : 4 }, kk.mode === "minor" ? "natural-minor" : "major", true);
    s.forEach((p, i) => playNote(toMidi(p), { timbre: "piano", delay: i * 0.22, duration: 0.4 }));
  };
  const at = (i: number, r: number) => ({ x: R + 10 + r * Math.sin((i * Math.PI) / 6), y: R + 10 - r * Math.cos((i * Math.PI) / 6) });
  return (
    <WidgetFrame title="Circle of fifths" hint="Click a key. Outer ring: major keys. Inner ring: their relative minors.">
      <div className="flex flex-col items-center gap-5 @2xl:flex-row @2xl:items-start">
        <svg width={320} height={320} viewBox="0 0 320 320" className="shrink-0" role="group" aria-label="Circle of fifths">
          <circle cx={160} cy={160} r={R} fill="var(--raised)" stroke="var(--line)" />
          <circle cx={160} cy={160} r={R - 56} fill="var(--panel)" stroke="var(--line)" />
          <circle cx={160} cy={160} r={R - 102} fill="var(--raised)" stroke="var(--line)" />
          {CIRCLE_OF_FIFTHS.map((m, i) => {
            const outer = at(i, R - 28);
            const inner = at(i, R - 79);
            const minor = relativeMinor(m);
            const n = keySignature(m).count;
            return (
              <g key={m}>
                <g onClick={() => pick(m)} style={{ cursor: "pointer" }} role="button" aria-label={`${m} major`}>
                  <circle cx={outer.x} cy={outer.y} r={22} fill={pcColor(pcOfClass(parsePitchClass(m)))} stroke={key === m ? "var(--ink)" : "none"} strokeWidth={3} opacity={major === m ? 1 : 0.55} />
                  <text x={outer.x} y={outer.y} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={800} fill="var(--pc-ink)" style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>{pretty(m)}</text>
                </g>
                <g onClick={() => pick(minor)} style={{ cursor: "pointer" }} role="button" aria-label={`${minor.slice(0, -1)} minor`}>
                  <circle cx={inner.x} cy={inner.y} r={17} fill={key === minor ? "var(--accent-soft)" : "transparent"} stroke={key === minor ? "var(--accent)" : "none"} strokeWidth={2} />
                  <text x={inner.x} y={inner.y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="var(--fg-2)" style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>{pretty(minor)}</text>
                </g>
                <text {...at(i, R + 0)} textAnchor="middle" dominantBaseline="central" fontSize={0}>{n}</text>
              </g>
            );
          })}
          <text x={160} y={156} textAnchor="middle" fontSize={22} fontWeight={800} fill="var(--fg)" style={{ fontFamily: "var(--font-display)" }}>{pretty(key)}</text>
          <text x={160} y={174} textAnchor="middle" fontSize={10.5} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }}>{sig.count === 0 ? "no ♯ or ♭" : `${Math.abs(sig.count)} ${sig.count > 0 ? "sharp" : "flat"}${Math.abs(sig.count) === 1 ? "" : "s"}`}</text>
        </svg>
        <div className="min-w-0 flex-1 self-stretch">
          <p className="text-fg-2">
            <strong className="text-fg">{pcLabel(k.tonic)} {k.mode}</strong>
            {sig.count === 0 ? " has no sharps or flats." : ` has ${Math.abs(sig.count)} ${sig.count > 0 ? "sharp" : "flat"}${Math.abs(sig.count) === 1 ? "" : "s"}: ${sig.letters.map((l) => l + (sig.count > 0 ? "♯" : "♭")).join(", ")}.`}{" "}
            {k.mode === "major" ? `Its relative minor, with the same signature, is ${pretty(relativeMinor(key))}.` : `It shares its signature with ${pretty(major)} major.`}
          </p>
          <div className="mt-3 max-w-md">
            <Score clef="treble" keySig={key} items={scale.map((p) => ({ pitches: [p] }))} tone="pc" finalBar={false} onItemClick={(i) => playNote(toMidi(scale[i]), { timbre: "piano" })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {scale.map((p, i) => (
              <button key={i} type="button" onClick={() => playNote(toMidi(p), { timbre: "piano" })}><NoteChip midi={toMidi(p)}>{pcLabel(p)}</NoteChip></button>
            ))}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
}
