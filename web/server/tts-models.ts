// The ElevenLabs synthesis models offered in the voice picker, and the
// voice/model validation shared by the settings store and the TTS route.
// Split out from tts.ts so store.ts (which validates a stored voice/model
// choice) and tts.ts (which calls the API) can both depend on this without
// importing each other.

export interface TtsModelInfo {
  id: string;
  label: string;
  note: string;
}

export const ELEVEN_MODELS: TtsModelInfo[] = [
  { id: "eleven_v4", label: "Eleven v4", note: "best quality and accent, the default" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5", note: "fastest, about half the price" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2", note: "previous generation" },
  { id: "eleven_v3", label: "Eleven v3", note: "previous generation, expressive" },
];

export const DEFAULT_ELEVEN_MODEL = "eleven_v4";

export function isElevenModel(id: unknown): id is string {
  return typeof id === "string" && ELEVEN_MODELS.some((m) => m.id === id);
}
