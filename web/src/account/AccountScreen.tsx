import { useState, type FormEvent } from "react";
import type { MeReply } from "../../shared/wire.ts";
import { createFirstAccount, login } from "../api/auth.ts";
import { Button, Card, inputClass } from "../ui.tsx";

// The two screens before a session exists: the login form, and, only while
// there are no accounts at all, "Create the first account", which makes the
// admin. That is the one sign-up the app has; everyone after is added with
// `npm run user -- add <name>` (docs/DATA.md §Accounts).

const label = "flex flex-col gap-1 text-sm font-medium text-fg-2";

export function AccountScreen({ kind, onDone }: { kind: "login" | "first-run"; onDone: (me: MeReply) => void }) {
  const first = kind === "first-run";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [learnerName, setLearnerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (first && password !== again) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(first ? await createFirstAccount(username, password, learnerName) : await login(username, password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ground p-4">
      <Card className="flex w-full max-w-sm flex-col gap-5 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/favicon.svg" alt="" className="h-12 w-12 rounded-xl" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">{first ? "Create the first account" : "Fret Not"}</h1>
          {first ? (
            <p className="text-sm text-fg-2">
              No one has an account yet. This one is the admin: its tutor can write lessons, and its first learner starts with the progress, Listen settings and tutor chat this copy of Fret Not has now. Add other people later with{" "}
              <code className="font-mono text-xs">npm run user -- add</code>.
            </p>
          ) : (
            <p className="text-sm text-fg-2">Log in to practise.</p>
          )}
        </div>
        <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} data-testid={first ? "first-run-form" : "login-form"}>
          <label className={label}>
            Username
            <input className={inputClass} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </label>
          <label className={label}>
            Password
            <input
              className={inputClass}
              name="password"
              type="password"
              autoComplete={first ? "new-password" : "current-password"}
              required
              minLength={first ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {first && (
            <>
              <label className={label}>
                Password again
                <input className={inputClass} name="password-again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
              </label>
              <label className={label}>
                Learner's name
                <input className={inputClass} name="learner" maxLength={80} placeholder={username || "the username"} value={learnerName} onChange={(e) => setLearnerName(e.target.value)} />
              </label>
            </>
          )}
          {error && (
            <p className="text-sm text-bad" role="alert" data-testid="account-error">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? (first ? "Creating…" : "Logging in…") : first ? "Create account" : "Log in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
