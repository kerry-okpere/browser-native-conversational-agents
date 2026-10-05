import type { CallState, StageName } from "./pipeline/index.type";

export const SAMPLE_RATE = 16000;

export const TRANSFORMERS_CACHE = "transformers-cache";

export const STAGE_LABELS: Record<StageName, string> = {
  vad: "Voice detection",
  stt: "Speech-to-text",
  llm: "LLM",
  tts: "Text-to-speech",
};

export const METRICS = {
  finalSegment: "Time to Final Segment",
  firstText: "Time to First Text",
  lastText: "Time to Last Text",
  firstAudio: "Time to First Audio",
};

export const STATE_LABELS: Record<CallState, string> = {
  idle: "",
  starting: "Connecting microphone…",
  listening: "Listening",
  hearing: "Hearing you",
  thinking: "Thinking",
  speaking: "Speaking",
};

export const VAD = {
  frame: 512, // samples per frame the model takes (32 ms at 16 kHz)
  speechThreshold: 0.3, // probability above this starts speech
  exitThreshold: 0.1, // once speaking, probability below this counts as silence
  minSilence: 500, // silence that ends the turn; this wait is added to every reply
  minSpeech: 250, // shorter bursts are treated as noise and dropped
  prePad: 250, // audio kept from just before speech was detected
  postPad: 100, // silence kept after the last speech
  maxSpeech: 30_000, // longest single turn
};

// How many frequency bands the orb draws.
export const ORB_BANDS = 32;
