import type { IncomingMessage, ServerResponse } from "node:http";
import { AGENT_MODELS, failureHint, startClaude } from "../../scripts/claude.mjs";
import type { Content, ContentProblem } from "../shared/content.ts";
import type {
  ChatCommit, ChatDone, ChatError, ChatFixing, ChatHeartbeat, ChatHistoryReply, ChatMessage, ChatProblems, ChatReply, ChatRequest, ChatStart,
  SettingsReply, SettingsRequest, TutorContext,
} from "../shared/wire.ts";
import { commitContent } from "./commit.ts";
import { REPO_ROOT, contentDir, loadContent } from "./loader.ts";
import { HttpError, methodNotAllowed, openSse, readJsonBody, sendJson, subPath } from "./sse.ts";
import { appendHistory, clearHistory, getModel, readHistory, setModel } from "./store.ts";

// The Tutor: a headless `claude -p` (scripts/claude.mjs) that may read the
// repo and write only under content/, run one turn per request.
//
//   POST   /api/chat            {message, context?} → SSE: start, heartbeat…, message,
//                               [fixing, message,] [problems,] commit, done
//                               (or error, done); 409 while a run is in progress
//   GET    /api/chat/history    {messages}
//   DELETE /api/chat/history    {ok}
//   GET    /api/settings        {model, models}
//   PUT    /api/settings        {model} → {model, models}
//
// The CLI buffers the whole turn in --output-format json, so there is nothing
// to stream until it finishes: the heartbeats are what keep the connection
// (and the UI's elapsed counter) alive meanwhile.
//
// The agent has no shell, so it cannot validate what it wrote. The server
// does: it loads content/ before and after the turn, and if the turn
// introduced problems the loader refuses, the agent gets ONE automatic
// follow-up turn with the list. Whatever is still refused after that is told
// to the learner as it is. Then content/ is committed either way — a refused
// lesson is simply not served, and a commit is what makes the turn revertable.

const HEARTBEAT_MS = 4000;
/** Messages replayed into the prompt: ~20 exchanges. */
const HISTORY_WINDOW = 40;

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
   - You have no shell and cannot run the checker. After your turn the app validates content/ itself; if it refuses something you wrote you will get one follow-up message listing the problems, to fix them.

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
- Do not run git; the app commits your content changes after each turn, so every change can be undone.
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
 */
export function sanitizeContext(raw: unknown): TutorContext {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: TutorContext = { page: PAGES.has(r.page as TutorContext["page"]) ? (r.page as TutorContext["page"]) : "home" };
  const l = r.lesson as Record<string, unknown> | undefined;
  if (l && typeof l === "object") {
    const id = clip(l.id, 80);
    const file = clip(l.file, 200);
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
 *  was refused). The context describes the page at the time of THIS message. */
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
  return `Conversation so far:\n\n${prior.map(renderHistory).join("\n\n")}\n\n---\n\n[SYSTEM]\nThe app validated content/ after your last turn and the loader REFUSES what you wrote. A refused lesson is not shown to the learner at all. Problems your turn introduced:\n${problemList(problems)}\n\nFix every one now by editing the files (Read docs/CONTENT.md and docs/CONTENT-REFERENCE.md again if a parameter or format is in doubt; do not work around a problem by deleting the lesson). This is your only follow-up turn. Then reply to the learner in one or two sentences saying what you corrected, and end with the "Changed:" line describing the whole change (the original edit plus the fix).\n\n[ASSISTANT]`;
}

/** What the learner is told when the fix round did not clear everything. */
export function remainingNote(problems: ContentProblem[]): string {
  const files = [...new Set(problems.map((p) => p.file))];
  return `The app could not accept ${files.length === 1 ? "one file" : `${files.length} files`} the tutor wrote, even after a second try, so ${files.length === 1 ? "it is" : "they are"} not shown in the curriculum yet:\n${problemList(problems)}\nThe change is committed, so it can be fixed (ask the tutor again, naming the problem) or reverted with git.`;
}

/* -------------------------------- the run -------------------------------- */

// One tutor turn at a time: two runs editing content/ concurrently would race
// each other's commits, and the learner has one chat anyway.
let running = false;

async function handleChatPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<Partial<ChatRequest>>(req);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) throw new HttpError(400, "message is required");
  if (message.length > 20_000) throw new HttpError(413, "message too long");
  const ctx = sanitizeContext(body?.context);
  // Checked and set synchronously after the one await above, so two bodies
  // arriving together cannot both pass.
  if (running) throw new HttpError(409, "the tutor is already working on a message; wait for it to finish");
  running = true;

  const send = openSse(res);
  const now = () => new Date().toISOString();
  // Cancellation listens on `res`, not `req`: readJsonBody consumed the
  // request body, which destroys the IncomingMessage — a `close` listener on
  // it never fires, so a req-based kill would leak the process group.
  const ctrl = new AbortController();
  const onClose = () => ctrl.abort();
  res.on("close", onClose);
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    send("heartbeat", { elapsed: Math.round((Date.now() - startedAt) / 1000) } satisfies ChatHeartbeat);
  }, HEARTBEAT_MS);

  // Everything after openSse() stays inside the try: headers are out, so an
  // exception here can only be reported as an SSE error, never as a status.
  try {
    const prior = readHistory().slice(-HISTORY_WINDOW);
    const model = getModel();
    const before = loadContent();
    const system = systemPrompt(before);
    const userLine: ChatMessage = { role: "user", text: message, ts: now() };
    appendHistory(userLine);
    send("start", { model } satisfies ChatStart);

    const turn = async (prompt: string): Promise<ChatMessage> => {
      const { result } = startClaude({ prompt, systemPrompt: system, model, cwd: REPO_ROOT, signal: ctrl.signal, contentDir: contentDir(), repoRoot: REPO_ROOT });
      const run = await result;
      const reply: ChatMessage = { role: "assistant", text: run.text.trim(), ts: now() };
      appendHistory(reply);
      send("message", { ...reply, role: "assistant", costUsd: run.costUsd, numTurns: run.numTurns, denied: run.permissionDenials.length } satisfies ChatReply);
      if (run.permissionDenials.length) console.warn(`[fret-not] tutor: ${run.permissionDenials.length} tool call(s) denied by the sandbox`, run.permissionDenials);
      return reply;
    };

    let reply = await turn(historyPrompt(prior, message, ctx));

    // Validate what the turn left on disk; one repair turn if it broke something.
    let broken = newProblems(before.problems, loadContent().problems);
    if (broken.length) {
      send("fixing", { problems: broken } satisfies ChatFixing);
      try {
        reply = await turn(fixPrompt([...prior, userLine, reply], broken));
      } catch (e) {
        // The repair turn failing (limit, cancel) must not lose the first
        // turn's edits: fall through to the note and the commit.
        if (ctrl.signal.aborted) throw e;
        console.error(`[fret-not] tutor: fix turn failed: ${String((e as Error)?.message || e)}`);
      }
      broken = newProblems(before.problems, loadContent().problems);
      if (broken.length) {
        const note: ChatMessage = { role: "note", text: remainingNote(broken), ts: now() };
        appendHistory(note);
        send("problems", { problems: broken, text: note.text, ts: note.ts } satisfies ChatProblems);
      }
    }

    const commit: ChatCommit = await commitContent(reply.text);
    if ("hash" in commit) appendHistory({ role: "commit", text: `${commit.hash}: ${commit.summary}`, ts: now() });
    else if ("error" in commit) console.error(`[fret-not] tutor: commit failed: ${commit.error}`);
    send("commit", commit);
    send("done", { ok: true } satisfies ChatDone);
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    // A turn that died or was stopped part-way may have left edits behind.
    // Commit them like any other turn's, so content/ never sits changed with
    // no commit to revert; the client is usually gone by now, so this is for
    // the history, not the stream.
    const leftover = await commitContent("Changed: partial edit from an interrupted tutor turn");
    if ("hash" in leftover) appendHistory({ role: "commit", text: `${leftover.hash}: ${leftover.summary}`, ts: now() });
    send("error", { error: failureHint(msg) || msg } satisfies ChatError);
    if ("hash" in leftover) send("commit", leftover);
    send("done", { ok: false } satisfies ChatDone);
  } finally {
    running = false;
    clearInterval(heartbeat);
    res.off("close", onClose);
    res.end();
  }
}

/* -------------------------------- routes --------------------------------- */

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const seg = subPath(req);
  if (!seg) {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return handleChatPost(req, res);
  }
  if (seg === "history") {
    if (req.method === "GET") return sendJson(res, 200, { messages: readHistory() } satisfies ChatHistoryReply);
    if (req.method === "DELETE") {
      if (running) throw new HttpError(409, "the tutor is working; clear the history when it finishes");
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
