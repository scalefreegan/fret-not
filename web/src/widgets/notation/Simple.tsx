import { useMemo } from "react";
import { parseFretPos, positionsOf, positionsOfPc } from "../../../shared/music/instruments.ts";
import { midiOf, parsePitch, parsePitchClass, pcLabel, pcOfClass, pitchLabel, toMidi } from "../../../shared/music/notes.ts";
import { playChord, playNote } from "../../audio/index.ts";
import { PlayButton, WidgetFrame } from "../../ui.tsx";
import { bool, list, num, str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { Fretboard, type FretMark } from "./Fretboard.tsx";
import { Keyboard } from "./Keyboard.tsx";
import { clefForNotes } from "./Linked.tsx";
import { Score, type ScoreClef } from "./Score.tsx";
import { usePressWord } from "../touch.ts";

// The plain single-view widgets: a keyboard, a fretboard, a staff.

export function KeyboardWidget({ params }: WidgetProps) {
  const word = usePressWord();
  const range = list<string>(params, "range", ["C3", "C5"]);
  const highlight = list<string>(params, "highlight", []).map(parsePitch);
  return (
    <WidgetFrame title="Keyboard" hint={word.coarse ? "Tap the keys" : "Click the keys, or play A S D F G H J on your computer keyboard"}>
      <Keyboard lo={midiOf(range[0])} hi={midiOf(range[1])} labels={str(params, "labels", "naturals") as "none"} marks={highlight.map((p) => ({ midi: toMidi(p), label: pcLabel(p) }))} typing typingHints />
    </WidgetFrame>
  );
}

export function FretboardWidget({ params }: WidgetProps) {
  const word = usePressWord();
  const frets = num(params, "frets", 12);
  const marks = useMemo(() => {
    const out = new Map<string, FretMark>();
    const add = (m: FretMark) => out.set(`${m.string}/${m.fret}`, m);
    for (const name of list<string>(params, "pitchClasses", [])) {
      const p = parsePitchClass(name);
      for (const pos of positionsOfPc(pcOfClass(p), frets)) add({ ...pos, label: pcLabel(p) });
    }
    for (const name of list<string>(params, "highlight", [])) {
      const p = parsePitch(name);
      for (const pos of positionsOf(toMidi(p), frets)) add({ ...pos, label: pcLabel(p) });
    }
    for (const text of list<string>(params, "positions", [])) add({ ...parseFretPos(text) });
    return [...out.values()];
  }, [params, frets]);
  return (
    <WidgetFrame title="Fretboard" hint={`Low E string at the bottom · ${word.press} anywhere to hear it`}>
      <Fretboard frets={frets} marks={marks} labels={str(params, "labels", "open") as "open"} />
    </WidgetFrame>
  );
}

export function StaffWidget({ params }: WidgetProps) {
  const word = usePressWord();
  const notes = useMemo(() => list<string>(params, "notes", []).map(parsePitch), [params]);
  const chord = bool(params, "chord", false);
  const clefParam = str(params, "clef", "treble") as ScoreClef;
  const clef = clefParam === "treble" && notes.length && !params.clef ? clefForNotes(notes) : clefParam;
  const labels = bool(params, "labels", false);
  const key = typeof params.key === "string" ? params.key : undefined;
  const midis = notes.map(toMidi);
  const items = chord ? (notes.length ? [{ pitches: notes, label: labels ? notes.map(pcLabel).join(" ") : undefined }] : []) : notes.map((p) => ({ pitches: [p], label: labels ? pitchLabel(p) : undefined }));
  return (
    <WidgetFrame
      title={clef === "grand" ? "Grand staff" : clef === "bass" ? "Bass clef" : "Treble clef"}
      hint={notes.length ? `${word.Press} a note to hear it` : undefined}
      controls={notes.length ? <PlayButton size={34} onClick={() => (chord ? playChord(midis, { timbre: "piano" }) : midis.forEach((m, i) => playNote(m, { timbre: "piano", delay: i * 0.5 })))} /> : undefined}
    >
      <Score clef={clef} keySig={key} items={items} tone="pc" finalBar={false} onItemClick={(i) => (chord ? playChord(midis, { timbre: "piano" }) : playNote(midis[i], { timbre: "piano" }))} space={11} />
    </WidgetFrame>
  );
}
