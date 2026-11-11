import { WidgetFrame } from "../../ui.tsx";
import type { Widget, WidgetProps } from "../types.ts";

// PLACEHOLDER — being written by the sound agent. Keep these seven export
// names: ../registry.tsx imports them.
const todo = (name: string): Widget =>
  function Todo(_props: WidgetProps) {
    return <WidgetFrame title={name}>Not built yet.</WidgetFrame>;
  };

export const StringSim = todo("string-sim");
export const HarmonicMixer = todo("harmonic-mixer");
export const FrequencyExplorer = todo("frequency-explorer");
export const Consonance = todo("consonance");
export const TimbreCompare = todo("timbre-compare");
export const Scope = todo("scope");
export const InstrumentAnatomy = todo("instrument-anatomy");
