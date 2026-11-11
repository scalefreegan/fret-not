import { WidgetFrame } from "../ui.tsx";
import { Consonance, FrequencyExplorer, HarmonicMixer, InstrumentAnatomy, Scope, StringSim, TimbreCompare } from "./sound/index.tsx";
import type { Widget, WidgetProps } from "./types.ts";
import * as N from "./notation/index.tsx";

// Widget type (as written in a lesson's ```widget block) → component. The
// names and parameters are declared in web/shared/registry.ts; a type listed
// there but missing here renders a visible placeholder rather than nothing.
export const WIDGET_COMPONENTS: Record<string, Widget> = {
  "string-sim": StringSim,
  "harmonic-mixer": HarmonicMixer,
  "frequency-explorer": FrequencyExplorer,
  consonance: Consonance,
  "timbre-compare": TimbreCompare,
  scope: Scope,
  "instrument-anatomy": InstrumentAnatomy,
  ...N.NOTATION_WIDGETS,
};

export function RenderWidget({ type, params }: { type: string } & WidgetProps) {
  const C = WIDGET_COMPONENTS[type];
  if (!C) return <WidgetFrame title={type}>This widget is not built yet.</WidgetFrame>;
  return <C params={params} />;
}

/** Example parameters for every widget: the dev gallery (#/gallery) renders
 *  these, and they double as a smoke test that each widget mounts. */
export const WIDGET_EXAMPLES: Record<string, Record<string, unknown>[]> = {
  "string-sim": [{}, { mode: "pluck" }, { mode: "strike" }],
  "harmonic-mixer": [{}, { preset: "guitar", partials: 10 }],
  "frequency-explorer": [{}, { loudness: true }],
  consonance: [{}],
  "timbre-compare": [{}],
  scope: [{}],
  "instrument-anatomy": [{ instrument: "piano" }, { instrument: "guitar" }],
  keyboard: [{}, { range: ["C4", "C5"], highlight: ["C4", "E4", "G4"], labels: "all" }],
  fretboard: [{}, { frets: 5, positions: ["6/3", "5/2", "4/0"], labels: "all" }, { pitchClasses: ["E"], labels: "none" }],
  staff: [{ notes: ["E4", "G4", "B4", "D5", "F5"], labels: true }, { clef: "bass", notes: ["G2", "B2", "D3"], chord: true }, { clef: "grand", notes: ["C3", "C4", "C5"], key: "A" }, { key: "Eb", notes: ["Eb4", "F#4"] }],
  linked: [{ notes: ["C4"] }, { notes: ["E3", "G#3", "B3"], chord: true, views: ["staff", "keyboard", "fretboard", "tab"] }],
  interval: [{ from: "C4", to: "G4" }],
  scale: [{ tonic: "C", scale: "major" }, { tonic: "A", scale: "minor-pentatonic", views: ["staff", "fretboard", "tab"], interactive: true }],
  chord: [{ symbol: "C" }, { symbol: "Am", views: ["staff", "keyboard", "fretboard", "diagram"], interactive: true }],
  "chord-diagram": [{ chords: ["Em", "Am", "C", "G", "D", "F"] }],
  "circle-of-fifths": [{}],
  metronome: [{}],
  rhythm: [{ pattern: "q q e e q | h qr q" }, { pattern: "q. e q q | e e e e h", tap: true }],
  melody: [{ title: "Ode to Joy (Beethoven)", notes: "E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:e D4:h" }],
  tab: [{ notes: "6/0:q 6/3:q 5/0:q 5/2:q | 4/0:q 4/2:q 3/0:h" }],
  progression: [{ chords: "I V vi IV", key: "C" }, { chords: "Em C G D", instrument: "guitar", views: ["diagram", "fretboard"] }],
};
