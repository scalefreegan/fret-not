import { useEffect, useState } from "react";
import type { TutorContext } from "../../shared/wire.ts";
import { Button, cx } from "../ui.tsx";
import ChatPanel from "./ChatPanel.tsx";

export type { TutorContext };

/* The Tutor, docked to the right edge. App.tsx renders
 *   <TutorDrawer context={…} onContentChanged={…} />
 * as the LAST child of a horizontal flex container that fills the viewport
 * height. Closed (the default) it takes no space and shows only a "Tutor"
 * tab fixed at the right edge. Open, on a wide window (≥ 1200px) it is its
 * own 400px column beside the page, so it never covers the lesson; on a
 * narrower window it overlays from the right instead.
 *
 * The panel is hidden rather than unmounted when closed, so a run in
 * progress (and the transcript it holds) survives toggling. Whether it was
 * open is remembered per browser. */

const OPEN_KEY = "fret-not.tutor.open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function contextLine(ctx: TutorContext): string {
  if (ctx.page === "lesson" && ctx.lesson) return `on “${ctx.lesson.title}”`;
  if (ctx.page === "lab") return ctx.lab ? `in the Lab · ${ctx.lab}` : "in the Lab";
  if (ctx.page === "sketchpad") return "in the Sketchpad";
  if (ctx.page === "review") return "in review";
  if (ctx.page === "placement") return "in the placement check";
  return "on your path";
}

export function TutorDrawer({ context, onContentChanged }: { context: TutorContext; onContentChanged?: () => void }) {
  const [open, setOpen] = useState(readOpen);
  // Mount the chat (and fetch its history) only once it has been opened.
  const [everOpen, setEverOpen] = useState(open);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* private mode: not remembered, still works */
    }
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-expanded={false}
          aria-controls="tutor-drawer"
          onClick={() => {
            setEverOpen(true);
            setOpen(true);
          }}
          className="fixed top-1/2 right-0 z-50 flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl border border-r-0 border-accent-edge bg-accent px-2 py-3.5 font-display text-sm font-semibold text-accent-ink shadow-md [writing-mode:vertical-rl] hover:bg-accent-hover"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="rotate-90">
            <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H7l-3.2 2.6a.5.5 0 0 1-.8-.4V11A1.5 1.5 0 0 1 2 9.5z" fill="currentColor" />
          </svg>
          Tutor
        </button>
      )}
      <aside
        id="tutor-drawer"
        aria-label="Tutor"
        hidden={!open}
        className={cx(
          "flex-col border-l border-line bg-panel",
          // Narrow window: an overlay sheet from the right edge.
          "fixed inset-y-0 right-0 z-40 w-full max-w-md shadow-xl",
          // Wide window: a column of its own in the page's flex row.
          "min-[1200px]:static min-[1200px]:z-auto min-[1200px]:h-auto min-[1200px]:w-[400px] min-[1200px]:max-w-none min-[1200px]:shrink-0 min-[1200px]:self-stretch min-[1200px]:shadow-none",
          open ? "flex" : "hidden",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
          <h2 className="font-display text-base font-semibold text-fg">Tutor</h2>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{contextLine(context)}</span>
          <Button variant="ghost" size="sm" aria-label="Close the tutor" className="min-w-9 shrink-0 px-2 text-lg leading-none" onClick={() => setOpen(false)}>
            ×
          </Button>
        </header>
        {everOpen && <ChatPanel context={context} onContentChanged={onContentChanged} />}
      </aside>
    </>
  );
}
