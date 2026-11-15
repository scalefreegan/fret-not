import type { ReactNode } from "react";
import { useListen } from "./listen-data.ts";
import { Button, cx } from "./ui.tsx";

// Listen mode's transport: Back, -5s, Start/Pause, +5s, Skip, Stop, shown
// while Listen mode is on, at the foot of the page above the phone's tab
// bar. Buttons only, no keyboard shortcuts: Space and the arrow keys belong
// to the exercises and widgets. What each does is in the provider
// (listen-state.tsx) and, for a lesson's blocks, web/shared/tts/transport.ts.

const STATE_LABEL = { idle: "Listen", loading: "Loading…", playing: "Reading", paused: "Paused" } as const;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

const ICONS = {
  back: (
    <Glyph>
      <rect x="3" y="4" width="2.2" height="12" rx="0.8" />
      <path d="M17 4.6v10.8a.7.7 0 0 1-1.07.6L7.4 10.6a.7.7 0 0 1 0-1.2l8.53-5.4A.7.7 0 0 1 17 4.6z" />
    </Glyph>
  ),
  skip: (
    <Glyph>
      <rect x="14.8" y="4" width="2.2" height="12" rx="0.8" />
      <path d="M3 4.6v10.8a.7.7 0 0 0 1.07.6l8.53-5.4a.7.7 0 0 0 0-1.2L4.07 4A.7.7 0 0 0 3 4.6z" />
    </Glyph>
  ),
  play: (
    <Glyph>
      <path d="M6 3.6v12.8a.7.7 0 0 0 1.07.6l10-6.4a.7.7 0 0 0 0-1.2l-10-6.4A.7.7 0 0 0 6 3.6z" />
    </Glyph>
  ),
  pause: (
    <Glyph>
      <rect x="5" y="4" width="3.4" height="12" rx="1" />
      <rect x="11.6" y="4" width="3.4" height="12" rx="1" />
    </Glyph>
  ),
  stop: (
    <Glyph>
      <rect x="4.5" y="4.5" width="11" height="11" rx="1.6" />
    </Glyph>
  ),
};

export function ListenTransport() {
  const listen = useListen();
  const { transport } = listen;
  const live = transport === "playing" || transport === "paused";
  const icon = (label: string, onClick: () => void, glyph: ReactNode, opts: { disabled?: boolean; className?: string } = {}) => (
    <Button variant="ghost" size="sm" aria-label={label} title={label} disabled={opts.disabled} onClick={onClick} className={cx("min-h-10 min-w-10 text-fg", opts.className)}>
      {glyph}
    </Button>
  );
  const seekButton = (delta: number) => (
    <Button variant="ghost" size="sm" aria-label={delta < 0 ? `Back ${-delta} seconds` : `Forward ${delta} seconds`} title={delta < 0 ? `Back ${-delta} s` : `Forward ${delta} s`} disabled={!live} onClick={() => listen.seek(delta)} className="min-h-10 min-w-10 font-mono text-xs tabular-nums text-fg">
      {delta < 0 ? `−${-delta}s` : `+${delta}s`}
    </Button>
  );

  return (
    <div role="toolbar" aria-label="Listen mode controls" className="z-10 flex shrink-0 items-center justify-center gap-0.5 border-t border-line bg-panel px-2 py-1 sm:gap-1" data-testid="listen-transport">
      <span role="status" className="mr-1 hidden w-20 text-sm font-semibold text-fg-3 sm:inline">
        {STATE_LABEL[transport]}
      </span>
      {icon("Back: the previous passage, or the start of this one", listen.back, ICONS.back)}
      {seekButton(-5)}
      <Button
        variant="primary"
        size="sm"
        aria-label={transport === "playing" || transport === "loading" ? "Pause" : transport === "paused" ? "Resume" : "Start reading"}
        title={transport === "playing" || transport === "loading" ? "Pause" : transport === "paused" ? "Resume" : "Start"}
        disabled={transport === "loading"}
        onClick={transport === "playing" ? listen.pause : listen.play}
        className="mx-1 min-h-10 min-w-12"
      >
        {transport === "playing" || transport === "loading" ? ICONS.pause : ICONS.play}
      </Button>
      {seekButton(5)}
      {icon("Skip to the next passage", listen.skip, ICONS.skip)}
      {icon("Stop", listen.stopAll, ICONS.stop, { className: "ml-1" })}
    </div>
  );
}
