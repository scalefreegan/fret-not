// Turns the markdown subset lessons are written in (docs/CONTENT.md: ## and
// ### headings, paragraphs, **bold**, *italic*, `code`, lists, > block
// quotes) into plain text worth sending to a TTS provider, plus enough
// structure for a listening UI to show the same blocks with a word-by-word
// highlight. Deliberately a sibling of web/src/markdown.tsx's block/inline
// parsing, not a refactor of it: that module emits React nodes for the DOM;
// this one emits plain text + word/bold ranges for a TTS request and its
// highlight, and keeping them separate means a lesson, a tutor reply and an
// exercise prompt can all go through this one function without entangling
// it with either renderer's React tree. Pure: no DOM, no network.

export interface Speakable {
  /** The words to send to the TTS provider: markdown syntax stripped out. */
  text: string;
  /** [start, end) ranges in `text` that were **bold** in the source. */
  boldRanges: [number, number][];
}

/** One spoken word of a Speakable's `text`, with its global index (matching
 *  the order ElevenLabs' alignment comes back in — both split on the same
 *  whitespace) and whether it fell inside a bold range. */
export interface SpeakableWord {
  text: string;
  index: number;
  bold: boolean;
}

/** One block of a speakable passage, in source order, for a UI that shows
 *  the text as it narrates it rather than just speaking it. Word indices
 *  are global across the whole passage — the same indices SpokenWord[]
 *  (shared/tts/alignment.ts) uses — not local to the block. */
export interface SpokenBlock {
  kind: "h2" | "h3" | "quote" | "bullet" | "number" | "p";
  words: SpeakableWord[];
}

/** Strip `**bold**`, `*italic*` and `` `code` `` from one run of inline
 *  text, returning the plain words and where the bold ones land. */
function inlinePlain(source: string): { text: string; bold: [number, number][] } {
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let out = "";
  const bold: [number, number][] = [];
  let last = 0;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m.index > last) out += source.slice(last, m.index);
    const tok = m[0];
    const start = out.length;
    const inner = tok.startsWith("**") || tok.startsWith("*") ? tok.slice(tok.startsWith("**") ? 2 : 1, tok.startsWith("**") ? -2 : -1) : tok.slice(1, -1);
    // Bold and italic can themselves hold **/*/` markup (markdown.tsx
    // recurses on bold); a lesson has never needed that in practice, so one
    // more pass covers it without full recursion depth.
    const nested = /[*`]/.test(inner) ? inlinePlain(inner) : { text: inner, bold: [] as [number, number][] };
    out += nested.text;
    if (tok.startsWith("**")) bold.push([start, start + nested.text.length]);
    for (const [s, e] of nested.bold) bold.push([start + s, start + e]);
    last = m.index + tok.length;
  }
  if (last < source.length) out += source.slice(last);
  return { text: out, bold };
}

const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l);

/** The source split into blocks (headings, paragraphs, list items, block
 *  quotes), each still raw markdown — `inlinePlain` runs on each separately,
 *  by both speakableText (joined into one passage) and spokenBlocks (kept
 *  apart, for rendering). This is the one place that walks the block
 *  grammar; keep it in step with web/src/markdown.tsx's Markdown(). */
function segmentBlocks(source: string): { kind: SpokenBlock["kind"]; raw: string }[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const segments: { kind: SpokenBlock["kind"]; raw: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (/^###\s+/.test(line)) {
      segments.push({ kind: "h3", raw: line.replace(/^###\s+/, "") });
      i++;
    } else if (/^#{1,2}\s+/.test(line)) {
      segments.push({ kind: "h2", raw: line.replace(/^#{1,2}\s+/, "") });
      i++;
    } else if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      segments.push({ kind: "quote", raw: buf.join(" ") });
    } else if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line);
      const kind: SpokenBlock["kind"] = ordered ? "number" : "bullet";
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && segments.length > 0))) {
        if (/^\s{2,}\S/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) segments[segments.length - 1].raw += ` ${lines[i].trim()}`;
        else segments.push({ kind, raw: lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, "") });
        i++;
      }
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?)/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) buf.push(lines[i++].trim());
      segments.push({ kind: "p", raw: buf.join(" ") });
    }
  }
  return segments;
}

/** `speakableText(markdownSource)` from the plan: one block of lesson/chat
 *  markdown → the plain text to speak, and which ranges of it were key
 *  terms. Blocks (headings, paragraphs, list items, quotes) are joined with
 *  a single space, matching how they'd be read aloud as one passage. */
export function speakableText(source: string): Speakable {
  let text = "";
  const boldRanges: [number, number][] = [];
  for (const { raw } of segmentBlocks(source)) {
    const { text: segText, bold } = inlinePlain(raw);
    if (!segText) continue;
    const offset = text.length;
    text += (text ? " " : "") + segText;
    const base = offset + (offset ? 1 : 0);
    for (const [s, e] of bold) boldRanges.push([base + s, base + e]);
  }
  return { text, boldRanges };
}

/** Like speakableText, but keeping block structure and splitting each
 *  block's plain text into words with a running global index — what a
 *  listening Markdown renderer needs to show the same blocks (headings,
 *  paragraphs, lists, quotes) with a moving word highlight that lines up
 *  with the SpokenWord[] the server returns for this same passage's text. */
export function spokenBlocks(source: string): SpokenBlock[] {
  const out: SpokenBlock[] = [];
  let index = 0;
  for (const { kind, raw } of segmentBlocks(source)) {
    const { text: segText, bold } = inlinePlain(raw);
    if (!segText) continue;
    const words: SpeakableWord[] = [];
    const re = /\S+/g;
    for (let m = re.exec(segText); m; m = re.exec(segText)) {
      const start = m.index;
      const end = start + m[0].length;
      words.push({ text: m[0], index: index++, bold: bold.some(([s, e]) => start < e && end > s) });
    }
    if (words.length) out.push({ kind, words });
  }
  return out;
}
