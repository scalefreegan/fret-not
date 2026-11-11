import { useState } from "react";
import { fretMidi, openStringMidi, STANDARD_TUNING, type FretPos } from "../../../shared/music/instruments.ts";
import { isBlackKey, pcNameOf, pcLabel, parsePitchClass } from "../../../shared/music/notes.ts";
import { playNote } from "../../audio/index.ts";
import { pcColor } from "../../ui.tsx";
import type { Tone } from "./Score.tsx";
import { useWidth } from "./Score.tsx";

// The guitar fretboard, seen as the player sees tab: the low E string at the
// bottom, the nut on the left. Frets are spaced as on a real neck (each one
// 1/2^(1/12) the length of the last), which is itself part of the lesson: the
// octave at fret 12 is exactly half the string.

export interface FretMark extends FretPos {
  tone?: Tone;
  label?: string;
  /** Draw as a ring rather than a filled dot (a secondary mark). */
  hollow?: boolean;
}

export interface FretboardProps {
  /** Highest fret drawn. */
  frets?: number;
  marks?: FretMark[];
  /** Which unmarked positions show their note name. */
  labels?: "none" | "open" | "naturals" | "all";
  onPress?: (pos: FretPos, midi: number) => void;
  sound?: boolean;
  /** Strings that are muted (drawn with an ×) — for chord shapes. */
  muted?: number[];
  maxHeight?: number;
}

const H = 132;
const PAD_TOP = 14;
const STRING_GAP = (H - 2 * PAD_TOP) / 5;
const OPEN_W = 34; // room left of the nut for open-string marks
const NUT_W = 5;

function toneColor(tone: Tone | undefined, midi: number): string {
  if (tone === "accent") return "var(--accent)";
  if (tone === "good") return "var(--good)";
  if (tone === "bad") return "var(--bad)";
  if (tone === "ink") return "var(--fg-2)";
  return pcColor(midi);
}
const label = (midi: number) => pcLabel(parsePitchClass(pcNameOf(midi)));

export function Fretboard({ frets = 12, marks = [], labels = "open", onPress, sound = true, muted = [], maxHeight = 190 }: FretboardProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [flash, setFlash] = useState<string | null>(null);
  // Scale length chosen so the drawn frets fill a fixed board width.
  const boardW = Math.max(300, Math.min(900, 150 + frets * 52));
  const scaleLen = boardW / (1 - 2 ** (-frets / 12));
  const fretX = (n: number) => OPEN_W + NUT_W + scaleLen * (1 - 2 ** (-n / 12));
  const totalW = fretX(frets) + 10;
  const stringY = (s: number) => PAD_TOP + (s - 1) * STRING_GAP;
  const cx = (fret: number) => (fret === 0 ? OPEN_W / 2 : (fretX(fret - 1) + fretX(fret)) / 2 + (fret === 1 ? NUT_W / 4 : 0));
  const scale = width ? Math.min(width / totalW, maxHeight / H) : 1;
  const markOf = new Map(marks.map((m) => [`${m.string}/${m.fret}`, m]));

  const press = (pos: FretPos) => {
    const midi = fretMidi(pos);
    if (sound) playNote(midi, { timbre: "guitar", duration: 1.6 });
    onPress?.(pos, midi);
    setFlash(`${pos.string}/${pos.fret}`);
    window.setTimeout(() => setFlash(null), 180);
  };

  const inlays = [3, 5, 7, 9, 15, 17, 19, 21].filter((f) => f <= frets);
  const cells: FretPos[] = [];
  for (let s = 1; s <= 6; s++) for (let f = 0; f <= frets; f++) cells.push({ string: s, fret: f });

  return (
    <div ref={ref} className="w-full select-none">
      <svg width={totalW * scale} height={(H + 18) * scale} viewBox={`0 0 ${totalW} ${H + 18}`} role="group" aria-label="Guitar fretboard" style={{ display: "block", margin: "0 auto", touchAction: "manipulation" }}>
        <defs>
          <linearGradient id="fb-wood" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--rosewood)" />
            <stop offset="1" stopColor="var(--rosewood-dark)" />
          </linearGradient>
        </defs>
        <rect x={OPEN_W} y={2} width={totalW - OPEN_W - 2} height={H - 4} rx={4} fill="url(#fb-wood)" />
        {inlays.map((f) => (
          <circle key={f} cx={cx(f)} cy={H / 2} r={5} fill="var(--inlay)" opacity={0.5} />
        ))}
        {frets >= 12 && [H / 2 - STRING_GAP, H / 2 + STRING_GAP].map((y) => <circle key={y} cx={cx(12)} cy={y} r={5} fill="var(--inlay)" opacity={0.5} />)}
        <rect x={OPEN_W} y={2} width={NUT_W} height={H - 4} fill="var(--nut)" />
        {Array.from({ length: frets }, (_, i) => i + 1).map((f) => (
          <rect key={f} x={fretX(f) - 1.2} y={2} width={2.4} height={H - 4} fill="var(--fret-wire)" />
        ))}
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <line key={s} x1={OPEN_W} x2={totalW - 2} y1={stringY(s)} y2={stringY(s)} stroke={s >= 4 ? "var(--string-wound)" : "var(--string)"} strokeWidth={0.9 + s * 0.38} />
        ))}
        {Array.from({ length: frets }, (_, i) => i + 1)
          .filter((f) => f === 1 || [3, 5, 7, 9, 12, 15, 17, 19].includes(f))
          .map((f) => (
            <text key={f} x={cx(f)} y={H + 12} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }}>
              {f}
            </text>
          ))}
        {cells.map((pos) => {
          const key = `${pos.string}/${pos.fret}`;
          const midi = fretMidi(pos);
          const mark = markOf.get(key);
          const x = cx(pos.fret);
          const y = stringY(pos.string);
          const isMuted = pos.fret === 0 && muted.includes(pos.string);
          const showName = !mark && !isMuted && (labels === "all" || (labels === "open" && pos.fret === 0) || (labels === "naturals" && !isBlackKey(midi)));
          const text = mark?.label ?? (showName ? label(midi) : null);
          const left = pos.fret === 0 ? 0 : fretX(pos.fret - 1);
          const right = pos.fret === 0 ? OPEN_W : fretX(pos.fret);
          const r = Math.min(10.5, (right - left) / 2 - 1.5, STRING_GAP / 2 - 0.5);
          return (
            <g key={key} onPointerDown={() => press(pos)} style={{ cursor: "pointer" }} role="button" aria-label={`String ${pos.string}, ${pos.fret === 0 ? "open" : `fret ${pos.fret}`}`}>
              <rect x={left} y={y - STRING_GAP / 2} width={right - left} height={STRING_GAP} fill="transparent" />
              {flash === key && !mark && <circle cx={x} cy={y} r={r} fill="var(--inlay)" opacity={0.7} />}
              {mark && !mark.hollow && <circle cx={x} cy={y} r={r} fill={toneColor(mark.tone, midi)} stroke="var(--rosewood-dark)" strokeWidth={0.8} />}
              {mark && mark.hollow && <circle cx={x} cy={y} r={r - 1} fill="var(--rosewood-dark)" stroke={toneColor(mark.tone, midi)} strokeWidth={2.2} />}
              {isMuted && (
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }}>
                  ×
                </text>
              )}
              {text && (
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={text.length > 2 ? 7 : text.length > 1 ? 8.5 : 10}
                  fontWeight={700}
                  fill={mark ? (mark.hollow ? "var(--inlay)" : "var(--pc-ink)") : pos.fret === 0 ? "var(--fg-3)" : "var(--inlay)"}
                  opacity={mark ? 1 : pos.fret === 0 ? 1 : 0.8}
                  style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}
                >
                  {text}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Open-string names for captions, string 6 first. */
export const OPEN_STRING_NAMES = [6, 5, 4, 3, 2, 1].map((s) => pcNameOf(openStringMidi(s, STANDARD_TUNING)));
