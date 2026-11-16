import { useCallback, useEffect, useState } from "react";
import type { FirstRunReply, MeReply } from "../../shared/wire.ts";
import App from "../App.tsx";
import { ANSWERS_LOST_EVENT, type LostAnswers } from "../app-data.ts";
import { getMe, logout, pickLearner } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { STALE_LEARNER_EVENT, UNAUTHORIZED_EVENT } from "../api/client.ts";
import { AccountScreen } from "./AccountScreen.tsx";
import { LearnerPicker } from "./LearnerPicker.tsx";

// Who is using the app, before anything else (docs/DATA.md §Accounts):
//
//   no accounts at all  → "Create the first account" (the admin)
//   not logged in       → the login form
//   no learner picked   → "Who's practising?"
//   otherwise           → the app, as that learner
//
// The server holds all of it (an httpOnly cookie and the session row); this
// only asks /api/auth/me and redraws. Any 401 from any call fires
// UNAUTHORIZED_EVENT and any 409 `stale_learner` (another tab switched
// learner, or logged in as someone else) fires STALE_LEARNER_EVENT
// (src/api/client.ts); both re-ask. The app is keyed by user and learner, so
// a switch remounts it: nothing of one learner's progress, chat or answers
// in flight is shown as another's.

export function AuthGate() {
  const [me, setMeState] = useState<MeReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The picker opened from the app (to add, rename or archive). */
  const [picking, setPicking] = useState(false);
  /** A switch that failed, shown where it was asked for. */
  const [switchError, setSwitchError] = useState<string | null>(null);
  /** What the first run could not import, until dismissed. */
  const [imported, setImported] = useState<FirstRunReply["imported"] | null>(null);
  /** Answers lost when the app last let go of a learner, until dismissed. */
  const [lostAnswers, setLostAnswers] = useState<LostAnswers | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<LostAnswers>).detail;
      setLostAnswers((was) => ({ answers: (was?.answers ?? 0) + d.answers, lesson: (was?.lesson ?? false) || d.lesson }));
    };
    window.addEventListener(ANSWERS_LOST_EVENT, on);
    return () => window.removeEventListener(ANSWERS_LOST_EVENT, on);
  }, []);

  /** What the page shows. The app it renders names its own learner on
   *  every call (src/api/client.ts), so nothing global changes here. */
  const setMe = useCallback((m: MeReply) => setMeState(m), []);

  const refresh = useCallback(async () => {
    try {
      setMe(await getMe());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [setMe]);

  useEffect(() => {
    // The first ask; every later one comes from an action, a 401 or a 409.
    getMe().then(setMe, (e: Error) => setError(e.message));
    const again = () => void refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, again);
    window.addEventListener(STALE_LEARNER_EVENT, again);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, again);
      window.removeEventListener(STALE_LEARNER_EVENT, again);
    };
  }, [refresh, setMe]);

  async function signOut() {
    setSwitchError(null);
    try {
      await logout();
    } catch (e) {
      // Already logged out (401): the refresh below shows the login form.
      // Anything else (offline, the server down) means the session may well
      // still be live, so say so rather than pretend.
      if (!(e instanceof ApiError && e.status === 401)) {
        setSwitchError(`Could not log out: ${(e as Error).message}`);
        return;
      }
    }
    setPicking(false);
    setImported(null);
    await refresh();
  }

  /** A refused switch (a learner another tab just archived, say) says so
   *  and re-reads the list. */
  async function choose(id: string | null) {
    setSwitchError(null);
    try {
      setMe(await pickLearner(id));
      setPicking(false);
    } catch (e) {
      setSwitchError((e as Error).message);
      await refresh();
    }
  }

  if (error && !me) {
    return (
      <p className="p-6 text-fg-2">
        Could not reach the server: {error}{" "}
        <button type="button" className="underline" onClick={() => void refresh()}>
          Try again
        </button>
      </p>
    );
  }
  if (!me) return <p className="p-6 text-fg-3">Loading…</p>;
  if (me.firstRun && !me.firstRunHere) {
    return (
      <p className="mx-auto max-w-xl p-6 text-fg-2" data-testid="first-run-remote">
        No one has an account yet. Create the first account on the Mac that runs Fret Not (open http://localhost:38600 there), then log in here.
      </p>
    );
  }
  if (me.firstRun) {
    return (
      <AccountScreen
        kind="first-run"
        onDone={(m) => {
          const report = "imported" in m ? m.imported : null;
          if (report && (report.problems.length || report.backupId)) setImported(report);
          setMe(m);
        }}
      />
    );
  }
  if (!me.user) return <AccountScreen kind="login" onDone={setMe} />;
  if (!me.learner || picking) {
    return (
      <LearnerPicker
        me={me}
        error={switchError ?? error}
        onPick={(id) => void choose(id)}
        onChanged={refresh}
        onCancel={me.learner ? () => setPicking(false) : undefined}
        onLogout={() => void signOut()}
      />
    );
  }
  return (
    <App
      key={`${me.user.id}:${me.learner.id}`}
      account={{
        user: me.user,
        learner: me.learner,
        learners: me.learners,
        onSwitchLearner: (id) => void choose(id),
        onManageLearners: () => setPicking(true),
        onLogout: () => void signOut(),
        switchError,
        imported,
        onDismissImported: () => setImported(null),
        lostAnswers,
        onDismissLostAnswers: () => setLostAnswers(null),
      }}
    />
  );
}
