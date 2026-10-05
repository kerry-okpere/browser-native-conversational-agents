import type { StageName } from "./pipeline/index.type";

export const SAMPLE_RATE = 16000;

export const TRANSFORMERS_CACHE = "transformers-cache";

export const STAGE_LABELS: Record<StageName, string> = {
  stt: "Speech-to-text",
  llm: "LLM",
  tts: "Text-to-speech",
};
