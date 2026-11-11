import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from "react";
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
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-[transform,background-color,box-shadow] select-none disabled:opacity-45",
        size === "sm" ? "px-2.5 py-1 text-sm" : "px-3.5 py-2 text-[0.95rem]",
        variant === "primary" && "bg-accent text-accent-ink shadow-[0_3px_0_var(--accent-edge)] hover:bg-accent-hover active:translate-y-[2px] active:shadow-[0_1px_0_var(--accent-edge)]",
        variant === "quiet" && "bg-raised text-fg hover:bg-line border border-line",
        variant === "ghost" && "text-fg-2 hover:bg-raised",
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
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_3px_0_var(--accent-edge)] hover:bg-accent-hover active:translate-y-[2px] active:shadow-[0_1px_0_var(--accent-edge)]"
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
          className={cx("rounded-md px-2.5 py-1 text-sm font-semibold transition-colors", o.value === value ? "bg-panel text-fg shadow-sm" : "text-fg-3 hover:text-fg")}
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
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-(--accent)" />
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
