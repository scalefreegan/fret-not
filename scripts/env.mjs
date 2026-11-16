// The checkout's .env.local, read the same way by the TTS proxy
// (web/server/tts.ts: ELEVENLABS_API_KEY) and the database config
// (scripts/db/config.mjs: DATABASE_URL). A file rather than the shell
// environment because the Dock app starts the server without the user's
// shell profile. Plain ESM, no dependencies.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root (this file is <repo>/scripts/env.mjs). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** FRET_ENV_FILE when set (resolved against the repo root), else
 *  <repo>/.env.local, which .gitignore already covers. */
export function envFile(root = ROOT) {
  const override = process.env.FRET_ENV_FILE;
  return override ? path.resolve(root, override) : path.join(root, ".env.local");
}

/** KEY=VALUE lines; `#` comments, blank lines, an `export ` prefix and one
 *  layer of matching quotes are tolerated. Nothing is interpolated. */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out[m[1]] = value;
  }
  return out;
}
