import type { IncomingMessage, ServerResponse } from "node:http";
import { AGENT_MODELS, failureHint, onFatalSignal, startClaude, sweepPromptDirs } from "../../scripts/claude.mjs";
import type { Content, ContentProblem } from "../shared/content.ts";
import type {
  ChatCommit, ChatDone, ChatError, ChatFixing, ChatHeartbeat, ChatHistoryReply, ChatMessage, ChatNote, ChatProblems, ChatReply, ChatRequest, ChatStart,
  SettingsReply, SettingsRequest, TutorContext,
} from "../shared/wire.ts";
import { REPO_ROOT, contentDir, loadContent } from "./loader.ts";
import { HttpError, methodNotAllowed, openSse, readJsonBody, sendJson, subPath } from "./sse.ts";
import { appendHistory, clearHistory, getModel, readHistory, setModel } from "./store.ts";
import { applyCommit, changedPaths, closeWorkspace, commitWorkspace, foundHeldNote, gitRoot, heldNote, heldRefs, openWorkspace, readOnlyNote, strayWrites, sweepWorkspaces, writable, type NotReady, type Workspace } from "./turn.ts";

// The Tutor: a headless `claude -p` (scripts/claude.mjs), one turn per request.
//
//   POST   /api/chat            {message, context?} → SSE: start, [note,] heartbeat…, message,
//                               [fixing, message,] [problems,] [note…,] commit, done
//                               (or error, done); 409 while a run is in progress
//   GET    /api/chat/history    {messages} (the newest HISTORY_REPLY_MAX)
//   DELETE /api/chat/history    {ok}
//   GET    /api/settings        {model, models}
//   PUT    /api/settings        {model} → {model, models}
//
// The reply only exists once the run ends, so there is nothing to show until
// then: the heartbeats are what keep the connection (and the UI's elapsed
// counter) alive meanwhile.
//
// The tutor never writes into the working tree (turn.ts has the rules):
//
//   - content/ is exactly the last commit → the turn runs in a git worktree
//     of its own and may Write/Edit under content/ THERE. The agent has no
//     shell, so the server validates what it left: loads it, and compares
//     with what loaded before. Anything the loader newly refuses, a lesson
//     or concept id that vanished (progress is keyed on those), or a file
//     that is not a curriculum file gets ONE automatic repair turn. If it is
//     then clean, it is committed in the worktree as `agent: <summary>` and
//     the branch is fast-forwarded to that commit; if the fast-forward is
//     not possible any more, the commit is kept under refs/tutor/<id> and
//     the learner is told how to take it. If it is not clean, or the run
//     died, timed out or was cancelled (the connection closing at any point
//     before the files are written into the repository counts), the worktree
//     is deleted. In every case there is nothing to undo, because nothing
//     was written here.
//   - anything else (uncommitted work in content/, a detached HEAD, no
//     commits, a rebase in progress…) → the turn runs in the repository with
//     Read/Glob/Grep only, and a note says why it cannot write.

const HEARTBEAT_MS = 4000;
/** Messages replayed into the prompt: ~20 exchanges… */
const HISTORY_WINDOW = 40;
/** …and no more than this many bytes of them, so a few very long replies
 *  cannot grow the prompt without bound. */
const HISTORY_BYTES = 150_000;
/** GET /api/chat/history returns at most this many of the newest messages. */
export const HISTORY_REPLY_MAX = 200;

/** The newest messages that fit both limits, oldest first. A message that
 *  alone exceeds the byte budget ends the walk: what is replayed is always a
 *  contiguous tail of the conversation. */
export function historyWindow(messages: ChatMessage[], maxMessages = HISTORY_WINDOW, maxBytes = HISTORY_BYTES): ChatMessage[] {
  let from = messages.length;
  let bytes = 0;
  while (from > 0 && messages.length - from < maxMessages) {
    const size = Buffer.byteLength(messages[from - 1].text);
    if (bytes + size > maxBytes) break;
    bytes += size;
    from--;
  }
  return messages.slice(from);
}

/* ------------------------------ the prompts ------------------------------ */

/** Built per request from the curriculum on disk, so the tutor sees the
 *  lessons and concepts as they are now — including what it added last turn. */
export function systemPrompt(c: Content, repoRoot: string = REPO_ROOT): string {
  const tracks = c.tracks.map((t) => `  - ${t.id} — "${t.title}"`).join("\n");
  const levels = c.levels
    .map((l) => {
      const lessons = c.lessons.filter((x) => x.level === l.id);
      const head = `  Level ${l.id} — "${l.title}"${l.status === "outline" ? " (outline only: no lessons yet)" : ""}`;
      const rows = lessons.map((x) => `    - ${x.id} [${x.track}] "${x.title}" — content/${x.file}`);
      const topics = l.status === "outline" ? l.topics.map((t) => `    · ${t}`) : [];
      return [head, ...rows, ...topics].join("\n");
    })
    .join("\n");
  const concepts = c.concepts.map((k) => `${k.id} (L${k.level}, ${k.track})`).join(", ");
  const refused = c.problems.length ? `\nFiles the loader currently refuses (not shown to the learner):\n${c.problems.map((p) => `  - content/${p.file}: ${p.message}`).join("\n")}\n` : "";
  return `You are the Tutor inside Fret Not, a visual app for learning how music works — sound and harmonics, notes, rhythm, reading notation, intervals, scales, chords — with every idea shown and drilled on piano and guitar. You run headless inside the app; the learner talks to you from a side chat next to the lesson or lab page they have open, and sees only your final reply.

You have two jobs.

1. TUTOR. The learner is an adult beginner with no music background, and curious. Answer what they asked about what they are looking at: patiently, in plain words, defining every term the first time you use it, never talking down. Be exactly right — frequencies, ratios, note names and spellings, string and fret positions, counts of beats. If you are not sure of a fact, say so rather than guess; prefer saying less to saying something loose. Tie the answer to what is on their screen (each message tells you the page, and on a lesson page the lesson file — Read it before answering about it, and Read the lesson's widgets and exercises rather than assuming). When their recent answers are listed, use them: a wrong answer shows what to explain. Pitches are sounding pitches (C4 is middle C). Keep answers short: a few sentences or a short list, not an essay. You cannot play sound, draw, or grade anything; the app generates and grades every exercise itself, so never tell the learner whether an answer they describe "would be marked" right — explain the music instead.

2. LESSON AUTHOR. When the learner asks for more material — another lesson, more practice questions, a different explanation written into a lesson — you write it into the curriculum. The curriculum is the product. It lives under content/ in this repository (${repoRoot}): content/curriculum.yaml (tracks, levels, concepts), content/instruments/*.yaml, and content/lessons/<track>/*.md (markdown with YAML frontmatter, widgets as fenced \`\`\`widget blocks, exercises declared in the frontmatter).
   - Before you create or edit ANY content file, Read docs/CONTENT.md (the file format and the rules for writing lessons that work) and docs/CONTENT-REFERENCE.md (every widget and exercise kind with its parameters). The loader refuses a lesson whole if anything in it breaks the format.
   - Use only widgets, exercise kinds and parameters listed in docs/CONTENT-REFERENCE.md. You cannot add new ones; if something needs one, say so instead of inventing it.
   - A lesson may only name concepts that exist. To teach a new concept, add it to content/curriculum.yaml FIRST (id lowercase-with-dashes, title, level, track, requires), then write the lesson.
   - Never change the \`id\` of an existing lesson or concept, and never delete one: the learner's progress is stored against those ids. A new lesson gets a new id (\`<track>-<level>-<slug>\`) and a new file (\`content/lessons/<track>/<level>-<order>-<slug>.md\`); pick an \`order\` that places it where it belongs.
   - "More practice questions" on a lesson means adding or extending exercise declarations in that lesson's frontmatter (or a new short lesson), not answering in chat with a quiz. Every \`quiz\` question needs an \`explain\`, and its \`answer\` is the 1-based index of the right choice — check it.
   - Music examples must be public domain (traditional tunes, long-dead composers) or written by you for the lesson, with the source in the widget's \`title\`. Never a copyrighted song: the repository is public.
   - Match the voice and length of the existing lessons; Read one or two neighbours first. When bar lines are written, every bar but the last must hold exactly what the time signature says.
   - You have no shell and cannot run the checker. After your turn the app validates content/ itself; if it refuses something you wrote (or an existing lesson or concept id has disappeared) you will get one follow-up message listing the problems, to fix them. If anything is still wrong after that, everything you wrote in the turn is thrown away and the learner is told, so make the fix count.

The curriculum right now:
Tracks:
${tracks || "  (none)"}
Levels and lessons (id [track] "title" — file):
${levels || "  (none)"}
Concept ids: ${concepts || "(none)"}
${refused}
Rules:
- You may create or edit files only under content/. Your tools are already restricted to that: do not try to write anywhere else, run commands, or touch web/, scripts/, docs/, data/ or anything else outside content/. If the learner asks for that (a new widget, a bug fix, a change to how the app works), say you can't and that it is a change to the app itself.
- Do not edit content unless the learner asked for something that needs it. A question gets an answer, not a rewrite of the lesson.
- Do not run git; the app commits the files you changed after each turn, so every change can be undone.
- You are working in a private copy of the repository (${repoRoot}). It is merged into the learner's own files only after it passes the checks. When you mention a file to the learner, give its path inside the repository (content/lessons/…), never the absolute path of your copy.
- Reply in plain prose, no headings. If — and only if — you created or edited files this turn, end your reply with ONE final line starting "Changed:" that says what, e.g. "Changed: added lesson core-3-blues-scale (level 3)." or "Changed: four more quiz questions in core-0-octave." Say in a sentence where the learner will find it. If you changed nothing, do not add that line.`;
}

const PAGES = new Set<TutorContext["page"]>(["home", "lesson", "review", "lab", "sketchpad", "placement"]);
const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * The context arrives from the browser and goes into the prompt, so it is
 * rebuilt field by field rather than trusted: unknown pages become "home",
 * strings are flattened to one line and clipped, a lesson file must look like
 * a path under lessons/ (it is only ever a hint for the agent's Read — the
 * sandbox, not this check, is what confines the agent), and at most the last
 * ten answers are kept.
 *
 * The lesson file is accepted in both spellings in use — relative to
 * content/ as the loader has it ("lessons/core/x.md") and relative to the
 * repo as the page sends it ("content/lessons/core/x.md") — and stored the
 * loader's way.
 */
export function sanitizeContext(raw: unknown): TutorContext {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: TutorContext = { page: PAGES.has(r.page as TutorContext["page"]) ? (r.page as TutorContext["page"]) : "home" };
  const l = r.lesson as Record<string, unknown> | undefined;
  if (l && typeof l === "object") {
    const id = clip(l.id, 80);
    const file = clip(l.file, 200).replace(/^content\//, "");
    const fileOk = /^lessons\/[A-Za-z0-9._\-/]+\.md$/.test(file) && !file.includes("..");
    if (/^[a-z0-9-]+$/.test(id)) {
      out.lesson = {
        id,
        title: clip(l.title, 160),
        file: fileOk ? file : "",
        concepts: Array.isArray(l.concepts) ? l.concepts.map((c) => clip(c, 60)).filter((c) => /^[a-z0-9-]+$/.test(c)).slice(0, 12) : [],
      };
    }
  }
  const lab = clip(r.lab, 60);
  if (lab) out.lab = lab;
  if (Array.isArray(r.recent)) {
    const recent = r.recent
      .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
      .slice(-10)
      .map((a) => ({ prompt: clip(a.prompt, 240), concept: clip(a.concept, 60), correct: a.correct === true, explain: clip(a.explain, 320) }))
      .filter((a) => a.prompt);
    if (recent.length) out.recent = recent;
  }
  return out;
}

const PAGE_WORDS: Record<TutorContext["page"], string> = {
  home: "the home page (their path through the levels, the next lesson, reviews due)",
  lesson: "a lesson",
  review: "a review session (mixed questions on concepts that are due)",
  lab: "the Lab (free explorers, no scoring)",
  sketchpad: "the Sketchpad (a melody and chord-progression builder in the Lab)",
  placement: "the placement check (testing out of early levels)",
};

/** The context as a few lines for the prompt. */
export function contextNote(ctx: TutorContext): string {
  const lines = [`The learner is on ${PAGE_WORDS[ctx.page]}.`];
  if (ctx.lesson) {
    const file = ctx.lesson.file ? ` — file content/${ctx.lesson.file}` : "";
    lines.push(`Lesson: ${ctx.lesson.id} "${ctx.lesson.title}"${file}${ctx.lesson.concepts.length ? ` — concepts: ${ctx.lesson.concepts.join(", ")}` : ""}.`);
  }
  if (ctx.lab) lines.push(`Lab explorer open: ${ctx.lab}.`);
  if (ctx.recent?.length) {
    lines.push("Their most recent answers here (oldest first):");
    for (const a of ctx.recent) lines.push(`  - ${a.correct ? "RIGHT" : "WRONG"} [${a.concept}] "${a.prompt}"${a.explain ? ` → shown afterwards: "${a.explain}"` : ""}`);
  }
  return lines.join("\n");
}

function renderHistory(m: ChatMessage): string {
  if (m.role === "commit") return `[SYSTEM]\nCommitted ${m.text}`;
  if (m.role === "note") return `[SYSTEM]\n${m.text}`;
  return `[${m.role.toUpperCase()}]\n${m.text}`;
}

/** The transcript replayed as the prompt, wine-guide style. Commit and note
 *  lines go in as system notes, so the tutor knows its last edit landed (or
 *  was refused, or is waiting under a ref). The context describes the page at the time of THIS message. */
export function historyPrompt(prior: ChatMessage[], message: string, ctx: TutorContext, today = new Date().toISOString().slice(0, 10)): string {
  const transcript = prior.length ? `Conversation so far:\n\n${prior.map(renderHistory).join("\n\n")}\n\n---\n\n` : "";
  return `${transcript}[CONTEXT]\n${contextNote(ctx)}\n\n[USER]\n${message}\n\n[ASSISTANT]\nRespond to the latest user message. Today is ${today}.`;
}

/** Problems in `after` that were not already there in `before` — what this
 *  turn broke. Pre-existing problems are not the tutor's to answer for. */
export function newProblems(before: ContentProblem[], after: ContentProblem[]): ContentProblem[] {
  const key = (p: ContentProblem) => `${p.file}\u0000${p.message}`;
  const had = new Set(before.map(key));
  return after.filter((p) => !had.has(key(p)));
}

export function problemList(problems: ContentProblem[]): string {
  return problems.map((p) => `- content/${p.file}: ${p.message}`).join("\n");
}

/** The automatic follow-up turn's prompt: the conversation including the
 *  reply just given, then the loader's verdict. */
export function fixPrompt(prior: ChatMessage[], problems: ContentProblem[]): string {
  return `Conversation so far:\n\n${prior.map(renderHistory).join("\n\n")}\n\n---\n\n[SYSTEM]\nThe app validated content/ after your last turn and the loader REFUSES what you wrote. A refused lesson is not shown to the learner at all. Problems your turn introduced:\n${problemList(problems)}\n\nFix every one now by editing the files (Read docs/CONTENT.md and docs/CONTENT-REFERENCE.md again if a parameter or format is in doubt; do not work around a problem by deleting the lesson). This is your only follow-up turn: if anything is still refused afterwards, everything you wrote is thrown away and the learner gets nothing. Then reply to the learner in one or two sentences saying what you corrected, and end with the "Changed:" line describing the whole change (the original edit plus the fix).\n\n[ASSISTANT]`;
}

/** The ids progress is keyed on, as they stood before a turn. */
export interface LiveIds {
  /** Lesson id → the file it lives in (relative to content/). */
  lessons: Map<string, string>;
  concepts: Set<string>;
}

/** The lesson and concept ids that load before the turn — which, since a
 *  writing turn starts from the last commit, are the committed ones. (An id
 *  in a file that was already refused at that commit is not known to anyone,
 *  and so is not protected.) */
export function liveIds(before: Content): LiveIds {
  return { lessons: new Map(before.lessons.map((l) => [l.id, l.file])), concepts: new Set(before.concepts.map((c) => c.id)) };
}

/**
 * Ids that were live before the turn and are gone after it. The loader
 * cannot see this — a renamed id is a perfectly valid file — but the
 * learner's progress is stored against those ids, so losing one orphans what
 * they earned.
 *
 * A lesson is "gone" when no loaded lesson has its id. The one exception is a
 * lesson whose file no longer loads at all and has a loader problem against
 * it: that problem already covers it (and is either new, so the turn answers
 * for it, or was there before). A file that still loads under another id is
 * a rename, whatever lesser problems it also carries. Concepts are judged
 * unless curriculum.yaml itself cannot be read afterwards (then there are no
 * concepts to compare, and the loader's problem with that file stands in).
 */
export function lostIds(before: Content | LiveIds, after: Content): ContentProblem[] {
  const live = before.lessons instanceof Map ? (before as LiveIds) : liveIds(before as Content);
  const out: ContentProblem[] = [];
  const lessonsNow = new Set(after.lessons.map((l) => l.id));
  const loadedFiles = new Set(after.lessons.map((l) => l.file));
  const flagged = new Set(after.problems.map((p) => p.file));
  for (const [id, file] of live.lessons) {
    if (lessonsNow.has(id)) continue;
    if (!loadedFiles.has(file) && flagged.has(file)) continue;
    out.push({ file, message: `lesson id "${id}" no longer exists (renamed or deleted). The learner's progress is stored against it: restore the lesson with exactly that id.` });
  }
  const unreadable = after.concepts.length === 0 && after.problems.some((p) => p.file === "curriculum.yaml");
  if (!unreadable) {
    const conceptsNow = new Set(after.concepts.map((c) => c.id));
    const gone = [...live.concepts].filter((c) => !conceptsNow.has(c));
    if (gone.length) {
      out.push({ file: "curriculum.yaml", message: `concept id${gone.length === 1 ? "" : "s"} removed or renamed: ${gone.join(", ")}. The learner's progress is stored against ${gone.length === 1 ? "it" : "them"}: restore exactly ${gone.length === 1 ? "that id" : "those ids"}.` });
    }
  }
  return out;
}

/** Everything a turn has to answer for in what loads: what the loader newly
 *  refuses, plus the ids it lost. */
export function turnProblems(before: Content, after: Content): ContentProblem[] {
  return [...newProblems(before.problems, after.problems), ...lostIds(before, after)];
}

/** What the learner is told when the fix round did not clear everything. */
export function remainingNote(problems: ContentProblem[]): string {
  const files = [...new Set(problems.map((p) => p.file))];
  return `The app could not accept ${files.length === 1 ? "one file" : `${files.length} files`} the tutor wrote, even after a second try:\n${problemList(problems)}\nSo the tutor's work from this turn was thrown away. It was written in a separate copy, so your curriculum was never touched and nothing was committed. Ask again, naming the problem, to have another go.`;
}

/** What the learner is told when a run died, timed out or was stopped. */
export function interruptedNote(reason: string, wrote: boolean): string {
  return `The tutor's turn did not finish (${reason}).${wrote ? " Whatever it had written so far was in a separate copy and has been thrown away;" : ""} ${wrote ? "your" : "Your"} curriculum was not touched and nothing was committed.`;
}

/** Added to the system prompt of a turn that may not write. */
export function readOnlyBrief(why: NotReady): string {
  return `\n\nTHIS TURN IS READ-ONLY. You have no Write or Edit tool this time, because ${why.reason}. Answer questions as usual. If the learner asked for something that needs you to write (a new lesson, more questions, a rewrite), do not attempt it and do not paste the lesson into the chat: say in one or two sentences that you cannot write right now and why, and that this will fix it: ${why.fix} Do not add a "Changed:" line.`;
}

/* -------------------------------- the run -------------------------------- */

// One tutor turn at a time: the learner has one chat, and two turns would
// only race to fast-forward the same branch. The state lives on globalThis
// because Vite re-evaluates this module when a server file is edited: a
// module-level `let` would start again at false while the previous copy's
// agent is still running, and let a second turn in beside it. It is held by
// this process only, so a process that died cannot leave it set.
interface TutorState {
  running: boolean;
  /** "agent" while the CLI may be running, "settling" once the server is
   *  committing and fast-forwarding. */
  phase: "idle" | "agent" | "settling";
  /** The worktree of the turn in flight, for the shutdown hook. */
  workspace: Pick<Workspace, "dir" | "root"> | null;
  hooked: boolean;
}
const tutor = ((globalThis as { __fretNotTutor?: TutorState }).__fretNotTutor ??= { running: false, phase: "idle", workspace: null, hooked: false });
tutor.phase ??= "idle";
tutor.workspace ??= null;

/** True while a tutor turn is in flight (for tests and the history route). */
export const tutorBusy = (): boolean => tutor.running;

/**
 * When the process is told to stop (the Mac app's Quit, Ctrl-C) while the
 * agent is running, the agent has just been killed by the reaper in
 * scripts/claude.mjs; its worktree is deleted right there, synchronously,
 * since the process may be gone a moment later. If even that does not get to
 * run (SIGKILL, a crash, a power cut) a directory is left in the temp folder
 * and a later start sweeps it. Either way the repository was never written.
 */
function armShutdownCleanup(): void {
  if (tutor.hooked) return;
  tutor.hooked = true;
  onFatalSignal(() => {
    const t = (globalThis as { __fretNotTutor?: TutorState }).__fretNotTutor;
    if (!t?.running || t.phase !== "agent" || !t.workspace) return;
    closeWorkspace(t.workspace);
  });
}

/**
 * Clear away worktrees an earlier turn or server process left behind (see
 * sweepWorkspaces in turn.ts for which), and old prompt temp directories.
 * Called when the server starts (api.ts — also when Vite restarts it inside
 * the same process, so the turn in flight is kept). Never throws; there is
 * nothing to put back, because a turn never writes into the repository until
 * it is finished and valid.
 */
export function recoverInterruptedTurn(maxAgeMs?: number): { removed: number } {
  sweepPromptDirs();
  const keep = tutor.running ? (tutor.workspace?.dir ?? null) : null;
  return { removed: sweepWorkspaces(maxAgeMs === undefined ? { keep } : { maxAgeMs, keep }) };
}

async function handleChatPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Cancellation is listened for from the first moment — before the body is
  // read, the repository checked or the worktree made — so a Stop pressed in
  // the first second is not missed. It listens on `res`, not `req`:
  // readJsonBody consumes the request body, which destroys the
  // IncomingMessage, and a `close` listener on that never fires.
  const ctrl = new AbortController();
  const onClose = () => ctrl.abort();
  res.on("close", onClose);
  /** The learner pressed Stop, or the page is gone. Also true when the
   *  connection closed before the listener above could hear it. */
  const gone = (): boolean => ctrl.signal.aborted || res.destroyed || Boolean(req.socket?.destroyed);
  const body = await readJsonBody<Partial<ChatRequest>>(req);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) throw new HttpError(400, "message is required");
  if (message.length > 20_000) throw new HttpError(413, "message too long");
  const ctx = sanitizeContext(body?.context);
  // Checked and set synchronously after the one await above, so two bodies
  // arriving together cannot both pass.
  if (tutor.running) throw new HttpError(409, "the tutor is already working on a message; wait for it to finish");
  tutor.running = true;
  tutor.phase = "idle";
  tutor.workspace = null;

  const now = () => new Date().toISOString();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let ws: Workspace | null = null;
  // Everything from here on is inside the try, so nothing — not even opening
  // the stream — can leave `running` set with no turn behind it.
  try {
    const dir = contentDir();
    const root = gitRoot();
    sweepWorkspaces({ root });
    sweepPromptDirs();

    // May this turn write? If so it gets a worktree of its own; if not (or
    // the worktree cannot be made) it runs read-only, and says why.
    const ready = await writable(root, dir);
    let readOnly: NotReady | null = ready.ok ? null : ready;
    if (ready.ok) {
      try {
        ws = await openWorkspace(ready);
        tutor.workspace = ws;
      } catch (e) {
        console.error(`[fret-not] tutor: could not make a worktree: ${String((e as Error)?.message || e)}`);
        readOnly = { ok: false, reason: "the app could not set up a separate working copy for it", fix: "Check `git worktree list` in a terminal and the app's log, then ask again." };
      }
    }

    const send = openSse(res);
    const startedAt = Date.now();
    heartbeat = setInterval(() => {
      send("heartbeat", { elapsed: Math.round((Date.now() - startedAt) / 1000) } satisfies ChatHeartbeat);
    }, HEARTBEAT_MS);
    const tell = (text: string) => {
      const note: ChatMessage = { role: "note", text, ts: now() };
      appendHistory(note);
      send("note", { text: note.text, ts: note.ts } satisfies ChatNote);
    };

    // Headers are out: an exception from here can only be reported as an SSE
    // error, never as a status.
    try {
      const history = readHistory();
      const prior = historyWindow(history);
      const model = getModel();
      // What the turn starts from: the worktree's content/ (the last commit)
      // when it may write, the working tree's when it may only read.
      const before = loadContent(ws ? ws.content : dir);
      const system = systemPrompt(before, ws ? ws.dir : root) + (readOnly ? readOnlyBrief(readOnly) : "");
      armShutdownCleanup();
      const userLine: ChatMessage = { role: "user", text: message, ts: now() };
      appendHistory(userLine);
      send("start", { model } satisfies ChatStart);
      if (readOnly) {
        // Said once, not after every question: skipped while the same note
        // is still among the last few messages.
        const text = readOnlyNote(readOnly);
        if (!history.slice(-READ_ONLY_NOTE_EVERY).some((m) => m.role === "note" && m.text === text)) tell(text);
      }
      // A tutor commit an earlier server kept under a name (or applied) but
      // stopped before recording: said now, once, so no kept commit is ever
      // one the owner was not told about.
      const spec = ready.ok ? ready.spec : "content";
      const found = await heldRefs(root, spec);
      const said = (h: { ref: string; hash: string }) => history.some((m) => (m.role === "note" && m.text.includes(h.ref)) || (m.role === "commit" && m.text.startsWith(h.hash.slice(0, 7))));
      for (const h of found.landed) if (!said(h)) appendHistory({ role: "commit", text: `${h.hash.slice(0, 7)}: ${h.summary}`, ts: now() });
      for (const h of found.held) if (!said(h)) tell(foundHeldNote(h, spec));

      const turn = async (prompt: string): Promise<ChatMessage> => {
        // Stopped before the agent was even started: do not start it.
        if (gone()) throw new Error("cancelled");
        tutor.phase = "agent";
        const { result } = startClaude(
          ws
            ? { prompt, systemPrompt: system, model, cwd: ws.dir, signal: ctrl.signal, contentDir: ws.content, repoRoot: ws.dir }
            : { prompt, systemPrompt: system, model, cwd: root, signal: ctrl.signal, tools: "read" },
        );
        const run = await result;
        tutor.phase = "settling";
        const reply: ChatMessage = { role: "assistant", text: run.text.trim(), ts: now() };
        appendHistory(reply);
        send("message", { ...reply, role: "assistant", costUsd: run.costUsd, numTurns: run.numTurns, denied: run.permissionDenials.length } satisfies ChatReply);
        if (run.permissionDenials.length) console.warn(`[fret-not] tutor: ${run.permissionDenials.length} tool call(s) denied by the sandbox`, run.permissionDenials);
        return reply;
      };

      /** What the turn has to answer for, judged in its worktree. */
      const verdict = async (in_: Workspace): Promise<ContentProblem[]> => [...turnProblems(before, loadContent(in_.content)), ...strayWrites(in_, await changedPaths(in_))];

      let reply = await turn(historyPrompt(prior, message, ctx));
      let commit: ChatCommit = { skipped: true };
      if (ws) {
        // Validate what the turn left in the worktree; one repair turn if it
        // broke something. A repair turn that fails or is cut off throws like
        // any other and the worktree is simply deleted.
        let broken = await verdict(ws);
        if (broken.length) {
          send("fixing", { problems: broken } satisfies ChatFixing);
          reply = await turn(fixPrompt([...prior, userLine, reply], broken));
          broken = await verdict(ws);
        }
        // Stop pressed (or the page gone) after the agent's last call but
        // before the commit is still a stop: nothing is committed.
        if (gone()) throw new Error("cancelled");

        if (broken.length) {
          const note: ChatMessage = { role: "note", text: remainingNote(broken), ts: now() };
          appendHistory(note);
          send("problems", { problems: broken, text: note.text, ts: note.ts } satisfies ChatProblems);
        } else {
          const made = await commitWorkspace(ws, reply.text);
          if ("error" in made) {
            console.error(`[fret-not] tutor: commit failed: ${made.error}`);
            tell(`The tutor's change passed the checks but could not be committed (${made.error}), so it was thrown away. It was written in a separate copy: your curriculum was not touched. Ask again once that is sorted out.`);
            commit = { error: made.error };
          } else if ("hash" in made) {
            // Asked again inside, immediately before the files are written.
            const landed = await applyCommit(ws, made.hash, { cancelled: gone });
            if (!landed.applied && landed.cancelled) throw new Error("cancelled");
            if (landed.applied) {
              commit = { hash: made.hash.slice(0, 7), summary: made.summary };
              appendHistory({ role: "commit", text: `${commit.hash}: ${commit.summary}`, ts: now() });
            } else if (!landed.cancelled) {
              console.warn(`[fret-not] tutor: commit ${made.hash} kept as ${landed.ref}, not applied: ${landed.reason}`);
              tell(heldNote(ws, made.hash, made.summary, landed));
            }
          }
        }
      }
      send("commit", commit);
      send("done", { ok: true } satisfies ChatDone);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      const reason = failureHint(msg) || msg;
      // The run died, timed out or was stopped (startClaude rejects only once
      // the process group is gone, so nothing is still writing). There is
      // nothing to put back: a writing turn only ever wrote in its worktree,
      // which the `finally` below deletes. The client is often gone by now,
      // so the note in the history is what records it.
      let text = reason;
      if (ws) {
        let wrote = false;
        try {
          wrote = (await changedPaths(ws)).length > 0;
        } catch {
          /* the worktree is already gone (the shutdown hook) */
        }
        text = interruptedNote(reason, wrote);
        try {
          appendHistory({ role: "note", text, ts: now() });
        } catch (storeError) {
          console.error(`[fret-not] tutor: could not record an interrupted turn: ${String((storeError as Error)?.message || storeError)}`);
        }
      }
      send("error", { error: text } satisfies ChatError);
      send("done", { ok: false } satisfies ChatDone);
    }
  } finally {
    // Committed and applied, kept under a ref, or thrown away: in every case
    // the worktree has done its job.
    if (ws) closeWorkspace(ws);
    tutor.workspace = null;
    tutor.running = false;
    tutor.phase = "idle";
    if (heartbeat) clearInterval(heartbeat);
    res.off("close", onClose);
    if (res.headersSent) res.end();
  }
}

/** The read-only note is not repeated while it is among this many newest
 *  history messages. */
const READ_ONLY_NOTE_EVERY = 12;

/* -------------------------------- routes --------------------------------- */

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const seg = subPath(req);
  if (!seg) {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return handleChatPost(req, res);
  }
  if (seg === "history") {
    if (req.method === "GET") return sendJson(res, 200, { messages: readHistory().slice(-HISTORY_REPLY_MAX) } satisfies ChatHistoryReply);
    if (req.method === "DELETE") {
      if (tutor.running) throw new HttpError(409, "the tutor is working; clear the history when it finishes");
      clearHistory();
      return sendJson(res, 200, { ok: true });
    }
    return methodNotAllowed(res, "GET, DELETE");
  }
  sendJson(res, 404, { error: "no such route" });
}

export async function handleSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (subPath(req)) return sendJson(res, 404, { error: "no such route" });
  const reply = (): SettingsReply => ({ model: getModel(), models: AGENT_MODELS });
  if (req.method === "GET") return sendJson(res, 200, reply());
  if (req.method === "PUT") {
    const body = await readJsonBody<Partial<SettingsRequest>>(req);
    const model = body?.model;
    if (typeof model !== "string" || !AGENT_MODELS.some((m) => m.id === model)) {
      throw new HttpError(400, `model must be one of ${AGENT_MODELS.map((m) => m.id).join(", ")}`);
    }
    setModel(model);
    return sendJson(res, 200, reply());
  }
  methodNotAllowed(res, "GET, PUT");
}
