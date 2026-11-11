import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { sameOrigin } from "./api.ts";
import { coverageGaps, loadContent, parseBlocks, REPO_ROOT } from "./loader.ts";

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
