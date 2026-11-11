import { useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type Ref } from "react";
import { pc } from "../shared/music/notes.ts";

// Small shared pieces. Widgets and pages build from these so controls look
// and behave the same everywhere. Colours come from the tokens in index.css;
// nothing here writes a raw hex or a dark: variant.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The colour of a pitch class (accepts a MIDI note or 0–11). */
export function pcColor(midiOrPc: number): string {
  return `var(--pc-${pc(midiOrPc)})`;
}
export function pcStyle(midiOrPc: number): CSSProperties {
  return { background: pcColor(midiOrPc), color: "var(--pc-ink)" };
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "ghost"; size?: "sm" | "md"; ref?: Ref<HTMLButtonElement> };

/** primary: the one main action in view (sits on a pressed edge). quiet:
 *  secondary actions. ghost: tertiary, text only. */
export function Button({ variant = "quiet", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        // A finger needs 44px; a mouse does not.
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-[transform,background-color,box-shadow] select-none disabled:opacity-45 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        size === "sm" ? "px-2.5 py-1 text-sm" : "px-3.5 py-2 text-[0.95rem]",
        variant === "primary" && "bg-accent text-accent-ink shadow-[0_3px_0_var(--accent-edge)] hover:bg-accent-hover active:translate-y-[2px] active:shadow-[0_1px_0_var(--accent-edge)]",
        variant === "quiet" && "bg-raised text-fg hover:bg-line active:bg-line border border-line",
        variant === "ghost" && "text-fg-2 hover:bg-raised active:bg-raised",
        className,
      )}
    />
  );
}

/** A round play/stop button. */
export function PlayButton({ playing, onClick, label = "Play", size = 40 }: { playing?: boolean; onClick: () => void; label?: string; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? "Stop" : label}
      title={playing ? "Stop" : label}
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_3px_0_var(--accent-edge)] pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:bg-accent-hover active:translate-y-[2px] active:shadow-[0_1px_0_var(--accent-edge)]"
    >
      <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 16 16" aria-hidden="true">
        {playing ? <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" /> : <path d="M4 2.5v11a.6.6 0 0 0 .92.5l8.6-5.5a.6.6 0 0 0 0-1L4.92 2A.6.6 0 0 0 4 2.5z" fill="currentColor" />}
      </svg>
    </button>
  );
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("rounded-md px-2.5 py-1 text-sm font-semibold transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3", o.value === value ? "bg-panel text-fg shadow-sm" : "text-fg-3 hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled range slider with its value shown. */
export function Slider({ label, value, min, max, step = 1, onChange, format, className }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; className?: string }) {
  return (
    <label className={cx("flex items-center gap-2 text-sm text-fg-2", className)}>
      <span className="shrink-0 font-medium">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-(--accent) pointer-coarse:h-11" />
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-fg">{format ? format(value) : value}</span>
    </label>
  );
}

/** The frame every widget sits in: a panel with an optional title, the
 *  interactive area, and an optional row of controls underneath. */
export function WidgetFrame({ title, hint, controls, children, className }: { title?: ReactNode; hint?: ReactNode; controls?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cx("@container my-5 overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_1px_0_var(--line)]", className)}>
      {(title || hint) && (
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
          {title && <span className="font-display text-[1.02rem] font-semibold text-fg">{title}</span>}
          {hint && <span className="text-sm text-fg-3">{hint}</span>}
        </figcaption>
      )}
      <div className="px-4 py-4">{children}</div>
      {controls && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-raised/50 px-4 py-2.5">{controls}</div>}
    </figure>
  );
}

/** A small rounded tag in a pitch class's colour, e.g. a note name. */
export function NoteChip({ midi, children, className }: { midi: number; children: ReactNode; className?: string }) {
  return (
    <span style={pcStyle(midi)} className={cx("inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold", className)}>
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-panel", className)}>{children}</div>;
}

/** The same reference for as long as the value serialises the same. Content
 *  is re-read from disk after every tutor commit, so every lesson object is
 *  new even when nothing in it changed; anything keyed on identity (a batch
 *  of generated questions, a widget's params) would restart under the learner. */
export function useStable<T>(value: T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  const key = JSON.stringify(value) ?? "";
  if (!ref.current || ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

/** A batch that stays as it was made until `key` changes, whatever happens
 *  to `source` meanwhile. A tutor commit that edits the exercises of the
 *  lesson being practised must not throw away a half-finished batch: the
 *  learner finishes the questions they started, `stale` says the source has
 *  moved on, and the next batch (a new key) is made from the new source. */
export function useFrozen<S, T>(key: string, source: S, make: (source: S) => T): { value: T; stale: boolean } {
  const [held, setHeld] = useState(() => ({ key, source, value: make(source) }));
  let cur = held;
  if (held.key !== key) {
    cur = { key, source, value: make(source) };
    setHeld(cur);
  }
  return { value: cur.value, stale: cur.source !== source };
}

/** True on a device whose main pointer is a finger (phone, tablet). */
export { useCoarse as useCoarsePointer } from "./widgets/touch.ts";

/** Shown while a batch is being finished after the lesson changed on disk. */
export function UpdatedNotice({ className }: { className?: string }) {
  return (
    <p role="status" className={cx("rounded-lg border border-warn bg-warn-soft px-4 py-2 text-sm text-fg", className)}>
      These exercises were updated while you were practising. You are finishing the questions you started; the new version comes with your next batch.
    </p>
  );
}

type Save = { ok: true; dropped: number; lessonDropped: boolean; recovered: boolean } | { ok: false; error: string } | "saving" | null;

/** What became of saving a batch of answers: nothing while it worked, and a
 *  plain statement of anything the server did not keep. A save that failed
 *  is announced once, by the shell (UnsavedBanner, on every page, with the
 *  retry); here it only says where to look. Typed loosely so ui.tsx does not
 *  import state. */
export function SaveNotice({ save, className }: { save: Save; className?: string }) {
  if (save === null) return null;
  if (save === "saving") return <p role="status" className={cx("text-sm text-fg-3", className)}>Saving your answers…</p>;
  if (!save.ok) return <p role="status" className={cx("text-sm font-semibold text-bad", className)}>Not saved yet: see the notice at the top of the page.</p>;
  const notes: string[] = [];
  if (save.dropped > 0) notes.push(`${save.dropped === 1 ? "One answer was" : `${save.dropped} answers were`} not recorded: the curriculum on disk does not currently list the idea ${save.dropped === 1 ? "it tests" : "they test"}. The rest are saved.`);
  if (save.lessonDropped) notes.push("Your answers are saved, but this lesson could not be marked as done: the curriculum on disk does not currently list it (its file may be broken or renamed). It will still show as not done on the path.");
  if (notes.length === 0) return null;
  return (
    <div role="alert" className={cx("flex flex-col gap-1.5 rounded-lg border border-warn bg-warn-soft px-4 py-3 text-fg", className)}>
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

/** Answers that have not reached the server, on whatever page the learner
 *  is now: how many, why, and the way to send them again. */
export function UnsavedBanner({ count, lesson, error, onRetry }: { count: number; lesson: boolean; error: string | null; onRetry: () => void }) {
  const what = count > 0 ? (count === 1 ? "One answer is" : `${count} answers are`) : lesson ? "A finished lesson is" : "Your last answers are";
  return (
    <div role="alert" className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-bad bg-bad-soft px-4 py-2.5 text-fg sm:px-5">
      <p className="min-w-0 flex-1 basis-64">
        <strong>{what} not saved yet.</strong> {(error ?? "The save did not get through").replace(/\.$/, "")}. Nothing is lost while this page stays open: try again before you close or reload it.
      </p>
      <Button size="sm" variant="primary" onClick={onRetry}>Try saving again</Button>
    </div>
  );
}
