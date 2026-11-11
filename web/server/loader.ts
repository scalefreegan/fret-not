import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { Block, Concept, Content, ContentProblem, ExerciseDecl, Instrument, Lesson, Level, Track } from "../shared/content.ts";
import { isPitch } from "../shared/music/notes.ts";
import { GUITAR_SHAPES } from "../shared/music/instruments.ts";
import { barProblems, parseMelody, parseRhythm, parseTab } from "../shared/music/rhythm.ts";
import { checkParams, EXERCISES, WIDGETS } from "../shared/registry.ts";

// Loads content/ from disk and validates it against the registry. Pure
// functions of a directory: no server state and no cache, so an edit by the
// tutor or an editor is live on the next request and `node --test` can point
// the loader at fixtures. Nothing here throws for bad content: every problem
// becomes a ContentProblem and the offending lesson is left out.

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** FRET_CONTENT_DIR when set (resolved against the repo root), else <repo>/content.
 *  Read per call so a test can redirect it. */
export function contentDir(): string {
  const override = process.env.FRET_CONTENT_DIR;
  return override ? path.resolve(REPO_ROOT, override) : path.join(REPO_ROOT, "content");
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readYaml(file: string): unknown {
  return YAML.parse(fs.readFileSync(file, "utf8"));
}

interface Curriculum {
  tracks: Track[];
  levels: Level[];
  concepts: Concept[];
}

function loadCurriculum(dir: string, problems: ContentProblem[]): Curriculum {
  const file = "curriculum.yaml";
  const out: Curriculum = { tracks: [], levels: [], concepts: [] };
  const bad = (message: string) => problems.push({ file, message });
  let raw: unknown;
  try {
    raw = readYaml(path.join(dir, file));
  } catch (e) {
    bad(`cannot read: ${(e as Error).message}`);
    return out;
  }
  if (!isRecord(raw)) {
    bad("must be a mapping with tracks, levels and concepts");
    return out;
  }
  for (const t of Array.isArray(raw.tracks) ? raw.tracks : []) {
    if (!isRecord(t) || !isText(t.id) || !ID_RE.test(t.id) || !isText(t.title)) {
      bad(`track needs an id (lowercase-with-dashes) and a title: ${JSON.stringify(t)}`);
      continue;
    }
    out.tracks.push({ id: t.id, title: t.title, summary: isText(t.summary) ? t.summary : "", ...(isText(t.instrument) ? { instrument: t.instrument } : {}) });
  }
  for (const l of Array.isArray(raw.levels) ? raw.levels : []) {
    if (!isRecord(l) || typeof l.id !== "number" || !Number.isInteger(l.id) || !isText(l.title)) {
      bad(`level needs a whole-number id and a title: ${JSON.stringify(l)}`);
      continue;
    }
    const status = l.status === "outline" ? "outline" : "written";
    out.levels.push({ id: l.id, title: l.title, summary: isText(l.summary) ? l.summary : "", status, topics: Array.isArray(l.topics) ? l.topics.filter(isText) : [] });
  }
  out.levels.sort((a, b) => a.id - b.id);
  const trackIds = new Set(out.tracks.map((t) => t.id));
  const levelIds = new Set(out.levels.map((l) => l.id));
  const seen = new Set<string>();
  for (const c of Array.isArray(raw.concepts) ? raw.concepts : []) {
    if (!isRecord(c) || !isText(c.id) || !ID_RE.test(c.id) || !isText(c.title)) {
      bad(`concept needs an id (lowercase-with-dashes) and a title: ${JSON.stringify(c)}`);
      continue;
    }
    if (seen.has(c.id)) {
      bad(`concept id used twice: ${c.id}`);
      continue;
    }
    if (typeof c.level !== "number" || !levelIds.has(c.level)) {
      bad(`concept ${c.id}: level ${JSON.stringify(c.level)} is not a level in this file`);
      continue;
    }
    const track = isText(c.track) ? c.track : "core";
    if (!trackIds.has(track)) {
      bad(`concept ${c.id}: track "${track}" is not a track in this file`);
      continue;
    }
    seen.add(c.id);
    out.concepts.push({ id: c.id, title: c.title, level: c.level, track, requires: Array.isArray(c.requires) ? c.requires.filter(isText) : [] });
  }
  for (const c of out.concepts) {
    for (const r of c.requires) if (!seen.has(r)) bad(`concept ${c.id} requires "${r}", which is not a concept`);
  }
  if (out.tracks.length === 0) bad("no tracks");
  if (out.levels.length === 0) bad("no levels");
  return out;
}

function loadInstruments(dir: string, problems: ContentProblem[]): Instrument[] {
  const out: Instrument[] = [];
  const sub = path.join(dir, "instruments");
  if (!fs.existsSync(sub)) return out;
  for (const name of fs.readdirSync(sub).filter((n) => n.endsWith(".yaml")).sort()) {
    const file = `instruments/${name}`;
    const bad = (message: string) => problems.push({ file, message });
    let raw: unknown;
    try {
      raw = readYaml(path.join(sub, name));
    } catch (e) {
      bad(`cannot read: ${(e as Error).message}`);
      continue;
    }
    if (!isRecord(raw) || !isText(raw.title)) {
      bad("needs a title");
      continue;
    }
    if (raw.layout !== "keyboard" && raw.layout !== "fretboard") {
      bad("layout must be keyboard or fretboard (a new layout needs a renderer in web/src/widgets first)");
      continue;
    }
    if (!Array.isArray(raw.range) || raw.range.length !== 2 || !raw.range.every(isPitch)) {
      bad("range must be [lowest, highest] pitches, e.g. [E2, E6]");
      continue;
    }
    const tuning = Array.isArray(raw.tuning) ? raw.tuning : undefined;
    if (raw.layout === "fretboard" && (!tuning || !tuning.every(isPitch))) {
      bad("a fretboard instrument needs tuning: the open strings from the lowest, e.g. [E2, A2, D3, G3, B3, E4]");
      continue;
    }
    out.push({
      id: name.replace(/\.yaml$/, ""),
      title: raw.title,
      layout: raw.layout,
      range: raw.range as [string, string],
      ...(tuning ? { tuning: tuning as string[] } : {}),
      ...(typeof raw.frets === "number" ? { frets: raw.frets } : {}),
      writtenOffset: typeof raw.writtenOffset === "number" ? raw.writtenOffset : 0,
      timbre: isText(raw.timbre) ? raw.timbre : "piano",
    });
  }
  return out;
}

/** Split a lesson file into YAML frontmatter and markdown body. */
export function splitFrontmatter(text: string): { meta: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error("must start with YAML frontmatter between --- lines");
  return { meta: YAML.parse(m[1]), body: m[2] };
}

/** Musical sanity beyond parameter types: things that parse but would teach
 *  something wrong or cannot be drawn. */
function widgetSemantics(widget: string, params: Record<string, unknown>): string[] {
  const out: string[] = [];
  const time = typeof params.time === "string" ? params.time : "4/4";
  try {
    if (widget === "rhythm" && typeof params.pattern === "string") out.push(...barProblems(parseRhythm(params.pattern), time));
    if (widget === "melody" && typeof params.notes === "string") out.push(...barProblems(parseMelody(params.notes), time));
    if (widget === "tab" && typeof params.notes === "string") out.push(...barProblems(parseTab(params.notes), time));
  } catch {
    /* a token that does not parse is already reported by checkParams */
  }
  const needShape: string[] = [];
  if (widget === "chord-diagram" && Array.isArray(params.chords)) needShape.push(...(params.chords as string[]));
  if (widget === "chord" && Array.isArray(params.views) && params.views.includes("diagram") && typeof params.symbol === "string") needShape.push(params.symbol);
  for (const c of needShape) if (!GUITAR_SHAPES[c]) out.push(`no stored guitar shape for ${c} (known: ${Object.keys(GUITAR_SHAPES).join(", ")})`);
  return out;
}

/** Cut a markdown body into prose and widget blocks. A widget is a fenced
 *  block whose info string is `widget`, containing YAML with a `type`. */
export function parseBlocks(body: string): { blocks: Block[]; problems: string[] } {
  const blocks: Block[] = [];
  const problems: string[] = [];
  const re = /^```widget[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let last = 0;
  const pushProse = (text: string) => {
    if (text.trim()) blocks.push({ type: "prose", markdown: text.trim() });
  };
  for (let m = re.exec(body); m; m = re.exec(body)) {
    pushProse(body.slice(last, m.index));
    last = m.index + m[0].length;
    let raw: unknown;
    try {
      raw = YAML.parse(m[1]);
    } catch (e) {
      problems.push(`widget block is not valid YAML: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    if (!isRecord(raw) || !isText(raw.type)) {
      problems.push("widget block needs a `type`");
      continue;
    }
    const spec = WIDGETS[raw.type];
    if (!spec) {
      problems.push(`unknown widget type "${raw.type}" (known: ${Object.keys(WIDGETS).join(", ")})`);
      continue;
    }
    const { type, ...params } = raw;
    const bad = [...checkParams(spec.params, params), ...widgetSemantics(type, params)];
    if (bad.length) {
      problems.push(...bad.map((b) => `widget ${type}: ${b}`));
      continue;
    }
    blocks.push({ type: "widget", widget: type, params });
  }
  pushProse(body.slice(last));
  if (/^```widget/m.test(body.slice(last))) problems.push("a ```widget block is never closed");
  return { blocks, problems };
}

function parseExercises(raw: unknown, conceptIds: Set<string>, lessonConcepts: string[]): { exercises: ExerciseDecl[]; problems: string[] } {
  const exercises: ExerciseDecl[] = [];
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { exercises, problems };
  if (!Array.isArray(raw)) return { exercises, problems: ["`exercises` must be a list"] };
  raw.forEach((item, i) => {
    const where = `exercise ${i + 1}`;
    if (!isRecord(item) || !isText(item.kind)) {
      problems.push(`${where} needs a \`kind\``);
      return;
    }
    const spec = EXERCISES[item.kind];
    if (!spec) {
      problems.push(`${where}: unknown kind "${item.kind}" (known: ${Object.keys(EXERCISES).join(", ")})`);
      return;
    }
    const { kind, concept, count, title, ...params } = item;
    if (!isText(concept) || !conceptIds.has(concept)) {
      problems.push(`${where} (${kind}): \`concept\` must be a concept id from curriculum.yaml, got ${JSON.stringify(concept)}`);
      return;
    }
    if (!lessonConcepts.includes(concept)) {
      problems.push(`${where} (${kind}): concept "${concept}" is not in this lesson's \`concepts\` list`);
      return;
    }
    if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 20)) {
      problems.push(`${where} (${kind}): \`count\` must be a whole number from 1 to 20`);
      return;
    }
    const bad = checkParams(spec.params, params);
    if (bad.length) {
      problems.push(...bad.map((b) => `${where} (${kind}): ${b}`));
      return;
    }
    exercises.push({ kind, concept, count: typeof count === "number" ? count : 5, ...(isText(title) ? { title } : {}), params });
  });
  return { exercises, problems };
}

function walk(dir: string, rel = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r));
    else if (e.name.endsWith(".md")) out.push(r);
  }
  return out;
}

/** Parse and validate one lesson file's text. Exported for tests and for the
 *  tutor's pre-commit check. */
export function parseLesson(text: string, file: string, cur: Curriculum): { lesson: Lesson | null; problems: string[] } {
  let meta: unknown;
  let body: string;
  try {
    ({ meta, body } = splitFrontmatter(text));
  } catch (e) {
    return { lesson: null, problems: [(e as Error).message.split("\n")[0]] };
  }
  if (!isRecord(meta)) return { lesson: null, problems: ["frontmatter must be a mapping"] };
  const problems: string[] = [];
  if (!isText(meta.id) || !ID_RE.test(meta.id)) problems.push("`id` is required (lowercase letters, digits and dashes)");
  if (!isText(meta.title)) problems.push("`title` is required");
  if (!isText(meta.summary)) problems.push("`summary` is required (one sentence shown on the path)");
  const track = cur.tracks.find((t) => t.id === meta.track);
  if (!track) problems.push(`\`track\` must be one of: ${cur.tracks.map((t) => t.id).join(", ")}`);
  const level = cur.levels.find((l) => l.id === meta.level);
  if (!level) problems.push(`\`level\` must be one of: ${cur.levels.map((l) => l.id).join(", ")}`);
  if (typeof meta.order !== "number") problems.push("`order` is required (a number; lessons in a level run in this order)");
  const conceptIds = new Set(cur.concepts.map((c) => c.id));
  const concepts = Array.isArray(meta.concepts) ? meta.concepts.filter(isText) : [];
  if (concepts.length === 0) problems.push("`concepts` must list at least one concept id from curriculum.yaml");
  for (const c of concepts) if (!conceptIds.has(c)) problems.push(`concept "${c}" is not in curriculum.yaml`);
  const parsed = parseBlocks(body);
  problems.push(...parsed.problems);
  if (parsed.blocks.length === 0) problems.push("the lesson has no body");
  const ex = parseExercises(meta.exercises, conceptIds, concepts);
  problems.push(...ex.problems);
  if (problems.length) return { lesson: null, problems };
  return {
    lesson: {
      id: meta.id as string,
      title: meta.title as string,
      track: meta.track as string,
      level: meta.level as number,
      order: meta.order as number,
      concepts,
      summary: meta.summary as string,
      ...(isText(meta.mirrors) ? { mirrors: meta.mirrors } : {}),
      blocks: parsed.blocks,
      exercises: ex.exercises,
      file,
    },
    problems: [],
  };
}

export function loadContent(dir: string = contentDir()): Content {
  const problems: ContentProblem[] = [];
  const cur = loadCurriculum(dir, problems);
  const instruments = loadInstruments(dir, problems);
  const instrumentIds = new Set(instruments.map((i) => i.id));
  for (const t of cur.tracks) {
    if (t.instrument && !instrumentIds.has(t.instrument)) problems.push({ file: "curriculum.yaml", message: `track ${t.id}: no instruments/${t.instrument}.yaml` });
  }

  const lessons: Lesson[] = [];
  const ids = new Map<string, string>();
  for (const rel of walk(path.join(dir, "lessons"))) {
    const file = `lessons/${rel}`;
    let text: string;
    try {
      text = fs.readFileSync(path.join(dir, file), "utf8");
    } catch (e) {
      problems.push({ file, message: `cannot read: ${(e as Error).message}` });
      continue;
    }
    const { lesson, problems: bad } = parseLesson(text, file, cur);
    for (const message of bad) problems.push({ file, message });
    if (!lesson) continue;
    const dup = ids.get(lesson.id);
    if (dup) {
      problems.push({ file, message: `lesson id "${lesson.id}" is already used by ${dup}` });
      continue;
    }
    ids.set(lesson.id, file);
    lessons.push(lesson);
  }
  for (const l of lessons) {
    if (l.mirrors && !ids.has(l.mirrors)) problems.push({ file: l.file, message: `mirrors "${l.mirrors}", which is not a lesson id` });
  }
  const trackOrder = new Map(cur.tracks.map((t, i) => [t.id, i]));
  lessons.sort((a, b) => a.level - b.level || (trackOrder.get(a.track) ?? 0) - (trackOrder.get(b.track) ?? 0) || a.order - b.order || a.id.localeCompare(b.id));
  return { ...cur, instruments, lessons, problems };
}

/** Concepts of written levels that no lesson teaches or no exercise tests —
 *  not errors (the lesson may not be written yet), but worth listing. */
export function coverageGaps(content: Content): { untaught: string[]; untested: string[] } {
  const written = new Set(content.levels.filter((l) => l.status === "written").map((l) => l.id));
  const taught = new Set(content.lessons.flatMap((l) => l.concepts));
  const tested = new Set(content.lessons.flatMap((l) => l.exercises.map((e) => e.concept)));
  const inScope = content.concepts.filter((c) => written.has(c.level));
  return { untaught: inScope.filter((c) => !taught.has(c.id)).map((c) => c.id), untested: inScope.filter((c) => !tested.has(c.id)).map((c) => c.id) };
}
