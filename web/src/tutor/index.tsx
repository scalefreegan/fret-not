import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TutorContext } from "../../shared/wire.ts";
import { Button, cx } from "../ui.tsx";
import ChatPanel from "./ChatPanel.tsx";

export type { TutorContext };

/* The Tutor. App.tsx renders
 *   <TutorDrawer context={…} onContentChanged={…} />
 * as the LAST child of a horizontal flex container that fills the viewport
 * height. Closed (the default) it takes no space and shows only a "Tutor"
 * button at the right end of the header, at every width: the header is the
 * one place that never has an instrument or an exercise under it. Open, on
 * a wide window (≥ 1200px) it is its own 400px column beside the page, so it
 * never covers the lesson; on a narrower window it overlays from the right
 * instead; on a phone it is a full-screen sheet. Wherever it overlays, it
 * follows the visual viewport, so the on-screen keyboard pushes the message
 * box up instead of covering it.
 *
 * The panel is hidden rather than unmounted when closed, so a run in
 * progress (and the transcript it holds) survives toggling. Whether it was
 * open is remembered per browser, except on a phone, where a sheet over the
 * whole screen is never what a fresh page load should show. */

const OPEN_KEY = "fret-not.tutor.open";
const PHONE = "(max-width: 639.9px)";
/** Below this the drawer lies over the page; from here up it is a column. */
const OVERLAY = "(max-width: 1199.9px)";

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1" && !matches(PHONE);
  } catch {
    return false;
  }
}

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, [query]);
  return on;
}

/** An overlaid drawer must fit the part of the screen the on-screen keyboard
 *  leaves visible. iOS does not shrink a fixed element for the keyboard, so
 *  the drawer takes its top and height from the visual viewport. */
function useSheetBox(active: boolean): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties | undefined>(undefined);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return setBox(undefined);
    const on = () => setBox({ top: vv.offsetTop, height: vv.height, bottom: "auto" });
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, [active]);
  return box;
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
  const phone = useMedia(PHONE);
  const overlay = useMedia(OVERLAY);
  const sheetBox = useSheetBox(open && overlay);
  const panel = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  /** True once the learner has opened or closed it by hand: only then does
   *  the focus follow (a drawer restored open on load must not grab it). */
  const moved = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* private mode: not remembered, still works */
    }
  }, [open]);

  // Focus goes into the drawer when it opens and back to the button when it
  // closes, so a keyboard or screen-reader user is never left behind it.
  useEffect(() => {
    if (!moved.current) return;
    const t = window.setTimeout(() => {
      if (open) (panel.current?.querySelector<HTMLElement>("textarea:not([disabled])") ?? panel.current)?.focus({ preventScroll: true });
      else opener.current?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // As a full-screen sheet it is a modal dialog: the page underneath is
  // taken out of the tab order and away from assistive technology.
  const modal = open && phone;
  useEffect(() => {
    const page = document.getElementById("app-page");
    if (!page || !modal) return;
    page.setAttribute("inert", "");
    return () => page.removeAttribute("inert");
  }, [modal]);

  const close = () => {
    moved.current = true;
    setOpen(false);
  };

  return (
    <>
      {!open && (
        <button
          ref={opener}
          type="button"
          aria-expanded={false}
          aria-controls="tutor-drawer"
          onClick={() => {
            moved.current = true;
            setEverOpen(true);
            setOpen(true);
          }}
          // A pill in the right end of the header, which the header keeps
          // empty for it. Never over the page: an edge tab half way down
          // sat on the frets and keys of whatever was being answered.
          className="fixed top-[calc(env(safe-area-inset-top)+0.375rem)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex min-h-11 items-center gap-1.5 rounded-full border border-accent-edge bg-accent px-4 font-display text-sm font-semibold text-accent-ink shadow-md hover:bg-accent-hover sm:right-[calc(env(safe-area-inset-right)+1.25rem)]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H7l-3.2 2.6a.5.5 0 0 1-.8-.4V11A1.5 1.5 0 0 1 2 9.5z" fill="currentColor" />
          </svg>
          Tutor
        </button>
      )}
      <aside
        ref={panel}
        id="tutor-drawer"
        aria-label="Tutor"
        role={modal ? "dialog" : undefined}
        aria-modal={modal ? true : undefined}
        tabIndex={-1}
        hidden={!open}
        style={sheetBox}
        onKeyDownCapture={(e) => {
          // Escape closes it from anywhere inside (captured: the message
          // box keeps its own key presses from reaching the page).
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
        className={cx(
          "flex-col bg-panel outline-none",
          // Phone: a full-screen sheet, clear of the notch and home indicator.
          "fixed inset-0 z-40 w-full pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-xl",
          // Tablet or small window: an overlay from the right edge. It still
          // keeps clear of the notch (a phone on its side) on the three
          // sides it touches.
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:max-w-md sm:border-l sm:border-line sm:pl-0",
          // Wide window: a column of its own in the page's flex row.
          "min-[1200px]:static min-[1200px]:z-auto min-[1200px]:h-auto min-[1200px]:w-[400px] min-[1200px]:max-w-none min-[1200px]:shrink-0 min-[1200px]:self-stretch min-[1200px]:p-0 min-[1200px]:shadow-none",
          open ? "flex" : "hidden",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
          <h2 className="font-display text-base font-semibold text-fg">Tutor</h2>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{contextLine(context)}</span>
          <Button variant="ghost" size="sm" aria-label="Close the tutor" className="min-w-9 shrink-0 px-2 text-xl leading-none" onClick={close}>
            ×
          </Button>
        </header>
        {everOpen && <ChatPanel context={context} onContentChanged={onContentChanged} />}
      </aside>
    </>
  );
}
