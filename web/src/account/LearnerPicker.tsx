import { useState, type FormEvent } from "react";
import type { LearnerInfo, MeReply } from "../../shared/wire.ts";
import { archiveLearner, createLearner, renameLearner } from "../api/auth.ts";
import { Button, Card, inputClass } from "../ui.tsx";

// "Who's practising?": after login whenever the session has no learner, and
// from the header's profile menu to add, rename or archive one. Learners
// have no password; each has its own progress, Listen settings and tutor
// chat. An account the CLI made starts with none, so this opens on Add.

export function LearnerPicker({
  me,
  error,
  onPick,
  onChanged,
  onCancel,
  onLogout,
}: {
  me: MeReply;
  error: string | null;
  onPick: (id: string) => void;
  /** A learner was added, renamed or archived: re-read the list. */
  onChanged: () => Promise<void>;
  /** Back to the app without changing learner (only when one is active). */
  onCancel?: () => void;
  onLogout: () => void;
}) {
  const [adding, setAdding] = useState(me.learners.length === 0);
  const [message, setMessage] = useState<string | null>(null);

  async function act(run: () => Promise<unknown>) {
    try {
      await run();
      setMessage(null);
      await onChanged();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const archive = (l: LearnerInfo) => {
    if (window.confirm(`Archive ${l.name}? They leave this list; their progress is kept.`)) void act(() => archiveLearner(l.id));
  };
  const rename = (l: LearnerInfo) => {
    const name = window.prompt(`A new name for ${l.name}`, l.name);
    if (name?.trim() && name.trim() !== l.name) void act(() => renameLearner(l.id, name));
  };

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-ground p-4 pt-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/favicon.svg" alt="" className="h-12 w-12 rounded-xl" />
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Who's practising?</h1>
        <p className="text-sm text-fg-3">
          Logged in as {me.user?.username}.{" "}
          <button type="button" className="underline hover:text-fg-2" onClick={onLogout}>
            Log out
          </button>
          {onCancel && (
            <>
              {" · "}
              <button type="button" className="underline hover:text-fg-2" onClick={onCancel}>
                Back
              </button>
            </>
          )}
        </p>
      </div>
      {(error || message) && (
        <p role="alert" className="text-sm text-bad">
          {message ?? error}
        </p>
      )}
      <ul className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2" data-testid="learner-list">
        {me.learners.map((l) => (
          <li key={l.id}>
            <Card className="flex h-full flex-col gap-2 p-4">
              <button type="button" className="flex min-h-11 items-center gap-2 text-left font-display text-xl font-semibold text-fg hover:text-accent-hover" onClick={() => onPick(l.id)} data-testid={`pick-${l.name}`}>
                {l.name}
                {me.learner?.id === l.id && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-fg">Now</span>}
              </button>
              <div className="mt-auto flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => rename(l)}>
                  Rename
                </Button>
                <Button variant="ghost" size="sm" className="hover:text-bad" onClick={() => archive(l)}>
                  Archive
                </Button>
              </div>
            </Card>
          </li>
        ))}
        <li>
          {adding ? (
            <AddLearner
              onCancel={me.learners.length ? () => setAdding(false) : undefined}
              onAdded={async (l) => {
                setAdding(false);
                await onChanged();
                onPick(l.id);
              }}
            />
          ) : (
            <button
              type="button"
              className="flex h-full min-h-24 w-full items-center justify-center rounded-2xl border border-dashed border-line-strong font-semibold text-fg-2 hover:bg-raised hover:text-fg"
              onClick={() => setAdding(true)}
              data-testid="add-learner"
            >
              + Add a learner
            </button>
          )}
        </li>
      </ul>
    </main>
  );
}

function AddLearner({ onAdded, onCancel }: { onAdded: (l: LearnerInfo) => void | Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { learner } = await createLearner(name);
      await onAdded(learner);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} data-testid="add-learner-form">
        <label className="flex flex-col gap-1 text-sm font-medium text-fg-2">
          Name
          <input className={inputClass} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add"}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
