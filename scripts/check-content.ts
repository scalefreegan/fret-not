// Validate content/ the way the app does and print every problem.
//   npm run check:content            exit 1 when anything was refused
//   npm run check:content -- --gaps  also list concepts with no lesson or no exercise
import { coverageGaps, loadContent } from "../web/server/loader.ts";

const content = loadContent();
for (const p of content.problems) console.log(`✖ ${p.file}: ${p.message}`);
const perLevel = content.levels.map((l) => `L${l.id}: ${content.lessons.filter((x) => x.level === l.id).length}`).join("  ");
console.log(`${content.lessons.length} lessons valid (${perLevel}), ${content.concepts.length} concepts, ${content.problems.length} problem(s)`);
if (process.argv.includes("--gaps")) {
  const gaps = coverageGaps(content);
  if (gaps.untaught.length) console.log(`concepts no lesson teaches: ${gaps.untaught.join(", ")}`);
  if (gaps.untested.length) console.log(`concepts no exercise tests: ${gaps.untested.join(", ")}`);
}
process.exit(content.problems.length ? 1 : 0);
