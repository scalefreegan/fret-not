import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ChatCommit, ChatMessage, SettingsReply, TutorContext } from "../../shared/wire.ts";
import { Button } from "../ui.tsx";
import { clearChatHistory, getChatHistory, getSettings, sendChat, setModel } from "./api.ts";
import { startersFor } from "./starters.ts";

/* The tutor's chat (Lingo Dojo's ChatPanel, adapted): the transcript from
 * the server, an input that sends on Enter, an elapsed counter while the
 * headless CLI works (it buffers the whole turn, so there is nothing to
 * stream before the reply), the model picker, and the commit line the server
 * reports after a turn that edited content/. A commit means the curriculum
 * changed, so the panel asks App to refetch it straight away. */

const inputClass =
  // 16px on a touch screen: iOS zooms the page when a smaller field takes focus.
  "w-full rounded-xl border border-line-strong bg-panel px-3 py-1.5 text-sm text-fg pointer-coarse:text-base placeholder:text-fg-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft disabled:opacity-60";

/** A deliberately small markdown subset — replies are prose, not documents. */
function inline(s: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${keyBase}b${i}`} className="font-semibold text-fg">{m[1]}</strong>);
    else if (m[2]) out.push(<code key={`${keyBase}c${i}`} className="rounded bg-raised px-1 font-mono text-[0.85em]">{m[2]}</code>);
    else if (m[3]) out.push(<em key={`${keyBase}i${i}`}>{m[3]}</em>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let ordered = false;
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length) {
      const items = list.map((li, n) => <li key={n}>{inline(li, `u${blocks.length}-${n}`)}</li>);
      blocks.push(ordered ? <ol key={`u${blocks.length}`} className="my-1 list-decimal space-y-0.5 pl-5">{items}</ol> : <ul key={`u${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">{items}</ul>);
    }
    list = [];
  };
  const BULLET = /^\s*[-*•]\s+/;
  const NUMBER = /^\s*\d+[.)]\s+/;
  for (const raw of text.trim().split("\n")) {
    const line = raw.trimEnd();
    if (BULLET.test(line) || NUMBER.test(line)) {
      flushPara();
      const isNum = NUMBER.test(line);
      if (list.length && isNum !== ordered) flushList();
      ordered = isNum;
      list.push(line.replace(isNum ? NUMBER : BULLET, ""));
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#{1,4}\s+/, ""));
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

/** A commit the server reported, as a transcript line: "<hash>: <summary>". */
const commitLine = (c: Extract<ChatCommit, { hash: string }>): ChatMessage => ({ role: "commit", text: `${c.hash}: ${c.summary}`, ts: new Date().toISOString() });

/** A note from the server may quote a git command in backticks: show it as
 *  code rather than with the backticks. */
function withCode(text: string) {
  return text.split(/(`[^`\n]+`)/g).map((part, i) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-panel px-1 py-0.5 font-mono break-all">{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  );
}

export default function ChatPanel({ context, onContentChanged }: { context: TutorContext; onContentChanged?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsReply | null>(null);
  const tail = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  // The context as of the moment Send is pressed, not as of the last render
  // that happened to create `submit`.
  const ctxRef = useRef(context);
  useEffect(() => {
    ctxRef.current = context;
  }, [context]);

  useEffect(() => {
    let live = true;
    getChatHistory().then((h) => live && setMessages(h.messages), (e) => live && setError((e as Error).message));
    getSettings().then((s) => live && setSettings(s), (e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    tail.current?.scrollIntoView({ block: "end" });
  }, [messages.length, thinking, fixing, note, error]);

  async function submit(text: string) {
    const message = text.trim();
    if (!message || thinking) return;
    setDraft("");
    setError(null);
    setNote(null);
    setElapsed(0);
    setFixing(false);
    setMessages((m) => [...m, { role: "user", text: message, ts: new Date().toISOString() }]);
    setThinking(true);
    // Only the Stop button aborts. An unmount does not: the run may be
    // editing files, and the server finishes and commits a turn whose client
    // merely navigated away only if the connection stays up.
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await sendChat(message, ctxRef.current, {
        heartbeat: (d) => setElapsed(d.elapsed),
        message: (d) => {
          setFixing(false);
          setMessages((m) => [...m, { role: "assistant", text: d.text, ts: d.ts }]);
          const parts = [
            d.numTurns != null && `${d.numTurns} turn${d.numTurns === 1 ? "" : "s"}`,
            d.costUsd != null && `$${d.costUsd.toFixed(3)}`,
            d.denied > 0 && `${d.denied} tool call${d.denied === 1 ? "" : "s"} denied by the sandbox`,
          ].filter(Boolean);
          if (parts.length) setNote(parts.join(" · "));
        },
        fixing: () => setFixing(true),
        problems: (d) => {
          setMessages((m) => [...m, { role: "note", text: d.text, ts: d.ts }]);
        },
        note: (d) => setMessages((m) => [...m, { role: "note", text: d.text, ts: d.ts }]),
        commit: (c) => {
          if ("hash" in c) {
            setMessages((m) => [...m, commitLine(c)]);
            // A new or changed lesson must show up on the path at once.
            onContentChanged?.();
          } else if ("error" in c) {
            setError(`The tutor's change could not be committed to git, so it was discarded: ${c.error}`);
          }
        },
        error: (d) => setError(d.error),
      }, ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted) {
        // What became of the turn is the server's to say: a turn stopped
        // part-way is thrown away (it wrote in a copy of its own, and a note
        // says so), but a Stop that lands after the commit changes nothing.
        setNote("Stopped. If the tutor had not finished, its work is thrown away (it writes in a separate copy) and nothing is committed; if it had just finished, the messages above show the commit.");
        window.setTimeout(() => {
          onContentChanged?.();
          getChatHistory().then((h) => setMessages(h.messages), () => undefined);
        }, 1500);
      } else setError(String((e as Error).message || e));
    } finally {
      abort.current = null;
      setThinking(false);
      setFixing(false);
    }
  }

  async function clear() {
    setError(null);
    setNote(null);
    try {
      await clearChatHistory();
      setMessages([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pickModel(model: string) {
    // Optimistic, so the select doesn't snap back while the PUT is in flight.
    setSettings((s) => (s ? { ...s, model } : s));
    try {
      setSettings(await setModel(model));
    } catch (e) {
      setError((e as Error).message);
      setSettings(await getSettings().catch(() => null));
    }
  }

  const modelLabel = settings?.models.find((m) => m.id === settings.model)?.label ?? "The tutor";
  const starters = startersFor(context);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="tutor-chat">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 short:py-0.5">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fg-3">
          Model
          <select aria-label="Model" className={`${inputClass} w-auto min-w-0 py-1 text-xs pointer-coarse:min-h-11`} value={settings?.model ?? ""} disabled={!settings || thinking} onChange={(e) => void pickModel(e.target.value)}>
            {settings?.models.map((m) => (
              <option key={m.id} value={m.id} title={m.note}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void clear()} disabled={thinking || messages.length === 0}>
          Clear history
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && !thinking && (
          <div className="space-y-3">
            <p className="text-sm text-fg-3">
              Ask about anything on this page, or ask for more: another explanation, more practice, a new lesson. New material is written into the curriculum, and every change is a git commit you can undo.
            </p>
            <ul className="flex flex-col items-start gap-1.5" data-testid="tutor-starters">
              {starters.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    className="rounded-full border border-line bg-raised px-3 py-1.5 text-left text-sm font-medium text-fg-2 hover:border-line-strong hover:text-fg active:border-line-strong pointer-coarse:min-h-11 pointer-coarse:px-4"
                    onClick={() => {
                      if (s.send) void submit(s.text);
                      else {
                        setDraft(s.text);
                        box.current?.focus();
                      }
                    }}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ol className="flex flex-col gap-3 text-sm">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <li key={i} className="flex justify-end" data-role="user">
                <p className="max-w-[90%] rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 whitespace-pre-wrap text-fg">{m.text}</p>
              </li>
            ) : m.role === "commit" ? (
              <li key={i} className="text-xs text-fg-3" data-role="commit">
                Committed <code className="font-mono">{m.text.split(":")[0]}</code>
                {m.text.includes(":") ? `: ${m.text.slice(m.text.indexOf(":") + 1).trim()}` : ""}
              </li>
            ) : m.role === "note" ? (
              <li key={i} className="rounded-lg bg-warn-soft px-3 py-2 text-xs whitespace-pre-wrap text-warn" data-role="note">
                {withCode(m.text)}
              </li>
            ) : (
              <li key={i} className="leading-relaxed text-fg-2" data-role="assistant">
                <Rich text={m.text} />
              </li>
            ),
          )}
        </ol>
        {thinking && (
          <p className="mt-3 flex items-center gap-2 text-sm text-fg-3" data-testid="tutor-working">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
            {fixing ? "The app refused part of that; the tutor is correcting it…" : `${modelLabel} is working…`} <span className="font-mono text-xs">{elapsed}s</span>
          </p>
        )}
        {note && !thinking && <p className="mt-2 text-xs text-fg-3">{withCode(note)}</p>}
        {error && (
          <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm whitespace-pre-wrap text-bad" role="alert">
            {error}
          </p>
        )}
        <div ref={tail} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line p-3 short:p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
      >
        <textarea
          ref={box}
          aria-label="Message to the tutor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Keep typing here from reaching page-level shortcuts (the
            // on-screen piano's letter keys, the space-bar tap).
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(draft);
            }
          }}
          onKeyUp={(e) => e.stopPropagation()}
          rows={2}
          placeholder="Ask a question, or ask for more practice…"
          enterKeyHint="send"
          className={`${inputClass} max-h-40 resize-none short:h-11 short:py-2`}
          disabled={thinking}
        />
        {thinking ? (
          <Button variant="quiet" onClick={() => abort.current?.abort()} aria-label="Stop the tutor">
            Stop
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={!draft.trim()}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
