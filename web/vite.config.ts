import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// The API is Vite `apply:"serve"` middleware on the dev server — there is no
// separate backend. See server/api.ts.
import { apiPlugins } from "./server/api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugins()],
  // Fixed port so the Mac app (macos/) has a deterministic health-check and
  // dashboard URL; strict so a second instance fails loudly instead of
  // silently serving a twin on the next port. 38600 = Fret Not; Lingo Dojo is
  // 38400, Atlas 38300, Wine Guide 38200 and Basecamp 38100, so all can run at once.
  // Polling watcher: macOS FSEvents delivery for this directory is broken on
  // this machine (fsevents.watch sees nothing while fs.watch does), which
  // silently kills HMR — edits never reach the browser. Cheap for a project
  // this size; safe to drop if FSEvents recovers after a reboot.
  // content/ and data/ sit outside web/, so content edits (by the agent or
  // an editor) never trigger a reload; the UI re-reads them through the API.
  server: { port: 38600, strictPort: true, watch: { usePolling: true, interval: 300 } },
});
