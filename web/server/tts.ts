import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { wordsFromAlignment, type CharAlignment, type SpokenWord } from "../shared/tts/alignment.ts";
import type { TtsSpeakReply, TtsVoice, TtsVoicesReply } from "../shared/wire.ts";
import { envFile as sharedEnvFile, parseEnv } from "../../scripts/env.mjs";
import type { LearnerCtx } from "./auth.ts";
import { REPO_ROOT } from "./loader.ts";
import { dataDir, getListenSettings, type LearnerRef } from "./store.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson, subPath } from "./sse.ts";

// ElevenLabs text-to-speech for "Listen mode": a learner who isn't reading
// fluently yet can hear lesson prose, tutor replies and exercise prompts
// instead, with the moving word-highlight the alignment data makes possible.
//
// Pattern copied from Lingo Dojo's scripts/voice.mjs (key-file reading, the
// plain-TTS request shape) but NOT its code — Lingo Dojo never asks for
// timestamps, so the alignment call and the disk cache below are new.
//
//   data/tts-cache/<hash>.mp3    the synthesized audio (content-addressed:
//                                hash of text + voice + model)
//   data/tts-cache/<hash>.json   {words: SpokenWord[]} for that same audio

/* --------------------------------- keys ---------------------------------- */

/** FRET_ENV_FILE when set (resolved against the repo root), else
 *  <repo>/.env.local — gitignored by both `.env.*` and `*.local` already in
 *  .gitignore. A file rather than the shell environment because the Dock
 *  app starts the server without the user's shell profile. The same file
 *  holds DATABASE_URL (scripts/db/config.mjs); both read it through
 *  scripts/env.mjs. */
export const envFile = (): string => sharedEnvFile(REPO_ROOT);
export { parseEnv };

/** The ElevenLabs API key: the process environment wins, else the env file.
 *  Read per call (no restart to pick up a new key), like every other file
 *  this server reads. */
export function apiKey(env: NodeJS.ProcessEnv = process.env, file: string = envFile()): string {
  const fromEnv = (env.ELEVENLABS_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return (parseEnv(fs.readFileSync(file, "utf8")).ELEVENLABS_API_KEY || "").trim();
  } catch {
    return "";
  }
}

export function isConfigured(): boolean {
  return apiKey().length > 0;
}

/* ------------------------------ request shapes ----------------------------- */

// {url, init}, built pure so a test can pin exactly what goes over the wire
// (and that the key only ever goes in a header) without a network call.

export function speakRequest({ key, voiceId, text, modelId }: { key: string; voiceId: string; text: string; modelId: string }): { url: string; init: RequestInit } {
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    init: {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  };
}

export function voicesRequest({ key }: { key: string }): { url: string; init: RequestInit } {
  return { url: "https://api.elevenlabs.io/v2/voices?page_size=100", init: { method: "GET", headers: { "xi-api-key": key } } };
}

/* ---------------------------------- cache ---------------------------------- */

interface CacheEntry {
  words: SpokenWord[];
}

function cacheDir(): string {
  return path.join(dataDir(), "tts-cache");
}

/** Content-addressed: the same text spoken in the same voice with the same
 *  model is the same audio, so a second request for it is free. */
export function cacheKey(text: string, voiceId: string, modelId: string): string {
  return crypto.createHash("sha256").update(text).update("\u0000").update(voiceId).update("\u0000").update(modelId).digest("hex");
}

function cachePaths(key: string): { audio: string; meta: string } {
  return { audio: path.join(cacheDir(), `${key}.mp3`), meta: path.join(cacheDir(), `${key}.json`) };
}

function readCache(key: string): CacheEntry | null {
  const { audio, meta } = cachePaths(key);
  if (!fs.existsSync(audio) || !fs.existsSync(meta)) return null;
  try {
    return JSON.parse(fs.readFileSync(meta, "utf8")) as CacheEntry;
  } catch {
    return null; // a torn write: regenerate rather than serve a mismatch
  }
}

function writeCache(key: string, audio: Buffer, entry: CacheEntry): void {
  fs.mkdirSync(cacheDir(), { recursive: true });
  const { audio: audioPath, meta: metaPath } = cachePaths(key);
  // Whole-file-then-rename, same as store.ts's settings writes: a crash
  // mid-write leaves no half-written cache entry for the next request to
  // trip over.
  const tmpAudio = `${audioPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpAudio, audio);
  fs.renameSync(tmpAudio, audioPath);
  const tmpMeta = `${metaPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpMeta, JSON.stringify(entry));
  fs.renameSync(tmpMeta, metaPath);
}

/* --------------------------------- routes --------------------------------- */

function requireKey(): string {
  const key = apiKey();
  if (!key) throw new HttpError(400, "Add ELEVENLABS_API_KEY to .env.local to turn on Listen mode.");
  return key;
}

/** Speak `text` in the learner's own voice and model. */
async function speak(text: string, ref: LearnerRef): Promise<TtsSpeakReply> {
  const { ttsVoiceId: voiceId, ttsModelId: modelId } = await getListenSettings(ref);
  if (!voiceId) throw new HttpError(400, "Choose a voice before using Listen mode.");
  const key = requireKey();
  const hash = cacheKey(text, voiceId, modelId);
  const cached = readCache(hash);
  if (cached) return { audioUrl: `/api/tts/audio/${hash}.mp3`, words: cached.words };

  const { url, init } = speakRequest({ key, voiceId, text, modelId });
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status === 401 ? 401 : 502, `ElevenLabs refused the request (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { audio_base64: string; alignment: CharAlignment };
  const audio = Buffer.from(json.audio_base64, "base64");
  const words = wordsFromAlignment(json.alignment);
  writeCache(hash, audio, { words });
  return { audioUrl: `/api/tts/audio/${hash}.mp3`, words };
}

async function voices(): Promise<TtsVoicesReply> {
  const key = requireKey();
  const { url, init } = voicesRequest({ key });
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(502, `ElevenLabs refused the voice list (${res.status})`);
  const json = (await res.json()) as { voices?: { voice_id: string; name: string; preview_url?: string }[] };
  const list: TtsVoice[] = (json.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, ...(v.preview_url ? { previewUrl: v.preview_url } : {}) }));
  return { voices: list };
}

const AUDIO_RE = /^([0-9a-f]{64})\.mp3$/;

/** GET /api/tts/audio/<hash>.mp3: a cached clip. Mounted on its own route
 *  (api.ts) because an audio element cannot send the learner header; the
 *  clips are content-addressed and the same for every learner. */
export async function handleTtsAudio(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const audioMatch = AUDIO_RE.exec(subPath(req));
  if (!audioMatch) return sendJson(res, 404, { error: "no such route" });
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  const { audio } = cachePaths(audioMatch[1]);
  if (!fs.existsSync(audio)) return sendJson(res, 404, { error: "no such cached audio" });
  // Content-addressed by a hash of (text, voice, model): the same key can
  // never mean different bytes, so this is safe to cache for a long time,
  // unlike Lingo Dojo's fresh-every-time voice.ts response. Private: it
  // needs a login.
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=31536000, immutable" });
  fs.createReadStream(audio).pipe(res);
}

/** /api/tts/voices and /api/tts/speak (and, when mounted alone as in the
 *  tests, /api/tts/audio/…). */
export async function handleTts(req: IncomingMessage, res: ServerResponse, ctx: LearnerCtx): Promise<void> {
  const seg = subPath(req);
  if (seg.startsWith("audio/")) {
    req.url = `/${seg.slice("audio/".length)}`;
    return handleTtsAudio(req, res);
  }
  if (seg === "voices") {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    return sendJson(res, 200, await voices());
  }
  if (seg === "speak") {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    const body = await readJsonBody<{ text?: unknown }>(req);
    if (typeof body?.text !== "string" || !body.text.trim()) throw new HttpError(400, "text must be a non-empty string");
    return sendJson(res, 200, await speak(body.text, { userId: ctx.user.id, learnerId: ctx.learner.id }));
  }
  sendJson(res, 404, { error: "no such route" });
}
