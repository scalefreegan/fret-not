import { useId, useRef, useState } from "react";
import { fretMidi, openStringMidi, STANDARD_TUNING, type FretPos } from "../../../shared/music/instruments.ts";
import { isBlackKey, pcNameOf, pcLabel, parsePitchClass } from "../../../shared/music/notes.ts";
import { startNote } from "../../audio/index.ts";
import { pcColor } from "../../ui.tsx";
import type { Tone } from "./Score.tsx";
import { useWidth } from "./Score.tsx";
import { useCoarse, usePress, useScrollBox } from "../touch.ts";

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
/** Narrowest the highest fret is drawn on a touch screen, px. */
const MIN_FRET_TOUCH = 30;
/** Closest two strings are ever drawn, px (a narrow window with a mouse). */
const MIN_STRING_GAP = 12;
/** Width assumed until the box has been measured (or if it measures 0). */
const FALLBACK_W = 320;

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
  // Two fretboards on a page must not share one gradient id.
  const woodId = `fb-wood-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Scale length chosen so the drawn frets fill a fixed board width. On a
  // touch screen the board is drawn at full height (strings a finger apart)
  // and only as long as fits the screen, unless that would make the highest
  // fret narrower than a fingertip: then it is longer and scrolls sideways.
  const coarse = useCoarse();
  const boxW = width || FALLBACK_W;
  const full = maxHeight / H;
  const wide = Math.max(300, Math.min(900, 150 + frets * 52));
  const lastFretShare = (2 ** (-frets / 12) * (2 ** (1 / 12) - 1)) / (1 - 2 ** (-frets / 12)); // highest fret's width / board width
  const fitsAtFull = (OPEN_W + NUT_W + wide + 10) * full <= boxW;
  const boardW = coarse && !fitsAtFull ? Math.max(boxW / full - (OPEN_W + NUT_W + 10), MIN_FRET_TOUCH / full / lastFretShare) : wide;
  const scaleLen = boardW / (1 - 2 ** (-frets / 12));
  const fretX = (n: number) => OPEN_W + NUT_W + scaleLen * (1 - 2 ** (-n / 12));
  const totalW = fretX(frets) + 10;
  const stringY = (s: number) => PAD_TOP + (s - 1) * STRING_GAP;
  const cx = (fret: number) => (fret === 0 ? OPEN_W / 2 : (fretX(fret - 1) + fretX(fret)) / 2 + (fret === 1 ? NUT_W / 4 : 0));
  const scale = coarse && !fitsAtFull ? full : Math.max(Math.min(boxW / totalW, full), Math.min(full, MIN_STRING_GAP / STRING_GAP));
  const markOf = new Map(marks.map((m) => [`${m.string}/${m.fret}`, m]));

  // The string sounds the moment it is touched; the press counts at once for
  // a mouse, and when the finger lifts for touch (see ../touch.ts).
  const begin = (pos: FretPos) => {
    setFlash(`${pos.string}/${pos.fret}`);
    window.setTimeout(() => setFlash(null), 180);
    return sound ? startNote(fretMidi(pos), { timbre: "guitar", duration: 1.6 }) : undefined;
  };
  const press = (pos: FretPos) => {
    begin(pos);
    onPress?.(pos, fretMidi(pos));
  };
  const pointer = usePress<FretPos>(begin, (pos) => onPress?.(pos, fretMidi(pos)));
  const firstMark = marks.filter((m) => m.fret <= frets).reduce<number | null>((lo, m) => (lo === null || m.fret < lo ? m.fret : lo), null);
  const box = useScrollBox(totalW * scale, boxW, firstMark === null || firstMark <= 2 ? null : cx(firstMark) * scale);

  // One tab stop for the whole board; the arrow keys walk it fret by fret
  // (left and right) and string by string (up and down, as drawn).
  const [cursor, setCursor] = useState<FretPos | null>(null);
  const home: FretPos = marks.find((m) => m.fret <= frets) ?? { string: 6, fret: 0 };
  const focusPos = cursor && cursor.fret <= frets ? cursor : home;
  const cellEls = useRef(new Map<string, SVGGElement>());
  const onKeyDown = (pos: FretPos) => (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let to: FretPos | null = null;
    if (e.key === "ArrowRight") to = { string: pos.string, fret: Math.min(frets, pos.fret + 1) };
    else if (e.key === "ArrowLeft") to = { string: pos.string, fret: Math.max(0, pos.fret - 1) };
    else if (e.key === "ArrowUp") to = { string: Math.max(1, pos.string - 1), fret: pos.fret };
    else if (e.key === "ArrowDown") to = { string: Math.min(6, pos.string + 1), fret: pos.fret };
    else if (e.key === "Enter" || e.key === " ") {
      if (e.repeat) return e.preventDefault();
      press(pos);
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (to) {
      setCursor(to);
      cellEls.current.get(`${to.string}/${to.fret}`)?.focus();
    }
  };

  const inlays = [3, 5, 7, 9, 15, 17, 19, 21].filter((f) => f <= frets);
  const cells: FretPos[] = [];
  for (let s = 1; s <= 6; s++) for (let f = 0; f <= frets; f++) cells.push({ string: s, fret: f });

  return (
    <div ref={ref} className="instrument w-full min-w-48">
      <div ref={box.ref} className="instrument-scroll" data-scrollable={box.scrollable || undefined}>
      <svg width={totalW * scale} height={(H + 18) * scale} viewBox={`0 0 ${totalW} ${H + 18}`} role="group" aria-label="Guitar fretboard. Arrow keys move between strings and frets, Enter plays one" style={{ display: "block", margin: "0 auto" }}>
        <defs>
          <linearGradient id={woodId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--rosewood)" />
            <stop offset="1" stopColor="var(--rosewood-dark)" />
          </linearGradient>
        </defs>
        <rect x={OPEN_W} y={2} width={totalW - OPEN_W - 2} height={H - 4} rx={4} fill={`url(#${woodId})`} />
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
            <g
              key={key}
              ref={(el) => {
                if (el) cellEls.current.set(key, el);
                else cellEls.current.delete(key);
              }}
              className="fb-cell"
              {...pointer(pos)}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={onKeyDown(pos)}
              onFocus={() => setCursor(pos)}
              tabIndex={pos.string === focusPos.string && pos.fret === focusPos.fret ? 0 : -1}
              style={{ cursor: "pointer" }}
              role="button"
              aria-label={`String ${pos.string}, ${pos.fret === 0 ? "open" : `fret ${pos.fret}`}${isMuted ? ", not played" : mark ? ", marked" : ""}`}
            >
              <rect x={left} y={y - STRING_GAP / 2} width={right - left} height={STRING_GAP} rx={3} fill="transparent" />
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
      {box.scrollable && (
        <p className="instrument-more" aria-hidden="true">
          <span style={{ visibility: box.more.left ? "visible" : "hidden" }}>‹ nut</span>
          <span>swipe</span>
          <span style={{ visibility: box.more.right ? "visible" : "hidden" }}>higher frets ›</span>
        </p>
      )}
    </div>
  );
}

/** Open-string names for captions, string 6 first. */
export const OPEN_STRING_NAMES = [6, 5, 4, 3, 2, 1].map((s) => pcNameOf(openStringMidi(s, STANDARD_TUNING)));
