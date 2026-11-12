import type { Widget, WidgetProps } from "../types.ts";
import { GUITAR_SHAPES } from "../../../shared/music/instruments.ts";
import { WidgetFrame } from "../../ui.tsx";
import { list } from "../params.ts";
import { ChordBox } from "./ChordBox.tsx";
import { usePressWord } from "../touch.ts";
import { CircleOfFifthsWidget } from "./Circle.tsx";
import { ChordWidget, IntervalWidget, LinkedWidget, ScaleWidget } from "./Linked.tsx";
import { FretboardWidget, KeyboardWidget, StaffWidget } from "./Simple.tsx";
import { MelodyWidget, MetronomeWidget, ProgressionWidget, RhythmWidget, TabWidget } from "./Time.tsx";

function ChordDiagramWidget({ params }: WidgetProps) {
  const word = usePressWord();
  const chords = list<string>(params, "chords", []).filter((c) => GUITAR_SHAPES[c]);
  return (
    <WidgetFrame title="Chord boxes" hint={`${word.Press} a box to strum it · numbers are fingers (1 = index) · ○ open string · × not played`}>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-2">
        {chords.map((c) => (
          <ChordBox key={c} symbol={c} />
        ))}
      </div>
    </WidgetFrame>
  );
}

// The notation and instrument widgets, keyed by widget type.
export const NOTATION_WIDGETS: Record<string, Widget> = {
  keyboard: KeyboardWidget,
  fretboard: FretboardWidget,
  staff: StaffWidget,
  linked: LinkedWidget,
  interval: IntervalWidget,
  scale: ScaleWidget,
  chord: ChordWidget,
  "chord-diagram": ChordDiagramWidget,
  "circle-of-fifths": CircleOfFifthsWidget,
  metronome: MetronomeWidget,
  rhythm: RhythmWidget,
  melody: MelodyWidget,
  tab: TabWidget,
  progression: ProgressionWidget,
};
