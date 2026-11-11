// Regenerate docs/CONTENT-REFERENCE.md from web/shared/registry.ts:
//   node scripts/gen-reference.ts
import fs from "node:fs";
import path from "node:path";
import { EXERCISES, WIDGETS, type ParamSpecs } from "../web/shared/registry.ts";

const table = (params: ParamSpecs) => {
  const rows = Object.entries(params);
  if (rows.length === 0) return "_No parameters._\n";
  return ["| Parameter | Type | |", "|---|---|---|", ...rows.map(([n, s]) => `| \`${n}\`${s.required ? " **(required)**" : ""} | \`${s.type.replaceAll("|", " \\| ")}\` | ${s.doc} |`)].join("\n") + "\n";
};

let out = "# Fret Not — widget and exercise reference\n\nGenerated from `web/shared/registry.ts` by `node scripts/gen-reference.ts`. Do not edit by hand.\nThe file format these plug into is described in [CONTENT.md](CONTENT.md).\n\n## Widgets\n\n";
for (const [name, w] of Object.entries(WIDGETS)) out += `### \`${name}\`\n\n${w.doc}\n\n${table(w.params)}\n`;
out += "## Exercise kinds\n\nEvery declaration also takes `concept` (required), `count` (default 5) and an optional `title`.\n\n";
for (const group of ["identify", "ear", "play", "build"] as const) {
  out += `### ${group[0].toUpperCase()}${group.slice(1)}\n\n`;
  for (const [name, e] of Object.entries(EXERCISES)) if (e.group === group) out += `#### \`${name}\`\n\n${e.doc}\n\n${table(e.params)}\n`;
}
const file = path.resolve(import.meta.dirname, "../docs/CONTENT-REFERENCE.md");
fs.writeFileSync(file, out);
console.log(`wrote ${file}`);
