import type { TtsSpeakReply, TtsSpeakRequest, TtsVoicesReply } from "../../shared/wire.ts";
import { json, request } from "./client.ts";

// Client for /api/tts (web/server/tts.ts). Settings (the chosen voice,
// model, and Listen mode on/off) go through /api/settings instead — see
// src/tutor/api.ts's putSettings, shared because that one endpoint now
// covers both the tutor's model and Listen mode's voice.

async function call<T>(learnerId: string, path: string, body?: unknown): Promise<T> {
  return request<T>(`/api/tts${path}`, body === undefined ? undefined : json(body), learnerId);
}

/** The learner's ElevenLabs voice library, for the voice picker. */
export function getVoices(learnerId: string): Promise<TtsVoicesReply> {
  return call<TtsVoicesReply>(learnerId, "/voices");
}

/** Synthesize (or fetch from cache) the given text in the stored voice and
 *  model. Returns a URL to `<audio src>` directly, and the word timings to
 *  walk as it plays. */
export function speak(learnerId: string, text: string): Promise<TtsSpeakReply> {
  return call<TtsSpeakReply>(learnerId, "/speak", { text } satisfies TtsSpeakRequest);
}
