import type {
  ChatCommit, ChatDone, ChatError, ChatFixing, ChatHeartbeat, ChatHistoryReply, ChatProblems, ChatReply, ChatRequest, ChatStart, SettingsReply, SettingsRequest, TutorContext,
} from "../../shared/wire.ts";

// The tutor's client calls. Kept beside the drawer rather than in a shared
// api module so the tutor stays one self-contained folder.

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = body && typeof body === "object" && "error" in body ? (body as { error: unknown }).error : null;
    throw new Error(typeof err === "string" ? err : text.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  return body as T;
}

function json(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Handlers for the SSE events POST /api/chat emits (shapes in wire.ts). */
export interface ChatHandlers {
  start?: (d: ChatStart) => void;
  heartbeat?: (d: ChatHeartbeat) => void;
  message?: (d: ChatReply) => void;
  fixing?: (d: ChatFixing) => void;
  problems?: (d: ChatProblems) => void;
  commit?: (d: ChatCommit) => void;
  error?: (d: ChatError) => void;
  done?: (d: ChatDone) => void;
}

/** EventSource can't POST, so the stream is parsed by hand (wine-guide
 *  pattern). Resolves when the server's terminal `done` arrives; a stream
 *  that ends without one is an error, not a quiet success. */
async function ssePost(url: string, body: unknown, handlers: ChatHandlers, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { ...json(body), signal });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* non-JSON body */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let sawDone = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      if (event === "done") sawDone = true;
      try {
        const parsed: unknown = JSON.parse(data);
        (handlers as Record<string, ((d: unknown) => void) | undefined>)[event]?.(parsed);
      } catch {
        /* malformed frame */
      }
    }
  }
  if (!sawDone) throw new Error("stream ended unexpectedly — the server may have restarted; try again");
}

export function sendChat(message: string, context: TutorContext, handlers: ChatHandlers, signal?: AbortSignal): Promise<void> {
  return ssePost("/api/chat", { message, context } satisfies ChatRequest, handlers, signal);
}
export function getChatHistory(): Promise<ChatHistoryReply> {
  return req<ChatHistoryReply>("/api/chat/history");
}
export function clearChatHistory(): Promise<{ ok: true }> {
  return req<{ ok: true }>("/api/chat/history", { method: "DELETE" });
}
export function getSettings(): Promise<SettingsReply> {
  return req<SettingsReply>("/api/settings");
}
export function setModel(model: string): Promise<SettingsReply> {
  return req<SettingsReply>("/api/settings", json({ model } satisfies SettingsRequest, "PUT"));
}
