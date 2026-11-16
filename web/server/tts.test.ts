import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { TtsSpeakReply, TtsVoicesReply } from "../shared/wire.ts";
import { apiKey, cacheKey, envFile, handleTts, isConfigured, parseEnv, speakRequest, voicesRequest } from "./tts.ts";
import { dataDir, getListenSettings, setListenSettings } from "./store.ts";
import { REPO_ROOT } from "./loader.ts";
import { asLearner, testLearner, type TestLearner } from "./test-db.ts";

/* -------------------------- pure helpers, no server ------------------------ */

test("parseEnv reads KEY=VALUE, skipping comments and blanks, tolerating quotes and export", () => {
  const env = parseEnv(`
# a comment
ELEVENLABS_API_KEY=abc123 # trailing comment

export OTHER="quoted value"
SINGLE='also quoted'
`);
  assert.equal(env.ELEVENLABS_API_KEY, "abc123");
  assert.equal(env.OTHER, "quoted value");
  assert.equal(env.SINGLE, "also quoted");
});

test("apiKey prefers the process environment over the file, and is empty when neither has it", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-tts-env-"));
  const file = path.join(tmp, ".env.local");
  fs.writeFileSync(file, "ELEVENLABS_API_KEY=from-file\n");
  try {
    assert.equal(apiKey({}, file), "from-file");
    assert.equal(apiKey({ ELEVENLABS_API_KEY: "from-env" }, file), "from-env");
    assert.equal(apiKey({}, path.join(tmp, "missing.env")), "");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("envFile honors FRET_ENV_FILE, else <repo>/.env.local", () => {
  const prior = process.env.FRET_ENV_FILE;
  try {
    delete process.env.FRET_ENV_FILE;
    assert.equal(envFile(), path.join(REPO_ROOT, ".env.local"));
    process.env.FRET_ENV_FILE = "custom.env";
    assert.equal(envFile(), path.join(REPO_ROOT, "custom.env"));
  } finally {
    if (prior === undefined) delete process.env.FRET_ENV_FILE;
    else process.env.FRET_ENV_FILE = prior;
  }
});

test("cacheKey is deterministic and changes with text, voice or model", () => {
  const a = cacheKey("hello", "voice1", "eleven_v4");
  assert.equal(a, cacheKey("hello", "voice1", "eleven_v4"), "same inputs, same key");
  assert.notEqual(a, cacheKey("hello there", "voice1", "eleven_v4"));
  assert.notEqual(a, cacheKey("hello", "voice2", "eleven_v4"));
  assert.notEqual(a, cacheKey("hello", "voice1", "eleven_flash_v2_5"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("speakRequest and voicesRequest put the key only in the xi-api-key header", () => {
  const speak = speakRequest({ key: "secret", voiceId: "v id/with special", text: "hi", modelId: "eleven_v4" });
  assert.ok(speak.url.startsWith("https://api.elevenlabs.io/v1/text-to-speech/"));
  assert.ok(speak.url.includes("/with-timestamps"));
  assert.ok(!speak.url.includes("secret"));
  assert.equal((speak.init.headers as Record<string, string>)["xi-api-key"], "secret");
  assert.deepEqual(JSON.parse(speak.init.body as string), { text: "hi", model_id: "eleven_v4" });

  const voices = voicesRequest({ key: "secret" });
  assert.equal(voices.url, "https://api.elevenlabs.io/v2/voices?page_size=100");
  assert.equal((voices.init.headers as Record<string, string>)["xi-api-key"], "secret");
});

/* ------------------------- handleTts behind real HTTP ----------------------- */

let tmp = "";
let server: http.Server;
let base = "";
const saved = { data: process.env.FRET_DATA_DIR, envFile: process.env.FRET_ENV_FILE };
let originalFetch: typeof fetch;
let t: TestLearner;
const ref = () => ({ userId: t.ctx.user.id, learnerId: t.ctx.learner.id });
const setTtsVoiceId = (ttsVoiceId: string | null) => setListenSettings(ref(), { ttsVoiceId });
const setTtsModelId = (ttsModelId: string) => setListenSettings(ref(), { ttsModelId });
let fetchCalls = 0;

const ALIGNMENT = {
  characters: [..."hi there"],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
};

async function call(method: string, route: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${base}/api/tts${route}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-tts-"));
  process.env.FRET_DATA_DIR = path.join(tmp, "data");
  process.env.FRET_ENV_FILE = path.join(tmp, ".env.local");
  if (!dataDir().startsWith(tmp + path.sep)) throw new Error(`test isolation failed: ${dataDir()} is not under ${tmp}`);
  fs.writeFileSync(path.join(tmp, ".env.local"), "ELEVENLABS_API_KEY=test-key\n");

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = url.toString();
    // Only stand in for the real ElevenLabs calls tts.ts makes; a test's own
    // request to the local throwaway server (below) must reach it for real.
    if (!href.startsWith("https://api.elevenlabs.io/")) return originalFetch(url, init);
    fetchCalls++;
    if (href.includes("/with-timestamps")) {
      return new Response(JSON.stringify({ audio_base64: Buffer.from("fake mp3 bytes").toString("base64"), alignment: ALIGNMENT }), { status: 200 });
    }
    if (href.includes("/v2/voices")) {
      return new Response(JSON.stringify({ voices: [{ voice_id: "v1", name: "Test Voice" }] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  t = await testLearner();
  server = http.createServer(asLearner("/api/tts", handleTts, () => t.ctx));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  try {
    server?.closeAllConnections();
    await Promise.race([new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())), new Promise<void>((resolve) => setTimeout(resolve, 2000).unref())]);
  } finally {
    for (const [key, value] of [["FRET_DATA_DIR", saved.data], ["FRET_ENV_FILE", saved.envFile]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    await t?.close();
  }
});

test("isConfigured reflects whether a key is reachable at all", () => {
  assert.equal(isConfigured(), true);
});

test("POST /speak without a chosen voice refuses with a clear message", async () => {
  await setTtsVoiceId(null);
  const { status, json } = await call("POST", "/speak", { text: "hello" });
  assert.equal(status, 400);
  assert.match((json as { error: string }).error, /choose a voice/i);
});

test("POST /speak rejects a missing or empty text", async () => {
  await setTtsVoiceId("v1");
  const { status } = await call("POST", "/speak", { text: "" });
  assert.equal(status, 400);
});

test("POST /speak calls ElevenLabs once, caches the result, and a repeat play is a cache hit (no second call)", async () => {
  await setTtsVoiceId("v1");
  await setTtsModelId("eleven_v4");
  fetchCalls = 0;
  const first = await call("POST", "/speak", { text: "hi there" });
  assert.equal(first.status, 200);
  const reply1 = first.json as TtsSpeakReply;
  assert.equal(fetchCalls, 1);
  assert.deepEqual(reply1.words.map((w) => w.text), ["hi", "there"]);
  assert.ok(reply1.audioUrl.startsWith("/api/tts/audio/"));

  const second = await call("POST", "/speak", { text: "hi there" });
  assert.equal(second.status, 200);
  assert.equal(fetchCalls, 1, "a second request for the same text/voice/model is served from the cache");
  assert.deepEqual(second.json, reply1);

  const audioRoute = reply1.audioUrl.replace(/^\/api\/tts/, "");
  const audioRes = await fetch(`${base}/api/tts${audioRoute}`);
  assert.equal(audioRes.status, 200);
  assert.equal(audioRes.headers.get("content-type"), "audio/mpeg");
  assert.equal(Buffer.from(await audioRes.arrayBuffer()).toString(), "fake mp3 bytes");
});

test("GET /voices proxies the ElevenLabs catalog", async () => {
  await setTtsVoiceId("v1");
  const { status, json } = await call("GET", "/voices");
  assert.equal(status, 200);
  assert.deepEqual((json as TtsVoicesReply).voices, [{ id: "v1", name: "Test Voice" }]);
});

test("Listen settings belong to the learner: another learner's voice is their own", async () => {
  await setTtsVoiceId("v1");
  const other = await t.other();
  const theirs = { userId: other.user.id, learnerId: other.learner.id };
  assert.equal((await getListenSettings(theirs)).ttsVoiceId, null);
  await setListenSettings(theirs, { ttsVoiceId: "v2", listenMode: true });
  const mine = await getListenSettings(ref());
  assert.deepEqual([mine.ttsVoiceId, mine.listenMode], ["v1", false]);
  // A learner reached through the wrong account is not found, and not written.
  const stray = await setListenSettings({ userId: t.ctx.user.id, learnerId: other.learner.id }, { ttsVoiceId: "v3" });
  assert.equal(stray.ttsVoiceId, null, "reads back as nobody's");
  assert.equal((await getListenSettings(theirs)).ttsVoiceId, "v2");
});

test("GET /audio/<unknown hash>.mp3 is a 404, not a crash", async () => {
  const res = await fetch(`${base}/api/tts/audio/${"0".repeat(64)}.mp3`);
  assert.equal(res.status, 404);
});
