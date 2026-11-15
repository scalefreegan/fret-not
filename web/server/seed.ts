import type { FirstRunSeed } from "../../scripts/db/accounts.ts";

// The first admin's starting data (docs/DATA.md §First run). For now its
// first learner starts empty; reading what the files under data/ held
// before logins comes next.

export function readFirstRunSeed(name: string): FirstRunSeed {
  return { name, progress: null, listenMode: false, ttsVoiceId: null, ttsModelId: null, model: null, messages: [] };
}
