import type { IncomingMessage, ServerResponse } from "node:http";
import { loadContent } from "./loader.ts";
import { methodNotAllowed, sendJson } from "./sse.ts";

/** GET /api/content — the whole curriculum, re-read from disk each time. */
export function handleContent(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, loadContent());
}
