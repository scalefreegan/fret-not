import { useEffect, useRef, useState } from "react";
import type { AuthUser, FirstRunReply, LearnerInfo } from "../../shared/wire.ts";
import { useAppData, type LostAnswers } from "../app-data.ts";
import { Button, cx } from "../ui.tsx";

// The header's "who is practising" control, beside Listen: the learner's
// name, and a menu to switch to another of the account's learners, manage
// them (the picker), or log out. Leaving while answers are still on their
// way to the server would lose them, so it asks first.

export interface AccountActions {
  user: AuthUser;
  learner: LearnerInfo;
  learners: LearnerInfo[];
  onSwitchLearner: (id: string) => void;
  onManageLearners: () => void;
  onLogout: () => void;
  /** A switch the server refused, shown in the menu. */
  switchError: string | null;
  /** What the first run could not import from data/, shown once. */
  imported: FirstRunReply["imported"] | null;
  onDismissImported: () => void;
  /** Answers the last learner's queue was closed on, unsaved; shown once. */
  lostAnswers: LostAnswers | null;
  onDismissLostAnswers: () => void;
}

export function ProfileControl({ user, learner, learners, onSwitchLearner, onManageLearners, onLogout, switchError }: AccountActions) {
  const { saver } = useAppData();
  const [menu, setMenu] = useState(false);
  /** The switch error last closed by hand; a new one opens the menu again. */
  const [seen, setSeen] = useState<string | null>(null);
  const open = menu || (switchError !== null && switchError !== seen);
  const setOpen = (on: boolean) => {
    setMenu(on);
    if (!on) setSeen(switchError);
  };
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  /** Run `go` unless answers are unsaved and the learner would rather stay. */
  const leave = (go: () => void) => {
    const unsaved = saver.pending || saver.status === "saving";
    if (unsaved && !window.confirm(`${learner.name} has answers that are not saved yet. Leave anyway and lose them?`)) return;
    setOpen(false);
    go();
  };
  const others = learners.filter((l) => l.id !== learner.id);
  const item = "flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-sm font-semibold text-fg hover:bg-raised pointer-coarse:min-h-11";

  return (
    <div ref={box} className="relative">
      <Button size="sm" aria-haspopup="menu" aria-expanded={open} aria-label={`Learner: ${learner.name}. Switch learner or log out`} onClick={() => setOpen(!open)} data-testid="profile-control">
        <span className="max-w-[9rem] truncate">{learner.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={cx("transition-transform", open && "rotate-180")}>
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-2 w-64 rounded-xl border border-line-strong bg-panel p-2 shadow-lg">
          <p className="px-2.5 pt-1 pb-2 text-xs text-fg-3">
            Logged in as <span className="font-semibold text-fg-2">{user.username}</span>
            {user.isAdmin && " (admin)"}
          </p>
          {switchError && (
            <p role="alert" className="mx-1 mb-2 rounded-lg border border-bad bg-bad-soft px-2.5 py-1.5 text-sm text-fg">
              {switchError}
            </p>
          )}
          {others.length > 0 && (
            <div className="border-t border-line pt-1">
              <p className="px-2.5 py-1 text-xs font-bold tracking-wide text-fg-3 uppercase">Switch to</p>
              {others.map((l) => (
                <button key={l.id} type="button" role="menuitem" className={item} onClick={() => leave(() => onSwitchLearner(l.id))}>
                  {l.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 border-t border-line pt-1">
            <button type="button" role="menuitem" className={item} onClick={() => leave(onManageLearners)}>
              Manage learners…
            </button>
            <button type="button" role="menuitem" className={cx(item, "text-fg-2")} onClick={() => leave(onLogout)}>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
