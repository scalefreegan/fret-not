import { useRef, useState } from "react";
import { parsePitchClass, pcLabel, pcOfClass, toMidi } from "../../../shared/music/notes.ts";
import { CIRCLE_OF_FIFTHS, keySignature, parseKey, relativeMinor, scaleNotes } from "../../../shared/music/scales.ts";
import { playNote } from "../../audio/index.ts";
import { NoteChip, pcColor, WidgetFrame } from "../../ui.tsx";
import { str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { Score } from "./Score.tsx";
import { usePressWord } from "../touch.ts";

// The circle of fifths: twelve major keys, each a fifth above the last going
// clockwise, with the relative minors inside. Each step clockwise adds a
// sharp (or removes a flat).

const pretty = (key: string) => {
  const k = parseKey(key);
  return pcLabel(k.tonic) + (k.mode === "minor" ? "m" : "");
};

export function CircleOfFifthsWidget({ params }: WidgetProps) {
  const word = usePressWord();
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
  // One tab stop for the circle: left and right go round it, up and down
  // switch between the major ring and the minors inside.
  const els = useRef(new Map<string, SVGGElement>());
  const onKeyDown = (i: number, minor: boolean) => (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let to: [number, boolean] | null = null;
    if (e.key === "ArrowRight") to = [(i + 1) % 12, minor];
    else if (e.key === "ArrowLeft") to = [(i + 11) % 12, minor];
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") to = [i, !minor];
    else if (e.key === "Enter" || e.key === " ") {
      if (e.repeat) return e.preventDefault();
      pick(minor ? relativeMinor(CIRCLE_OF_FIFTHS[i]) : CIRCLE_OF_FIFTHS[i]);
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (to) els.current.get(`${to[0]}${to[1] ? "m" : ""}`)?.focus();
  };
  const reg = (name: string) => (el: SVGGElement | null) => {
    if (el) els.current.set(name, el);
    else els.current.delete(name);
  };
  const say = (keyName: string) => keyName.replace("#", " sharp").replace(/^([A-G])b/, "$1 flat").replace(/m$/, "");
  const onCircle = CIRCLE_OF_FIFTHS.some((m) => m === key || relativeMinor(m) === key);
  const focusFallback = onCircle ? null : "0";
  const at = (i: number, r: number) => ({ x: R + 10 + r * Math.sin((i * Math.PI) / 6), y: R + 10 - r * Math.cos((i * Math.PI) / 6) });
  return (
    <WidgetFrame title="Circle of fifths" hint={`${word.Press} a key. Outer ring: major keys. Inner ring: their relative minors.`}>
      <div className="flex flex-col items-center gap-5 @2xl:flex-row @2xl:items-start">
        <div className="instrument w-full max-w-[320px] shrink-0 pointer-coarse:max-w-[380px]">
        <svg viewBox="0 0 320 320" className="block h-auto w-full" role="group" aria-label="Circle of fifths. Arrow keys move round it, Enter chooses a key">
          <circle cx={160} cy={160} r={R} fill="var(--raised)" stroke="var(--line)" />
          <circle cx={160} cy={160} r={R - 56} fill="var(--panel)" stroke="var(--line)" />
          <circle cx={160} cy={160} r={R - 102} fill="var(--raised)" stroke="var(--line)" />
          {CIRCLE_OF_FIFTHS.map((m, i) => {
            const outer = at(i, R - 28);
            const inner = at(i, R - 75); // as far out as the outer ring allows: the bigger these are, the easier under a finger
            const minor = relativeMinor(m);
            const n = keySignature(m).count;
            return (
              <g key={m}>
                <g ref={reg(`${i}`)} className="cof-key" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)} onKeyDown={onKeyDown(i, false)} tabIndex={key === m || focusFallback === `${i}` ? 0 : -1} style={{ cursor: "pointer" }} role="button" aria-pressed={key === m} aria-label={`${say(m)} major`}>
                  <circle cx={outer.x} cy={outer.y} r={22} fill={pcColor(pcOfClass(parsePitchClass(m)))} stroke={key === m ? "var(--ink)" : "none"} strokeWidth={3} opacity={major === m ? 1 : 0.55} />
                  <text x={outer.x} y={outer.y} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={800} fill="var(--pc-ink)" style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>{pretty(m)}</text>
                </g>
                <g ref={reg(`${i}m`)} className="cof-key" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(minor)} onKeyDown={onKeyDown(i, true)} tabIndex={key === minor || focusFallback === `${i}m` ? 0 : -1} style={{ cursor: "pointer" }} role="button" aria-pressed={key === minor} aria-label={`${say(minor)} minor`}>
                  <circle cx={inner.x} cy={inner.y} r={19} fill={key === minor ? "var(--accent-soft)" : "transparent"} stroke={key === minor ? "var(--accent)" : "none"} strokeWidth={2} />
                  <text x={inner.x} y={inner.y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="var(--fg-2)" style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>{pretty(minor)}</text>
                </g>
                <text {...at(i, R + 0)} textAnchor="middle" dominantBaseline="central" fontSize={0}>{n}</text>
              </g>
            );
          })}
          <text x={160} y={156} textAnchor="middle" fontSize={22} fontWeight={800} fill="var(--fg)" style={{ fontFamily: "var(--font-display)" }}>{pretty(key)}</text>
          <text x={160} y={174} textAnchor="middle" fontSize={10.5} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }}>{sig.count === 0 ? "no ♯ or ♭" : `${Math.abs(sig.count)} ${sig.count > 0 ? "sharp" : "flat"}${Math.abs(sig.count) === 1 ? "" : "s"}`}</text>
        </svg>
        </div>
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
              <button key={i} type="button" className="rounded-full pointer-coarse:p-1.5" onClick={() => playNote(toMidi(p), { timbre: "piano" })}><NoteChip midi={toMidi(p)}>{pcLabel(p)}</NoteChip></button>
            ))}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
}
