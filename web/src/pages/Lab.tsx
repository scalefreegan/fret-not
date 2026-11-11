import { href } from "../router.ts";
import { cx } from "../ui.tsx";
import { RenderWidget } from "../widgets/registry.tsx";

// The Lab: every explorer, open, in no order, with nothing scored.

interface Tool {
  id: string;
  title: string;
  blurb: string;
  widgets: { type: string; params: Record<string, unknown>; note?: string }[];
}

const TOOLS: Tool[] = [
  {
    id: "sound",
    title: "Sound",
    blurb: "What a note is made of.",
    widgets: [
      { type: "string-sim", params: { mode: "harmonics", modes: 8 }, note: "A string vibrates in whole-number patterns. Switch them on and off." },
      { type: "string-sim", params: { mode: "pluck" }, note: "Where you pluck decides which patterns join in." },
      { type: "harmonic-mixer", params: { partials: 12 }, note: "Build a tone colour from its harmonics." },
      { type: "frequency-explorer", params: { loudness: true } },
      { type: "consonance", params: {} },
      { type: "timbre-compare", params: { sources: ["sine", "piano", "guitar", "saw"] } },
      { type: "scope", params: {} },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    blurb: "One note, everywhere it lives.",
    widgets: [
      { type: "linked", params: { notes: ["C4"], views: ["staff", "keyboard", "fretboard", "tab"] }, note: "Press any key, fret or staff line. The same note lights up on every view." },
      { type: "interval", params: { from: "C4", to: "G4", views: ["staff", "keyboard"] } },
    ],
  },
  {
    id: "scales",
    title: "Scales and chords",
    blurb: "Build them, hear them, see their shapes.",
    widgets: [
      { type: "scale", params: { tonic: "C", scale: "major", views: ["staff", "keyboard", "fretboard"], interactive: true } },
      { type: "chord", params: { symbol: "C", views: ["staff", "keyboard", "fretboard", "diagram"], interactive: true } },
      { type: "circle-of-fifths", params: {} },
      { type: "chord-diagram", params: { chords: ["E", "A", "D", "G", "C", "Em", "Am", "Dm", "F", "B7"] } },
      { type: "progression", params: { chords: "I V vi IV", key: "C", views: ["keyboard", "diagram"] } },
    ],
  },
  {
    id: "rhythm",
    title: "Rhythm",
    blurb: "Pulse, bars and tapping in time.",
    widgets: [
      { type: "metronome", params: {} },
      { type: "rhythm", params: { pattern: "q q e e q | h q q", tap: true } },
      { type: "rhythm", params: { pattern: "q. e q q | e e e e h", tap: true } },
      { type: "rhythm", params: { pattern: "q q q | h. | e e q q | h qr", time: "3/4", tap: true } },
    ],
  },
  {
    id: "instruments",
    title: "Instruments",
    blurb: "How the piano and the guitar make their sound.",
    widgets: [
      { type: "instrument-anatomy", params: { instrument: "piano" } },
      { type: "keyboard", params: { range: ["C2", "C6"], labels: "c" } },
      { type: "instrument-anatomy", params: { instrument: "guitar" } },
      { type: "fretboard", params: { frets: 15, labels: "naturals" } },
    ],
  },
];

export const LAB_TOOL_IDS = TOOLS.map((t) => t.id);

export function LabPage({ tool }: { tool?: string }) {
  const current = TOOLS.find((t) => t.id === tool) ?? TOOLS[0];
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-24 sm:px-5 sm:pt-8">
      <h1 className="text-3xl font-bold text-fg sm:text-4xl">Lab</h1>
      <p className="mt-1 text-fg-2">Everything here is open and nothing is scored. Poke at it.</p>
      <nav className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Lab tools">
        {TOOLS.map((t) => (
          <a key={t.id} href={href("lab", t.id)} aria-current={t.id === current.id ? "page" : undefined} className={cx("rounded-xl border-2 px-3.5 py-2 transition-colors", t.id === current.id ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-strong active:border-line-strong")}>
            <span className="block font-display text-lg leading-tight font-bold text-fg">{t.title}</span>
            <span className="block text-sm text-fg-3">{t.blurb}</span>
          </a>
        ))}
      </nav>
      <div className="mt-4" key={current.id}>
        {current.widgets.map((w, i) => (
          <section key={i}>
            {w.note && <p className="mt-6 -mb-2 text-fg-2">{w.note}</p>}
            <RenderWidget type={w.type} params={w.params} />
          </section>
        ))}
      </div>
    </div>
  );
}
