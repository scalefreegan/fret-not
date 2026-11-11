import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { sameOrigin } from "./api.ts";
import { coverageGaps, loadContent, parseBlocks, REPO_ROOT, splitFrontmatter } from "./loader.ts";

const CURRICULUM = `
tracks:
  - { id: core, title: Core }
levels:
  - { id: 0, title: Zero }
concepts:
  - { id: octave, title: The octave, level: 0 }
  - { id: lonely, title: Untaught, level: 0 }
`;
const lesson = (extra = "", body = "Hello.\n\n```widget\ntype: keyboard\nrange: [C4, C5]\n```\n") => `---
id: core-0-a
title: A
track: core
level: 0
order: 1
concepts: [octave]
summary: One sentence.
${extra}---
${body}`;

function withContent(files: Record<string, string>, run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fret-content-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a valid lesson loads with prose and widget blocks", () => {
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson("exercises:\n  - { kind: ear-same-note, concept: octave, count: 3 }\n") }, (dir) => {
    const c = loadContent(dir);
    assert.deepEqual(c.problems, []);
    assert.equal(c.lessons.length, 1);
    assert.deepEqual(c.lessons[0].blocks.map((b) => b.type), ["prose", "widget"]);
    assert.equal(c.lessons[0].exercises[0].count, 3);
    assert.deepEqual(coverageGaps(c), { untaught: ["lonely"], untested: ["lonely"] });
  });
});

test("a lesson with any problem is refused whole, with a readable reason", () => {
  const cases: [string, string, RegExp][] = [
    ["unknown widget", lesson("", "```widget\ntype: nope\n```\n"), /unknown widget type "nope"/],
    ["bad parameter", lesson("", "```widget\ntype: keyboard\nrange: [C4]\n```\n"), /range/],
    ["unknown concept", lesson().replace("[octave]", "[nothing]"), /not in curriculum/],
    ["exercise on a concept the lesson does not list", lesson("exercises:\n  - { kind: ear-same-note, concept: lonely }\n"), /not in this lesson/],
    ["quiz answer out of range", lesson("exercises:\n  - kind: quiz\n    concept: octave\n    questions:\n      - { q: 'x?', choices: [a, b], answer: 3 }\n"), /1-based index/],
    ["bar of the wrong length", lesson("", "```widget\ntype: melody\nnotes: \"C4:q D4:q | E4:w\"\n```\n"), /bar 1 holds 2 beats/],
    ["chord box with no stored shape", lesson("", "```widget\ntype: chord-diagram\nchords: [Ebm]\n```\n"), /no stored guitar shape/],
    ["no frontmatter", "Just text", /frontmatter/],
  ];
  for (const [name, text, expect] of cases) {
    withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": text }, (dir) => {
      const c = loadContent(dir);
      assert.equal(c.lessons.length, 0, name);
      assert.ok(c.problems.some((p) => p.file === "lessons/core/a.md" && expect.test(p.message)), `${name}: ${JSON.stringify(c.problems)}`);
    });
  }
});

test("duplicate lesson ids and an unclosed widget block are caught", () => {
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson(), "lessons/core/b.md": lesson() }, (dir) => {
    const c = loadContent(dir);
    assert.equal(c.lessons.length, 1);
    assert.ok(c.problems.some((p) => /already used/.test(p.message)));
  });
  assert.ok(parseBlocks("Text\n\n```widget\ntype: keyboard\n").problems.some((p) => /never closed/.test(p)));
});

test("the curriculum refuses duplicate track and level ids, a scalar `requires`, and ids that name object built-ins", () => {
  const cur = `
tracks:
  - { id: core, title: Core }
  - { id: core, title: Core again }
  - { id: constructor, title: Built-in }
levels:
  - { id: 0, title: Zero }
  - { id: 0, title: Zero again }
concepts:
  - { id: octave, title: The octave, level: 0 }
  - { id: pitch, title: Pitch, level: 0, requires: octave }
  - { id: mixed, title: Mixed, level: 0, requires: [octave, 3] }
  - { id: constructor, title: Built-in, level: 0 }
  - { id: fine, title: Fine, level: 0, requires: [octave] }
`;
  withContent({ "curriculum.yaml": cur, "lessons/core/a.md": lesson().replace("id: core-0-a", "id: constructor") }, (dir) => {
    const c = loadContent(dir);
    const said = (re: RegExp) => assert.ok(c.problems.some((p) => re.test(p.message)), `${re}: ${JSON.stringify(c.problems)}`);
    assert.deepEqual(c.tracks.map((t) => t.id), ["core"]);
    assert.deepEqual(c.levels.map((l) => l.title), ["Zero"]);
    assert.deepEqual(c.concepts.map((k) => k.id), ["octave", "fine"]);
    assert.deepEqual(c.concepts[1].requires, ["octave"]);
    said(/track id used twice: core/);
    said(/level id used twice: 0/);
    said(/concept pitch: `requires` must be a list/);
    said(/concept mixed: `requires` must be a list/);
    said(/concept needs an id .*constructor/);
    said(/track needs an id .*constructor/);
    assert.equal(c.lessons.length, 0);
    assert.ok(c.problems.some((p) => p.file === "lessons/core/a.md" && /`id` is required/.test(p.message)));
  });
});

test("instruments: a fretboard needs strings, a sane fret count and an ordered range", () => {
  const cur = CURRICULUM;
  const inst = (body: string) => `title: X\nlayout: fretboard\n${body}`;
  const cases: [string, RegExp | null][] = [
    [inst("range: [E2, C6]\ntuning: [E2, A2, D3, G3, B3, E4]\nfrets: 20\n"), null],
    [inst("range: [E2, C6]\ntuning: []\nfrets: 20\n"), /needs tuning/],
    [inst("range: [E2, C6]\ntuning: [E2, A2]\nfrets: -5\n"), /frets must be a whole number/],
    [inst("range: [E2, C6]\ntuning: [E2, A2]\nfrets: 2.5\n"), /frets must be a whole number/],
    [inst("range: [E6, E2]\ntuning: [E2, A2]\nfrets: 20\n"), /lowest pitch to the highest/],
    [inst("range: [E2, E2]\ntuning: [E2, A2]\n"), /lowest pitch to the highest/],
    [inst("range: [E2, C6]\ntuning: [E2, A2]\nwrittenOffset: high\n"), /writtenOffset/],
  ];
  for (const [yaml, expect] of cases) {
    withContent({ "curriculum.yaml": cur, "instruments/x.yaml": yaml }, (dir) => {
      const c = loadContent(dir);
      const mine = c.problems.filter((p) => p.file === "instruments/x.yaml");
      if (!expect) {
        assert.deepEqual(mine, [], yaml);
        assert.equal(c.instruments.length, 1);
      } else {
        assert.equal(c.instruments.length, 0, yaml);
        assert.ok(mine.some((p) => expect.test(p.message)), `${yaml}: ${JSON.stringify(mine)}`);
      }
    });
  }
});

test("a lesson: non-finite order is refused, a byte-order mark is not", () => {
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson().replace("order: 1", "order: .nan") }, (dir) => {
    const c = loadContent(dir);
    assert.equal(c.lessons.length, 0);
    assert.ok(c.problems.some((p) => /`order` is required \(a finite number/.test(p.message)), JSON.stringify(c.problems));
  });
  withContent({ "curriculum.yaml": `\uFEFF${CURRICULUM}`, "lessons/core/a.md": `\uFEFF${lesson()}` }, (dir) => {
    const c = loadContent(dir);
    assert.deepEqual(c.problems, []);
    assert.equal(c.lessons.length, 1);
  });
});

test("a ```widget shown inside a longer fence is prose, not a live widget", () => {
  const quoted = "Write it like this:\n\n````markdown\n```widget\ntype: nope\n```\n````\n\nAnd a tilde fence:\n\n~~~\n```widget\ntype: nope\n```\n~~~\n\nThen a real one:\n\n```widget\ntype: keyboard\nrange: [C4, C5]\n```\n\nDone.\n";
  const parsed = parseBlocks(quoted);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.blocks.map((b) => b.type), ["prose", "widget", "prose"]);
  const first = parsed.blocks[0];
  assert.ok(first.type === "prose" && first.markdown.includes("type: nope") && first.markdown.includes("````markdown"));
  // An ordinary code fence before a widget does not swallow it, and CRLF files work.
  const crlf = parseBlocks("```js\r\nlet a = 1;\r\n```\r\n\r\n```widget\r\ntype: keyboard\r\nrange: [C4, C5]\r\n```\r\n");
  assert.deepEqual(crlf.problems, []);
  assert.deepEqual(crlf.blocks.map((b) => b.type), ["prose", "widget"]);
  assert.ok(parseBlocks("```widget\ntype: constructor\n```\n").problems.some((p) => /unknown widget type/.test(p)));
});

test("a quiz question with two choices that read the same is refused", () => {
  // An unquoted comma in a flow list splits one choice into two.
  const quiz = "exercises:\n  - kind: quiz\n    concept: octave\n    questions:\n      - { q: 'Which?', choices: [One fret, then two frets, Two frets, then two frets, One fret, then one fret], answer: 1, explain: e }\n";
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson(quiz) }, (dir) => {
    const c = loadContent(dir);
    assert.equal(c.lessons.length, 0);
    assert.ok(c.problems.some((p) => /question 1: the choice "then two frets" appears twice/.test(p.message)), JSON.stringify(c.problems));
  });
  const ok = quiz.replace("[One fret, then two frets, Two frets, then two frets, One fret, then one fret]", "['One fret, then two frets', 'Two frets, then two frets', 'One fret, then one fret']");
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson(ok) }, (dir) => {
    const c = loadContent(dir);
    assert.deepEqual(c.problems, []);
  });
});

test("choices that differ only in case are different answers", () => {
  const quiz = "exercises:\n  - kind: quiz\n    concept: octave\n    questions:\n      - { q: 'Which is the minor tonic?', choices: [I, i, V, v], answer: 2, explain: e }\n      - { q: 'Which?', choices: [C, c, \"c'\"], answer: 1, explain: e }\n";
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson(quiz) }, (dir) => assert.deepEqual(loadContent(dir).problems, []));
  // …while the same text with different spacing is still the same choice.
  const same = quiz.replace("[I, i, V, v]", "[I, 'I ', V, v]");
  withContent({ "curriculum.yaml": CURRICULUM, "lessons/core/a.md": lesson(same) }, (dir) => assert.ok(loadContent(dir).problems.some((p) => /appears twice/.test(p.message))));
});

test("inline code at the start of a line is not a fence, and an unclosed fence is a problem", () => {
  const widget = "```widget\ntype: keyboard\nrange: [C4, C5]\n```\n";
  // Three backticks, text, three backticks: inline code. It used to open a
  // "fence" that swallowed every widget after it without a word.
  const inline = parseBlocks("```x``` is inline code.\n\n" + widget + "\nMore.\n\n" + widget);
  assert.deepEqual(inline.problems, []);
  assert.deepEqual(inline.blocks.map((b) => b.type), ["prose", "widget", "prose", "widget"]);
  // A real fence that is never closed would do the same: say so.
  const open = parseBlocks("Text.\n\n```js\nlet a = 1;\n\n" + widget);
  assert.ok(open.problems.some((p) => /code block that was never closed/.test(p)), JSON.stringify(open.problems));
  assert.ok(parseBlocks("Text.\n\n```js\nlet a = 1;\n").problems.some((p) => /``` code block is never closed/.test(p)));
  assert.ok(parseBlocks("~~~\nnever closed\n").problems.some((p) => /~~~ code block is never closed/.test(p)));
  // A tilde fence may have backticks in its info string.
  assert.deepEqual(parseBlocks("~~~ a`b\ncode\n~~~\n\n" + widget).blocks.map((b) => b.type), ["prose", "widget"]);
});

test("the shipped curriculum is valid and every written concept is taught and tested", () => {
  const c = loadContent(path.join(REPO_ROOT, "content"));
  assert.deepEqual(c.problems, []);
  assert.deepEqual(coverageGaps(c), { untaught: [], untested: [] });
  assert.ok(c.lessons.length >= 49);
});

test("same-origin rule", () => {
  assert.equal(sameOrigin(undefined, "localhost:38600"), true);
  assert.equal(sameOrigin("http://localhost:38600", "localhost:38600"), true);
  assert.equal(sameOrigin("http://evil.example", "localhost:38600"), false);
  assert.equal(sameOrigin("http://localhost:38600", undefined), false);
  assert.equal(sameOrigin("not a url", "localhost:38600"), false);
});

test("a fence that only looks like a widget block is a problem, never silent prose", () => {
  const body = (open: string, close = "```") => `Text.\n\n${open}\ntype: keyboard\nrange: [C4, C5]\n${close}\n\nMore.\n`;
  assert.deepEqual(parseBlocks(body("```widget")).problems, []);
  assert.deepEqual(parseBlocks(body("```widget  ")).problems, [], "trailing spaces are harmless");
  for (const [open, close, why] of [
    [" ```widget", " ```", /indented/],
    ["   ```widget", "   ```", /indented/],
    ["    ```widget", "    ```", /indented/],
    ["\t```widget", "\t```", /indented/],
    ["~~~widget", "~~~", /~~~/],
    ["````widget", "````", /4 backticks/],
    ["``` widget", "```", /space before/],
    ["```Widget", "```", /says "Widget"/],
    ["```WIDGET", "```", /says "WIDGET"/],
    ["```widgets", "```", /says "widgets"/],
    ["```widget title=x", "```", /"title=x" follows/],
  ] as const) {
    const { blocks, problems } = parseBlocks(body(open, close));
    assert.ok(problems.some((p) => /looks like a widget block/.test(p) && why.test(p)), `${JSON.stringify(open)} → ${JSON.stringify(problems)}`);
    assert.ok(!blocks.some((b) => b.type === "widget"), open);
  }
  // Quoting one as an example still works, and other fences are untouched.
  assert.deepEqual(parseBlocks("````markdown\n```widget\ntype: keyboard\n```\n````\n").problems, []);
  assert.deepEqual(parseBlocks("~~~text\n~~~widget\n~~~\n").problems, [], "inside another fence nothing is a widget");
  assert.deepEqual(parseBlocks("```widgetry\nx\n```\n\nThe word widget in prose, and `widget` in code.\n").problems, []);
});

test("a widget block inside an HTML comment is a problem", () => {
  const w = "```widget\ntype: keyboard\nrange: [C4, C5]\n```\n";
  assert.ok(parseBlocks(`<!--\n${w}-->\n`).problems.some((p) => /inside an HTML comment/.test(p)));
  assert.ok(parseBlocks(`Text <!-- old:\n\n${w}\n end -->\n`).problems.some((p) => /inside an HTML comment/.test(p)));
  assert.deepEqual(parseBlocks(`<!-- a note -->\n\n${w}`).problems, [], "a closed comment hides nothing and blocks nothing");
  assert.deepEqual(parseBlocks("Write `<!--` to open a comment.\n\n" + w).problems, [], "inline code is not a comment");
  assert.deepEqual(parseBlocks("```html\n<!--\n```\n\n" + w).problems, [], "nor is a code block");
});

test("frontmatter ends only at a line that is --- and nothing else", () => {
  const split = splitFrontmatter("---\nid: a\n---x: 1\ntitle: T\n---\nBody\n---\nmore\n");
  assert.equal(split.body, "Body\n---\nmore\n");
  assert.deepEqual(split.meta, { id: "a", "---x": 1, title: "T" });
  assert.throws(() => splitFrontmatter("---\nid: a\n---x\nBody\n"), /frontmatter/);
  assert.deepEqual(splitFrontmatter("---\nid: a\n---"), { meta: { id: "a" }, body: "" });
  assert.deepEqual(splitFrontmatter("---  \r\nid: a\r\n--- \r\nBody\r\n"), { meta: { id: "a" }, body: "Body\r\n" });
});

test("instruments/guitar.yaml must describe the guitar the engine has", () => {
  const guitar = (over: Record<string, string> = {}) => {
    const f = { range: "[E2, C6]", tuning: "[E2, A2, D3, G3, B3, E4]", frets: "20", writtenOffset: "12", ...over };
    return `title: Guitar\nlayout: fretboard\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n")}\n`;
  };
  const cases: [Record<string, string>, RegExp | null][] = [
    [{}, null],
    [{ frets: "24" }, /frets must be 20, got 24/],
    [{ frets: "12" }, /frets must be 20/],
    [{ tuning: "[D2, A2, D3, G3, B3, E4]" }, /standard tuning/],
    [{ tuning: "[E2, A2, D3, G3]" }, /standard tuning/],
    [{ writtenOffset: "0" }, /writtenOffset must be 12/],
    [{ range: "[E2, E6]" }, /range must run/],
  ];
  for (const [over, expect] of cases) {
    withContent({ "curriculum.yaml": CURRICULUM, "instruments/guitar.yaml": guitar(over) }, (dir) => {
      const c = loadContent(dir);
      const mine = c.problems.filter((p) => p.file === "instruments/guitar.yaml");
      if (!expect) assert.deepEqual([mine, c.instruments.length], [[], 1]);
      else assert.ok(c.instruments.length === 0 && mine.some((p) => expect.test(p.message) && /GUITAR_FRETS/.test(p.message)), `${JSON.stringify(over)}: ${JSON.stringify(mine)}`);
    });
  }
  // Another fretted instrument is free to differ.
  withContent({ "curriculum.yaml": CURRICULUM, "instruments/bass.yaml": "title: Bass\nlayout: fretboard\nrange: [E1, G4]\ntuning: [E1, A1, D2, G2]\nfrets: 24\n" }, (dir) => assert.deepEqual(loadContent(dir).problems.filter((p) => p.file.startsWith("instruments/")), []));
});
