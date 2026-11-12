import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { TYPING_KEYS } from "../../../shared/music/instruments.ts";
import { accSymbol, fromMidi, isBlackKey, pc, pcBothLabels } from "../../../shared/music/notes.ts";
import { startNote } from "../../audio/index.ts";
import { pcColor } from "../../ui.tsx";
import type { Tone } from "./Score.tsx";
import { useWidth } from "./Score.tsx";
import { useCoarse, usePress, useScrollBox } from "../touch.ts";

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
  /** Which keys show their name when not marked. "landmarks" is for an
   *  exercise that grades the exact octave: only the Cs are named, with their
   *  octave number, and middle C is pointed out, so the learner can find the
   *  octave asked for without any other key being named. */
  labels?: "none" | "c" | "landmarks" | "naturals" | "all";
  onPress?: (midi: number) => void;
  /** Play a piano note on press. Default true. */
  sound?: boolean;
  /** Let the computer keyboard play (A S D F … = white keys from the lowest
   *  C, W E T Y U = black keys). Default false. Any number of keyboards on a
   *  page may ask for this; only one answers at a time (see `typingOwner`). */
  typing?: boolean;
  /** Draw the computer-keyboard letter on each key as a small key-cap while
   *  this keyboard is the one that answers typing. Default false: an exercise
   *  keyboard never shows them (a cap reading "F" on the G key looks like a
   *  note name), and they are never drawn when `labels` is "none". */
  typingHints?: boolean;
  /** Tallest the keyboard may be drawn, px. */
  maxHeight?: number;
}

const WHITE_W = 24;
const WHITE_H = 104;
const BLACK_W = 14;
const BLACK_H = 64;
/** How far each black key sits from the centre of the crack it straddles,
 *  as on a real keyboard (C# and F# lean left, D# and A# lean right). */
/** Narrowest a white key is drawn, px: under a finger, and under a mouse. */
const MIN_WHITE_TOUCH = 34;
const MIN_WHITE = 15;
/** Width assumed until the box has been measured (or if it measures 0). */
const FALLBACK_W = 320;
const BLACK_NUDGE: Record<number, number> = { 1: -2, 3: 2, 6: -3, 8: 0, 10: 3 };

function toneColor(tone: Tone | undefined, midi: number): string {
  if (tone === "accent") return "var(--accent)";
  if (tone === "good") return "var(--good)";
  if (tone === "bad") return "var(--bad)";
  if (tone === "ink") return "var(--fg-2)";
  return pcColor(midi);
}

/** "C 4", "C sharp / D flat 4": a key's name as a screen reader should say it. */
function spokenKey(midi: number): string {
  const say = (s: string) => s.replace("#", " sharp").replace(/^([A-G])b$/, "$1 flat");
  const p = fromMidi(midi);
  const sharp = say(`${p.letter}${p.acc > 0 ? "#" : ""}`);
  if (!isBlackKey(midi)) return `${sharp} ${p.oct}`;
  const f = fromMidi(midi, "flat");
  return `${sharp} / ${f.letter} flat ${p.oct}`;
}

// --- one keyboard answers the computer keyboard at a time ---------------------
//
// Every keyboard with `typing` registers here. The one that answers is the
// one last clicked or focused if it is still on screen, otherwise the one on
// screen nearest the middle of the window. A keyboard that is off screen
// never answers. One window listener serves them all.

interface TypingEntry {
  id: string;
  el: () => HTMLElement | null;
  play: (key: string) => boolean;
}
const typingEntries = new Map<string, TypingEntry>();
const typingSubs = new Set<() => void>();
let typingClaim: string | null = null;
let typingActive: string | null = null;
let typingListening = false;
let typingFrame = 0;

function onScreen(el: HTMLElement | null): boolean {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

function typingOwner(): string | null {
  const claimed = typingClaim ? typingEntries.get(typingClaim) : undefined;
  if (claimed && onScreen(claimed.el())) return claimed.id;
  const mid = window.innerHeight / 2;
  let best: TypingEntry | null = null;
  let bestD = Infinity;
  for (const e of typingEntries.values()) {
    const el = e.el();
    if (!onScreen(el)) continue;
    const r = el!.getBoundingClientRect();
    const d = Math.abs((r.top + r.bottom) / 2 - mid);
    if (d < bestD) [best, bestD] = [e, d];
  }
  return best?.id ?? null;
}
function refreshTyping(): void {
  const next = typingOwner();
  if (next === typingActive) return;
  typingActive = next;
  for (const fn of typingSubs) fn();
}
function scheduleTypingRefresh(): void {
  if (typingFrame) return;
  typingFrame = requestAnimationFrame(() => {
    typingFrame = 0;
    refreshTyping();
  });
}
function onTypingKey(e: KeyboardEvent): void {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if (TYPING_KEYS[e.key.toLowerCase()] === undefined) return;
  refreshTyping();
  const entry = typingActive ? typingEntries.get(typingActive) : undefined;
  if (entry?.play(e.key.toLowerCase())) e.preventDefault();
}
function syncTypingListeners(): void {
  const want = typingEntries.size > 0;
  if (want === typingListening) return;
  typingListening = want;
  const f = want ? window.addEventListener : window.removeEventListener;
  f.call(window, "keydown", onTypingKey as EventListener);
  f.call(window, "scroll", scheduleTypingRefresh, true);
  f.call(window, "resize", scheduleTypingRefresh);
}
function registerTyping(entry: TypingEntry): () => void {
  typingEntries.set(entry.id, entry);
  syncTypingListeners();
  scheduleTypingRefresh();
  return () => {
    typingEntries.delete(entry.id); // a claim on it lapses by itself: typingOwner ignores ids that are gone
    syncTypingListeners();
    scheduleTypingRefresh();
  };
}
function claimTyping(id: string): void {
  if (!typingEntries.has(id)) return;
  typingClaim = id;
  refreshTyping();
}
const subscribeTyping = (fn: () => void) => {
  typingSubs.add(fn);
  return () => typingSubs.delete(fn);
};

export function Keyboard({ lo, hi, marks = [], labels = "naturals", onPress, sound = true, typing = false, typingHints = false, maxHeight = 150 }: KeyboardProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const id = useId();
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

  // A press has two halves (see ../touch.ts): the key goes down and sounds
  // at once; it counts (onPress) at once for a mouse or the computer keyboard,
  // and when the finger lifts for touch, unless the touch turned into a scroll.
  const begin = (midi: number) => {
    setDown((s) => new Set(s).add(midi));
    window.setTimeout(() => setDown((s) => {
      const n = new Set(s);
      n.delete(midi);
      return n;
    }), 160);
    return sound ? startNote(midi, { timbre: "piano", duration: 1.2 }) : undefined;
  };
  const press = (midi: number) => {
    begin(midi);
    onPress?.(midi);
  };
  const pointer = usePress<number>(begin, (midi) => onPress?.(midi));
  const pressRef = useRef(press);
  pressRef.current = press;

  // Computer-keyboard input, anchored on the lowest C in range.
  const baseC = whites.find((m) => pc(m) === 0) ?? first;
  useEffect(() => {
    if (!typing) return;
    return registerTyping({
      id,
      el: () => ref.current,
      play: (key) => {
        const midi = baseC + TYPING_KEYS[key];
        if (midi > last) return false;
        pressRef.current(midi);
        return true;
      },
    });
  }, [typing, id, ref, baseC, last]);
  const owner = useSyncExternalStore(subscribeTyping, () => typingActive);
  const typingHere = typing && owner === id;
  const coarse = useCoarse();
  const showCaps = typingHere && typingHints && labels !== "none" && !coarse;
  const typingKey = (midi: number): string | undefined => (showCaps ? Object.entries(TYPING_KEYS).find(([, off]) => baseC + off === midi)?.[0] : undefined);

  // One tab stop for the whole keyboard; the arrow keys walk it key by key.
  const [cursor, setCursor] = useState<number | null>(null);
  // The key ringed for keyboard focus. Drawn last, over the black keys, which
  // would otherwise hide half of a white key's ring.
  const [ring, setRing] = useState<number | null>(null);
  const home = marks.find((m) => m.midi >= first && m.midi <= last)?.midi ?? (baseC >= first && baseC <= last ? baseC : first);
  const focusKey = cursor !== null && cursor >= first && cursor <= last ? cursor : home;
  const keyEls = useRef(new Map<number, SVGGElement>());
  const onKeyDown = (midi: number) => (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let to: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(last, midi + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(first, midi - 1);
    else if (e.key === "Home") to = first;
    else if (e.key === "End") to = last;
    else if (e.key === "Enter" || e.key === " ") {
      if (e.repeat) return e.preventDefault();
      press(midi);
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (to !== null) {
      setCursor(to);
      keyEls.current.get(to)?.focus();
    }
  };
  // With names switched off (an exercise), a key is announced by where it is,
  // which is what a sighted learner sees; naming it would give answers away.
  const keyLabel = (m: number): string => {
    const where = isBlackKey(m) ? `Black key after white key ${whites.indexOf(m - 1) + 1}` : `White key ${whites.indexOf(m) + 1} of ${whites.length}`;
    const named = labels === "landmarks" ? pc(m) === 0 : labels !== "none";
    return (named ? spokenKey(m) + (labels === "landmarks" && m === 60 ? ", middle C" : "") : where) + (markOf.has(m) ? ", marked" : "");
  };
  const keyProps = (m: number) => ({
    ref: (el: SVGGElement | null) => {
      if (el) keyEls.current.set(m, el);
      else keyEls.current.delete(m);
    },
    role: "button",
    tabIndex: m === focusKey ? 0 : -1,
    "aria-label": keyLabel(m),
    ...pointer(m),
    // A mouse or finger press must not move focus onto the key: the page
    // around it (an exercise's Next button) keeps Enter. Focus reaches a key
    // only from the keyboard (Tab, arrows).
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: onKeyDown(m),
    onFocus: (e: React.FocusEvent) => {
      setCursor(m);
      setRing(e.currentTarget.matches(":focus-visible") ? m : null);
    },
    onBlur: () => setRing(null),
    className: "kb-key",
    style: { cursor: "pointer" },
  });

  // Fit the width, up to the tallest allowed. On a touch screen a white key
  // is never narrower than a fingertip, and on any screen never a sliver: a
  // keyboard too wide for its box scrolls sideways inside it instead.
  const boxW = width || FALLBACK_W;
  const full = maxHeight / WHITE_H;
  const scale = Math.max(Math.min(boxW / totalW, full), Math.min(full, (coarse ? MIN_WHITE_TOUCH : MIN_WHITE) / WHITE_W));
  const xOfWhite = (midi: number) => whites.indexOf(midi) * WHITE_W;
  const xOfBlack = (midi: number) => xOfWhite(midi - 1) + WHITE_W - BLACK_W / 2 + BLACK_NUDGE[pc(midi)];
  // When it scrolls, start with the marked keys (else middle C, else the
  // typing anchor) in the middle.
  const inRange = (m: number) => m >= first && m <= last;
  const shown = marks.filter((m) => inRange(m.midi)).map((m) => m.midi);
  const focusMidi = shown.length ? (Math.min(...shown) + Math.max(...shown)) / 2 : inRange(60) ? 60 : baseC;
  const focusWhite = whites.findIndex((m) => m >= Math.floor(focusMidi));
  const box = useScrollBox(totalW * scale, boxW, (Math.max(0, focusWhite) + 0.5) * WHITE_W * scale);

  const nameOf = (midi: number): string | null => {
    const p = fromMidi(midi);
    if (labels === "none") return null;
    if (labels === "c" || labels === "landmarks") return pc(midi) === 0 ? `C${p.oct}` : null;
    if (isBlackKey(midi)) return labels === "all" ? pcBothLabels(midi).replace(" / ", "\n") : null;
    return pc(midi) === 0 ? `C${p.oct}` : p.letter + accSymbol(p.acc);
  };

  return (
    <div ref={ref} className="instrument w-full min-w-48" onPointerDown={typing ? () => claimTyping(id) : undefined} onFocus={typing ? () => claimTyping(id) : undefined} data-typing={typing ? (typingHere ? "active" : "idle") : undefined}>
      <div ref={box.ref} className="instrument-scroll" data-scrollable={box.scrollable || undefined}>
      <svg width={totalW * scale} height={WHITE_H * scale + 4} viewBox={`0 0 ${totalW} ${WHITE_H + 4}`} role="group" aria-label={`Piano keyboard${typing ? ". Arrow keys move along the keys, Enter plays one" : ""}`} style={{ display: "block", margin: "0 auto" }}>
        {whites.map((m) => {
          const x = xOfWhite(m);
          const mark = markOf.get(m);
          const name = mark?.label ?? nameOf(m);
          const tk = typingKey(m);
          return (
            <g key={m} {...keyProps(m)}>
              <rect x={x + 0.5} y={0.5} width={WHITE_W - 1} height={WHITE_H} rx={3} fill={down.has(m) ? "var(--ivory-edge)" : "var(--ivory)"} stroke="var(--ivory-edge)" />
              {mark && <circle cx={x + WHITE_W / 2} cy={WHITE_H - 17} r={9.5} fill={toneColor(mark.tone, m)} />}
              {labels === "landmarks" && m === 60 && !mark && <circle cx={x + WHITE_W / 2} cy={WHITE_H - 17} r={9.5} fill="none" stroke="var(--ivory-ink)" strokeWidth={1.2} />}
              {name && (
                <text x={x + WHITE_W / 2} y={WHITE_H - 17} textAnchor="middle" dominantBaseline="central" fontSize={name.length > 2 ? 7.5 : 9.5} fontWeight={700} fill={mark ? "var(--pc-ink)" : "var(--ivory-ink)"} style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>
                  {name}
                </text>
              )}
              {tk && (
                <g style={{ pointerEvents: "none" }} aria-hidden="true">
                  <rect x={x + WHITE_W / 2 - 5.5} y={BLACK_H + 3.5} width={11} height={10} rx={2.2} fill="var(--ivory)" stroke="var(--ivory-ink-soft)" strokeWidth={0.7} />
                  <text x={x + WHITE_W / 2} y={BLACK_H + 8.8} textAnchor="middle" dominantBaseline="central" fontSize={6.2} fontWeight={600} fill="var(--ivory-ink-soft)" style={{ fontFamily: "var(--font-mono)" }}>
                    {tk.toUpperCase()}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {blacks.map((m) => {
          const x = xOfBlack(m);
          const mark = markOf.get(m);
          const name = mark?.label ?? nameOf(m);
          const tk = typingKey(m);
          const lines = name ? name.split("\n") : [];
          return (
            <g key={m} {...keyProps(m)}>
              <rect x={x} y={0} width={BLACK_W} height={BLACK_H} rx={2.5} fill={down.has(m) ? "var(--ebony-top)" : "var(--ebony)"} />
              <rect x={x + 1.5} y={1} width={BLACK_W - 3} height={BLACK_H - 9} rx={2} fill="var(--ebony-top)" opacity={down.has(m) ? 0.3 : 0.75} />
              {mark && <circle cx={x + BLACK_W / 2} cy={BLACK_H - 13} r={7.5} fill={toneColor(mark.tone, m)} />}
              {tk && !mark && lines.length === 0 && (
                <g style={{ pointerEvents: "none" }} aria-hidden="true">
                  <rect x={x + BLACK_W / 2 - 5} y={BLACK_H - 15} width={10} height={9.5} rx={2.2} fill="none" stroke="var(--ebony-ink)" strokeWidth={0.6} opacity={0.7} />
                  <text x={x + BLACK_W / 2} y={BLACK_H - 10} textAnchor="middle" dominantBaseline="central" fontSize={5.8} fontWeight={600} fill="var(--ebony-ink)" opacity={0.85} style={{ fontFamily: "var(--font-mono)" }}>
                    {tk.toUpperCase()}
                  </text>
                </g>
              )}
              {lines.map((line, i) => (
                <text key={i} x={x + BLACK_W / 2} y={BLACK_H - 13 + (lines.length === 2 ? (i === 0 ? -(mark ? 3.2 : 4) : mark ? 3.4 : 4.5) : 0)} textAnchor="middle" dominantBaseline="central" fontSize={lines.length === 2 ? (mark ? 5.2 : 6) : 7} fontWeight={700} fill={mark ? "var(--pc-ink)" : "var(--ebony-ink)"} style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}>
                  {line}
                </text>
              ))}
            </g>
          );
        })}
        {ring !== null && ring >= first && ring <= last && (isBlackKey(ring) ? <rect x={xOfBlack(ring) - 1} y={-0.5} width={BLACK_W + 2} height={BLACK_H + 1.5} rx={3} fill="none" stroke="var(--accent)" strokeWidth={2.5} style={{ pointerEvents: "none" }} /> : <rect x={xOfWhite(ring) + 1.5} y={1.5} width={WHITE_W - 3} height={WHITE_H - 2} rx={3} fill="none" stroke="var(--accent)" strokeWidth={2.5} style={{ pointerEvents: "none" }} />)}
      </svg>
      </div>
      {box.scrollable && (
        <p className="instrument-more" aria-hidden="true">
          <span style={{ visibility: box.more.left ? "visible" : "hidden" }}>‹ lower keys</span>
          <span>swipe</span>
          <span style={{ visibility: box.more.right ? "visible" : "hidden" }}>higher keys ›</span>
        </p>
      )}
      {labels === "landmarks" && inRange(60) && <p className="mt-1 text-center text-xs font-medium text-fg-3">The ringed key, C4, is middle C. Each C starts a new octave number.</p>}
      {typingHere && !coarse && <p className="mt-1 text-center text-[0.7rem] font-medium text-fg-3" data-typing-badge="">⌨ Your computer keyboard plays this one: A S D F… are the white keys, W E T Y U the black</p>}
    </div>
  );
}
