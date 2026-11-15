import type { ReactNode } from "react";
import { spokenBlocks, type SpeakableWord } from "../shared/tts/speakable.ts";
import { cx } from "./ui.tsx";

// The small markdown subset lessons are written in (docs/CONTENT.md):
// ## and ### headings, paragraphs, **bold**, *italic*, `code`, bulleted and
// numbered lists, and > block quotes (shown as a "key idea" box). Rendered to
// React elements directly — lesson text never becomes raw HTML.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${n++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{inline(tok.slice(1, -1), key)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
  const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
    } else if (/^###\s+/.test(line)) {
      out.push(<h3 key={key}>{inline(line.replace(/^###\s+/, ""), key)}</h3>);
      i++;
    } else if (/^#{1,2}\s+/.test(line)) {
      out.push(<h2 key={key}>{inline(line.replace(/^#{1,2}\s+/, ""), key)}</h2>);
      i++;
    } else if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={key}>{inline(buf.join(" "), key)}</blockquote>);
    } else if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length > 0))) {
        if (/^\s{2,}\S/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""));
        i++;
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${key}-${j}`)}</li>);
      out.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?)/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) buf.push(lines[i++].trim());
      out.push(<p key={key}>{inline(buf.join(" "), key)}</p>);
    }
  }
  return <div className="prose-lesson">{out}</div>;
}

/** Same markdown subset as Markdown, for Listen mode: each word is its own
 *  span (built from shared/tts/speakable.ts's spokenBlocks, which segments
 *  the same way this file's own block loop above does) so `activeWord` —
 *  the index of the word currently sounding, from the matching SpokenWord[]
 *  — can be highlighted as it narrates, and a **bold** key term stays
 *  visually distinct from that moving highlight. A second component rather
 *  than a prop on Markdown: this one always pays for per-word spans, which
 *  Markdown's callers (most of the app, with Listen mode off) should not. */
function renderWords(words: SpeakableWord[], activeWord: number | null | undefined, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  words.forEach((w, j) => {
    if (j > 0) out.push(" ");
    out.push(
      <span key={`${keyBase}-${j}`} data-word={w.index} className={cx(w.bold && "font-bold", w.index === activeWord && "rounded-sm bg-accent-soft px-0.5")}>
        {w.text}
      </span>,
    );
  });
  return out;
}

export function SpokenMarkdown({ source, activeWord }: { source: string; activeWord?: number | null }) {
  const blocks = spokenBlocks(source);
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const key = `s${k++}`;
    if (b.kind === "bullet" || b.kind === "number") {
      const items: typeof blocks = [];
      while (i < blocks.length && blocks[i].kind === b.kind) items.push(blocks[i++]);
      const lis = items.map((it, j) => <li key={j}>{renderWords(it.words, activeWord, `${key}-${j}`)}</li>);
      out.push(b.kind === "number" ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
    } else {
      const words = renderWords(b.words, activeWord, key);
      if (b.kind === "h2") out.push(<h2 key={key}>{words}</h2>);
      else if (b.kind === "h3") out.push(<h3 key={key}>{words}</h3>);
      else if (b.kind === "quote") out.push(<blockquote key={key}>{words}</blockquote>);
      else out.push(<p key={key}>{words}</p>);
      i++;
    }
  }
  return <div className="prose-lesson">{out}</div>;
}
