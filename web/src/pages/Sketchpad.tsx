import { useEffect, useMemo, useState } from "react";
import type { Sound } from "../../shared/exercise-types.ts";
import { chordLabel, chordSymbol, diatonicTriads } from "../../shared/music/chords.ts";
import { pianoVoicing } from "../../shared/music/instruments.ts";
import { fromMidi, parsePitchClass, pc, pcLabel, pcOfClass, pitchName, toMidi, type Pitch } from "../../shared/music/notes.ts";
import { parseDuration } from "../../shared/music/rhythm.ts";
import { parseKey, scaleNotes } from "../../shared/music/scales.ts";
import { playChord, playNote } from "../audio/index.ts";
import { Button, Card, cx, pcColor, PlayButton, Segmented, Slider, useCoarsePointer } from "../ui.tsx";
import { keyboardRange, LinkedViews, type View } from "../widgets/notation/Linked.tsx";
import { Score, type ScoreItem } from "../widgets/notation/Score.tsx";
import { useTimedPlayback } from "../widgets/notation/Time.tsx";

// The Sketchpad: a small place to write a melody over chords and hear it.
// A grid of eighth-note steps against the notes of the chosen key; one chord
// per bar from the key's own chords. What you write is engraved on the staff
// as you go. The sketch is kept in this browser's local storage.

interface SketchNote {
  /** Start, in eighth notes from the beginning. */
  start: number;
  /** Length in eighth notes. */
  len: number;
  midi: number;
}
interface Sketch {
  key: string;
  tempo: number;
  bars: number;
  /** Roman numeral per bar, "" for none. */
  chords: string[];
  notes: SketchNote[];
}

const STORE = "fret-not.sketch.v1";
const STEPS = 8; // eighth notes per 4/4 bar
const KEYS = ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Am", "Em", "Dm", "Bm"];
const LENGTHS: { len: number; token: string; label: string }[] = [
  { len: 1, token: "e", label: "Eighth" },
  { len: 2, token: "q", label: "Quarter" },
  { len: 3, token: "q.", label: "Dotted quarter" },
  { len: 4, token: "h", label: "Half" },
  { len: 6, token: "h.", label: "Dotted half" },
  { len: 8, token: "w", label: "Whole" },
];
const REST_SIZES = [8, 4, 2, 1];
const STARTER: Sketch = {
  key: "C",
  tempo: 100,
  bars: 4,
  chords: ["I", "V", "vi", "IV"],
  notes: [
    { start: 0, len: 2, midi: 64 }, { start: 2, len: 2, midi: 67 }, { start: 4, len: 4, midi: 72 },
    { start: 8, len: 2, midi: 71 }, { start: 10, len: 2, midi: 67 }, { start: 12, len: 4, midi: 62 },
    { start: 16, len: 2, midi: 60 }, { start: 18, len: 2, midi: 64 }, { start: 20, len: 4, midi: 69 },
    { start: 24, len: 3, midi: 69 }, { start: 27, len: 1, midi: 67 }, { start: 28, len: 4, midi: 65 },
  ],
};

function load(): Sketch {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE) ?? "null") as Sketch | null;
    if (raw && typeof raw.key === "string" && Array.isArray(raw.notes) && Array.isArray(raw.chords) && KEYS.includes(raw.key)) return raw;
  } catch {
    /* unreadable: start from the example */
  }
  return STARTER;
}

/** The key's scale as spelled pitches across the range the grid offers. */
function gridRows(key: string): Pitch[] {
  const k = parseKey(key);
  const tpc = pcOfClass(k.tonic);
  const tonic = { ...k.tonic, oct: tpc >= 7 ? 3 : 4 };
  const type = k.mode === "minor" ? "natural-minor" : "major";
  const lower = scaleNotes({ ...tonic, oct: tonic.oct - 1 }, type);
  const mid = scaleNotes(tonic, type);
  const upper = scaleNotes({ ...tonic, oct: tonic.oct + 1 }, type);
  const base = toMidi(tonic);
  return [...lower, ...mid, ...upper].filter((p) => toMidi(p) >= base - 5 && toMidi(p) <= base + 17).reverse();
}

/** Notes → engraved items, with rests filling the gaps, bar by bar. */
function toItems(sketch: Sketch, rows: Pitch[]): { items: ScoreItem[]; noteIndex: (number | null)[] } {
  const spell = new Map(rows.map((p) => [toMidi(p), p]));
  const items: ScoreItem[] = [];
  const noteIndex: (number | null)[] = [];
  const sorted = [...sketch.notes].sort((a, b) => a.start - b.start);
  for (let bar = 0; bar < sketch.bars; bar++) {
    let at = bar * STEPS;
    const end = at + STEPS;
    const rest = (until: number) => {
      let gap = until - at;
      while (gap > 0) {
        // Rests fall on the beat: an odd start takes an eighth rest first.
        const size = at % 2 === 1 ? 1 : (REST_SIZES.find((s) => s <= gap && (at - bar * STEPS) % s === 0) ?? 1);
        items.push({ pitches: [], duration: parseDuration(`${LENGTHS.find((l) => l.len === size)!.token}r`), bar });
        noteIndex.push(null);
        at += size;
        gap -= size;
      }
    };
    for (const n of sorted.filter((x) => x.start >= bar * STEPS && x.start < end)) {
      rest(n.start);
      const len = LENGTHS.find((l) => l.len === n.len) ?? LENGTHS[0];
      items.push({ pitches: [spell.get(n.midi) ?? fromMidi(n.midi)], duration: parseDuration(len.token), bar });
      noteIndex.push(sketch.notes.indexOf(n));
      at = n.start + n.len;
    }
    rest(end);
  }
  return { items, noteIndex };
}

function toTokens(items: ScoreItem[]): string {
  const out: string[] = [];
  items.forEach((it, i) => {
    if (i > 0 && it.bar !== items[i - 1].bar) out.push("|");
    const d = it.duration!;
    const dur = `${d.value}${d.dotted ? "." : ""}`;
    out.push(it.pitches.length ? `${it.pitches.map(pitchName).join("+")}:${dur}` : `r:${dur}`);
  });
  return out.join(" ");
}

export function SketchpadPage() {
  const [sketch, setSketch] = useState<Sketch>(load);
  const [len, setLen] = useState(2);
  const [views, setViews] = useState<View[]>(["keyboard"]);
  const [copied, setCopied] = useState(false);
  const { active, playing, play, stop } = useTimedPlayback();
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE, JSON.stringify(sketch));
    } catch {
      /* storage unavailable: the sketch lasts until the page closes */
    }
  }, [sketch]);

  const rows = useMemo(() => gridRows(sketch.key), [sketch.key]);
  const triads = useMemo(() => diatonicTriads(sketch.key), [sketch.key]);
  const { items, noteIndex } = useMemo(() => toItems(sketch, rows), [sketch, rows]);
  const totalSteps = sketch.bars * STEPS;
  const tonicPc = pcOfClass(parseKey(sketch.key).tonic);
  const chordOf = (roman: string) => triads.find((t) => t.roman === roman)?.chord;

  const setKey = (key: string) => {
    // Keep the tune's shape: move each note to the same row in the new key.
    const from = gridRows(sketch.key).map(toMidi);
    const to = gridRows(key).map(toMidi);
    const fromTriads = diatonicTriads(sketch.key);
    const toTriads = diatonicTriads(key);
    setSketch({
      ...sketch,
      key,
      notes: sketch.notes.map((n) => ({ ...n, midi: to[Math.min(to.length - 1, Math.max(0, from.indexOf(n.midi)))] })),
      chords: sketch.chords.map((r) => toTriads[fromTriads.findIndex((t) => t.roman === r)]?.roman ?? ""),
    });
  };
  const setBars = (bars: number) => setSketch({ ...sketch, bars, notes: sketch.notes.filter((n) => n.start < bars * STEPS), chords: Array.from({ length: bars }, (_, i) => sketch.chords[i] ?? "") });
  const clickCell = (step: number, midi: number) => {
    const existing = sketch.notes.find((n) => n.start === step && n.midi === midi);
    if (existing) return setSketch({ ...sketch, notes: sketch.notes.filter((n) => n !== existing) });
    const barEnd = (Math.floor(step / STEPS) + 1) * STEPS;
    const fit = Math.min(len, barEnd - step);
    // Only lengths that can be written as one note.
    const useLen = [...LENGTHS].reverse().find((l) => l.len <= fit)!.len;
    const end = step + useLen;
    playNote(midi, { timbre: "piano", duration: (useLen / 2) * (60 / sketch.tempo) });
    // One voice: anything this note overlaps makes way for it.
    setSketch({ ...sketch, notes: [...sketch.notes.filter((n) => n.start + n.len <= step || n.start >= end), { start: step, len: useLen, midi }] });
  };

  const sound: Sound = useMemo(() => {
    let at = 0;
    const melody = items.map((it) => {
      const e = { midis: it.pitches.map(toMidi), at, beats: it.duration!.beats };
      at += it.duration!.beats;
      return e;
    });
    const chords = sketch.chords.slice(0, sketch.bars).flatMap((r, bar) => {
      const c = chordOf(r);
      return c ? [{ midis: pianoVoicing(chordSymbol(c)).map((m) => m - 12), at: bar * 4, beats: 4 }] : [];
    });
    return { tempo: sketch.tempo, events: [...melody, ...chords] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sketch.chords, sketch.bars, sketch.tempo, triads]);
  const activeItem = active != null && active < items.length ? active : null;
  const activeNote = activeItem != null ? noteIndex[activeItem] : null;
  const playingBar = activeItem != null ? (items[activeItem].bar ?? 0) : null;
  const nowPitches = activeItem != null ? items[activeItem].pitches : [];
  const range = useMemo(() => keyboardRange(rows.map(toMidi)), [rows]);
  // Finger-sized squares on a touch screen; the grid scrolls sideways in its
  // own box and the note names stay pinned to its left edge.
  const coarse = useCoarsePointer();
  const cell = coarse ? 44 : 26;
  const rowH = coarse ? 44 : 22;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <h1 className="text-3xl font-bold text-fg sm:text-4xl">Sketchpad</h1>
      <p className="mt-1 text-fg-2">Write a melody over chords. Pick a note length, then press a square in the grid; press a note's first square to remove it. Every row is a note of the key, so nothing you pick is "wrong".</p>

      <Card className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 px-3 py-3 sm:px-4">
        <PlayButton playing={playing} onClick={() => (playing ? stop() : play(sound, { timbre: "piano" }))} />
        <label className="flex items-center gap-1.5 text-sm font-medium text-fg-2">Key
          <select value={sketch.key} onChange={(e) => setKey(e.target.value)} className="rounded-md border border-line bg-panel px-1.5 py-1 text-base text-fg pointer-coarse:min-h-11">
            {KEYS.map((k) => <option key={k} value={k}>{pcLabel(parseKey(k).tonic)} {parseKey(k).mode}</option>)}
          </select>
        </label>
        <Segmented label="Length of the sketch" value={String(sketch.bars)} onChange={(v) => setBars(Number(v))} options={[{ value: "2", label: "2 bars" }, { value: "4", label: "4 bars" }, { value: "8", label: "8 bars" }]} />
        <Slider className="min-w-48 flex-1" label="Tempo" value={sketch.tempo} min={50} max={180} onChange={(tempo) => setSketch({ ...sketch, tempo })} format={(v) => `${v} bpm`} />
      </Card>

      <Card className="mt-4 px-3 py-4 sm:px-4">
        <Score clef="treble" keySig={sketch.key} time="4/4" items={items} active={activeItem} tone="pc" onItemClick={(i) => items[i].pitches.length && playChord(items[i].pitches.map(toMidi), { timbre: "piano" })} />
      </Card>

      <Card className="mt-4 px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-fg-2">Note length</span>
          <Segmented label="Note length" value={String(len)} onChange={(v) => setLen(Number(v))} options={LENGTHS.map((l) => ({ value: String(l.len), label: l.label }))} />
        </div>
        <div className="overflow-x-auto overscroll-x-contain pb-1">
          <div style={{ width: 44 + totalSteps * cell + (sketch.bars - 1) * 6 }}>
            {/* Chord per bar. */}
            <div className="mb-2 flex" style={{ paddingLeft: 44 }}>
              {Array.from({ length: sketch.bars }, (_, bar) => {
                const c = chordOf(sketch.chords[bar] ?? "");
                return (
                  <div key={bar} style={{ width: STEPS * cell, marginRight: 6 }} className="pr-1">
                    <select
                      aria-label={`Chord for bar ${bar + 1}`}
                      value={sketch.chords[bar] ?? ""}
                      onChange={(e) => {
                        const chords = Array.from({ length: sketch.bars }, (_, i) => (i === bar ? e.target.value : (sketch.chords[i] ?? "")));
                        setSketch({ ...sketch, chords });
                        const picked = chordOf(e.target.value);
                        if (picked) playChord(pianoVoicing(chordSymbol(picked)), { timbre: "piano" });
                      }}
                      className={cx("w-full rounded-lg border-2 bg-panel px-2 py-1.5 font-display text-lg font-bold text-fg pointer-coarse:min-h-11", playingBar === bar ? "border-accent" : "border-line")}
                      style={c ? { boxShadow: `inset 5px 0 0 ${pcColor(pcOfClass(c.root))}` } : undefined}
                    >
                      <option value="">— no chord</option>
                      {triads.map((t) => <option key={t.roman} value={t.roman}>{chordLabel(t.chord)}  ({t.roman})</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            {/* The grid. */}
            {rows.map((p) => {
              const midi = toMidi(p);
              const isTonic = pc(midi) === tonicPc;
              return (
                <div key={midi} className="flex items-center">
                  <button type="button" onClick={() => playNote(midi, { timbre: "piano" })} className="sticky left-0 z-10 flex shrink-0 items-center justify-center rounded-l-md text-xs font-bold shadow-[4px_0_0_var(--panel)]" style={{ width: 40, height: rowH, background: pcColor(midi), color: "var(--pc-ink)", marginRight: 4 }}>
                    {pcLabel(p)}{isTonic ? p.oct : ""}
                  </button>
                  {Array.from({ length: totalSteps }, (_, step) => {
                    const note = sketch.notes.find((n) => n.midi === midi && step >= n.start && step < n.start + n.len);
                    const isStart = note?.start === step;
                    const isEnd = note ? step === note.start + note.len - 1 : false;
                    const on = note && sketch.notes.indexOf(note) === activeNote;
                    return (
                      <button
                        key={step}
                        type="button"
                        aria-label={`${pcLabel(p)}${p.oct}, bar ${Math.floor(step / STEPS) + 1}, step ${(step % STEPS) + 1}${note ? " (note)" : ""}`}
                        onClick={() => (note && !isStart ? clickCell(note.start, midi) : clickCell(step, midi))}
                        className={cx("shrink-0 touch-manipulation", !note && "hover:brightness-90 active:brightness-90")}
                        style={{
                          width: cell,
                          height: rowH,
                          marginRight: step % STEPS === STEPS - 1 ? 6 : 0,
                          background: note ? pcColor(midi) : isTonic ? "var(--raised)" : "var(--panel)",
                          borderTop: "1px solid var(--line)",
                          borderLeft: note && !isStart ? "none" : `1px solid ${step % 2 === 0 ? "var(--line-strong)" : "var(--line)"}`,
                          borderRadius: note ? `${isStart ? 6 : 0}px ${isEnd ? 6 : 0}px ${isEnd ? 6 : 0}px ${isStart ? 6 : 0}px` : 0,
                          filter: on ? "brightness(1.25)" : undefined,
                          outline: on ? "2px solid var(--ink)" : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
            <div className="mt-1 flex text-[0.68rem] text-fg-3" style={{ paddingLeft: 44 }}>
              {Array.from({ length: totalSteps }, (_, step) => (
                <span key={step} style={{ width: cell, marginRight: step % STEPS === STEPS - 1 ? 6 : 0 }} className="text-center">{step % 2 === 0 ? step / 2 % 4 + 1 : "&"}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-4 px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-fg-2">Follow along on</span>
          {(["keyboard", "fretboard"] as View[]).map((v) => (
            <label key={v} className="flex items-center gap-1.5 text-sm text-fg-2 pointer-coarse:min-h-11 pointer-coarse:gap-2 pointer-coarse:text-base">
              <input type="checkbox" className="accent-(--accent) pointer-coarse:size-5" checked={views.includes(v)} onChange={(e) => setViews(e.target.checked ? [...views, v] : views.filter((x) => x !== v))} /> {v}
            </label>
          ))}
        </div>
        {views.length > 0 ? <LinkedViews notes={nowPitches} views={views} chord keyRange={range} /> : <p className="text-sm text-fg-3">Tick a view to watch the tune move across the instrument as it plays.</p>}
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            // The clipboard is missing on an insecure origin (a phone reaching
            // the app over plain http): fail quietly rather than throw.
            void navigator.clipboard?.writeText(toTokens(items)).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              },
              () => undefined,
            );
          }}
        >
          {copied ? "Copied" : "Copy as melody text"}
        </Button>
        <span className="text-sm text-fg-3">Paste it to the Tutor ("turn this into a lesson example") or into a lesson's <code>melody</code> widget.</span>
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => setSketch({ ...sketch, notes: [], chords: sketch.chords.map(() => "") })}>Clear</Button>
        <Button variant="ghost" onClick={() => setSketch(STARTER)}>Load the example</Button>
      </div>
      <p className="mt-3 text-xs text-fg-3">Chords: {sketch.chords.slice(0, sketch.bars).map((r) => { const c = chordOf(r); return c ? chordLabel(c) : "—"; }).join("  |  ")} · saved in this browser · key of {pcLabel(parsePitchClass(sketch.key.replace(/m$/, "")))}{sketch.key.endsWith("m") ? " minor" : " major"}</p>
    </div>
  );
}
