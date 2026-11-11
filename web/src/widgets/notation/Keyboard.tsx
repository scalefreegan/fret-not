import { useEffect, useRef, useState } from "react";
import { TYPING_KEYS } from "../../../shared/music/instruments.ts";
import { accSymbol, fromMidi, isBlackKey, pc, pcBothLabels } from "../../../shared/music/notes.ts";
import { playNote } from "../../audio/index.ts";
import { pcColor } from "../../ui.tsx";
import type { Tone } from "./Score.tsx";
import { useWidth } from "./Score.tsx";

// The piano keyboard: ivory and ebony, drawn to the real proportions closely
// enough that hand shapes learned here transfer. A marked key carries a
// coloured dot (its pitch-class colour, the same colour that note has on the
// staff and the fretboard).

export interface KeyMark {
  midi: number;
  tone?: Tone;
  label?: string;
}

export interface KeyboardProps {
  /** Lowest and highest MIDI note; widened to whole white keys. */
  lo: number;
  hi: number;
  marks?: KeyMark[];
  /** Which keys show their name when not marked. */
  labels?: "none" | "c" | "naturals" | "all";
  onPress?: (midi: number) => void;
  /** Play a piano note on press. Default true. */
  sound?: boolean;
  /** Let the computer keyboard play (A S D F … = white keys from the lowest
   *  C, W E T Y U = black keys). Default false; turn on for one keyboard at a time. */
  typing?: boolean;
  /** Tallest the keyboard may be drawn, px. */
  maxHeight?: number;
}

const WHITE_W = 24;
const WHITE_H = 104;
const BLACK_W = 14;
const BLACK_H = 64;
/** How far each black key sits from the centre of the crack it straddles,
 *  as on a real keyboard (C# and F# lean left, D# and A# lean right). */
const BLACK_NUDGE: Record<number, number> = { 1: -2, 3: 2, 6: -3, 8: 0, 10: 3 };

function toneColor(tone: Tone | undefined, midi: number): string {
  if (tone === "accent") return "var(--accent)";
  if (tone === "good") return "var(--good)";
  if (tone === "bad") return "var(--bad)";
  if (tone === "ink") return "var(--fg-2)";
  return pcColor(midi);
}

export function Keyboard({ lo, hi, marks = [], labels = "naturals", onPress, sound = true, typing = false, maxHeight = 150 }: KeyboardProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [down, setDown] = useState<Set<number>>(new Set());
  let first = isBlackKey(lo) ? lo - 1 : lo;
  let last = isBlackKey(hi) ? hi + 1 : hi;
  if (last - first < 4) {
    first -= 2;
    last += 2;
    if (isBlackKey(first)) first--;
    if (isBlackKey(last)) last++;
  }
  const whites: number[] = [];
  for (let m = first; m <= last; m++) if (!isBlackKey(m)) whites.push(m);
  const blacks: number[] = [];
  for (let m = first; m <= last; m++) if (isBlackKey(m)) blacks.push(m);
  const totalW = whites.length * WHITE_W;
  const markOf = new Map(marks.map((m) => [m.midi, m]));

  const press = (midi: number) => {
    if (sound) playNote(midi, { timbre: "piano" });
    onPress?.(midi);
    setDown((s) => new Set(s).add(midi));
    window.setTimeout(() => setDown((s) => {
      const n = new Set(s);
      n.delete(midi);
      return n;
    }), 160);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  // Computer-keyboard input, anchored on the lowest C in range.
  const baseC = whites.find((m) => pc(m) === 0) ?? first;
  useEffect(() => {
    if (!typing) return;
    const on = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const off = TYPING_KEYS[e.key.toLowerCase()];
      if (off === undefined) return;
      const midi = baseC + off;
      if (midi > last) return;
      e.preventDefault();
      pressRef.current(midi);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [typing, baseC, last]);
  const typingKey = (midi: number): string | undefined => (typing ? Object.entries(TYPING_KEYS).find(([, off]) => baseC + off === midi)?.[0] : undefined);

  const scale = width ? Math.min(width / totalW, maxHeight / WHITE_H) : 1;
  const xOfWhite = (midi: number) => whites.indexOf(midi) * WHITE_W;
  const xOfBlack = (midi: number) => xOfWhite(midi - 1) + WHITE_W - BLACK_W / 2 + BLACK_NUDGE[pc(midi)];

  const nameOf = (midi: number): string | null => {
    const p = fromMidi(midi);
    if (labels === "none") return null;
    if (labels === "c") return pc(midi) === 0 ? `C${p.oct}` : null;
    if (isBlackKey(midi)) return labels === "all" ? pcBothLabels(midi).replace(" / ", "\n") : null;
    return pc(midi) === 0 ? `C${p.oct}` : p.letter + accSymbol(p.acc);
  };

  return (
    <div ref={ref} className="w-full select-none">
      <svg width={totalW * scale} height={WHITE_H * scale + 4} viewBox={`0 0 ${totalW} ${WHITE_H + 4}`} role="group" aria-label="Piano keyboard" style={{ display: "block", margin: "0 auto", touchAction: "manipulation" }}>
        {whites.map((m) => {
          const x = xOfWhite(m);
          const mark = markOf.get(m);
          const name = mark?.label ?? nameOf(m);
          const tk = typingKey(m);
          return (
            <g key={m} onPointerDown={() => press(m)} style={{ cursor: "pointer" }} role="button" aria-label={pcBothLabels(m) + fromMidi(m).oct}>
              <rect x={x + 0.5} y={0.5} width={WHITE_W - 1} height={WHITE_H} rx={3} fill={down.has(m) ? "var(--ivory-edge)" : "var(--ivory)"} stroke="var(--ivory-edge)" />
              {mark && <circle cx={x + WHITE_W / 2} cy={WHITE_H - 17} r={9.5} fill={toneColor(mark.tone, m)} />}
              {name && (
                <text x={x + WHITE_W / 2} y={WHITE_H - 17} textAnchor="middle" dominantBaseline="central" fontSize={name.length > 2 ? 7.5 : 9.5} fontWeight={700} fill={mark ? "var(--pc-ink)" : "#8a7f6c"} style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>
                  {name}
                </text>
              )}
              {tk && !mark && labels === "none" && (
                <text x={x + WHITE_W / 2} y={WHITE_H - 8} textAnchor="middle" fontSize={7} fill="#a59a86" style={{ fontFamily: "var(--font-mono)", pointerEvents: "none" }}>
                  {tk.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
        {blacks.map((m) => {
          const x = xOfBlack(m);
          const mark = markOf.get(m);
          const name = mark?.label ?? nameOf(m);
          const lines = name ? name.split("\n") : [];
          return (
            <g key={m} onPointerDown={() => press(m)} style={{ cursor: "pointer" }} role="button" aria-label={pcBothLabels(m) + fromMidi(m).oct}>
              <rect x={x} y={0} width={BLACK_W} height={BLACK_H} rx={2.5} fill={down.has(m) ? "var(--ebony-top)" : "var(--ebony)"} />
              <rect x={x + 1.5} y={1} width={BLACK_W - 3} height={BLACK_H - 9} rx={2} fill="var(--ebony-top)" opacity={down.has(m) ? 0.3 : 0.75} />
              {mark && <circle cx={x + BLACK_W / 2} cy={BLACK_H - 13} r={7.5} fill={toneColor(mark.tone, m)} />}
              {lines.map((line, i) => (
                <text key={i} x={x + BLACK_W / 2} y={BLACK_H - 13 + (lines.length === 2 ? (i === 0 ? -(mark ? 3.2 : 4) : mark ? 3.4 : 4.5) : 0)} textAnchor="middle" dominantBaseline="central" fontSize={lines.length === 2 ? (mark ? 5.2 : 6) : 7} fontWeight={700} fill={mark ? "var(--pc-ink)" : "#d8cfbd"} style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
