import type { CallState, StageName } from "./pipeline/index.type";

// The event the agent is at. The prompt, the speech keywords and the header use these.
export const CITY = "Lagos";
export const EVENT = `DevFest ${CITY}`;
export const HOST = `GDG ${CITY}`;
export const TALK = "WebAI";

export const SAMPLE_RATE = 16000;

export const TRANSFORMERS_CACHE = "transformers-cache";

export const STAGE_LABELS: Record<StageName, string> = {
  vad: "Voice detection",
  turn: "Turn detection",
  stt: "Speech to text",
  llm: "Gemma 4",
  tts: "Voice",
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
  ended: "Call ended",
};

// A line under the state, for whoever is on the mic.
export const STATE_HINTS: Record<CallState, string> = {
  idle: "",
  starting: "Opening the microphone…",
  listening: "Say something, or type on the right",
  hearing: "Go on, I'm listening",
  thinking: "Working on a reply",
  speaking: "",
  ended: "",
};

export const VAD = {
  frame: 512, // samples per frame the model takes (32 ms at 16 kHz)
  speechThreshold: 0.3, // probability above this starts speech
  exitThreshold: 0.1, // once speaking, probability below this counts as silence
  pause: 200, // silence after which turn detection is asked whether the user has finished
  minSilence: 500, // silence that ends the turn when there is no turn detection
  maxSilence: 2500, // silence that ends the turn even if turn detection says "not finished"
  minSpeech: 250, // shorter bursts are treated as noise and dropped
  prePad: 250, // audio kept from just before speech was detected
  postPad: 100, // silence kept after the last speech
  maxSpeech: 30_000, // longest single turn
};

export const TURN = {
  seconds: 8, // how much of the end of the turn the model listens to
  threshold: 0.5, // probability above this means the user has finished
};

// How many frequency bands the orb draws.
export const ORB_BANDS = 32;

// The link the agent shows as a QR code on request: where this app will live once deployed.
export const QR_URL = "https://kerry-okpere.github.io/browser-native-conversational-agents/";

// LiteRT-LM: the Gemma 4 web build, kept in Cache Storage after the first download.
export const LITERT_CACHE = "litert-lm-cache";
export const LITERT_MODEL_URL =
  "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-gpu.litertlm";
