// Ready-made pieces for the codelab, so agent.ts only holds the ideas.
// The models run in Web Workers from src/pipeline and src/workers.
/// <reference types="dom-chromium-ai" />
/// <reference lib="dom.asynciterable" />
import { createStt } from "../pipeline/stt";
import { createVad } from "../pipeline/vad";
import { createTurn } from "../pipeline/turn";
import { KokoroTts } from "../pipeline/tts/kokoro.tts";

/** Whisper: 16 kHz audio in, text out. */
export const stt = createStt();
/** Kokoro: text in, speech out. speak() queues, so sentences play in order. */
export const tts = new KokoroTts();
/** Silero VAD: opens the microphone and says when someone starts and stops talking. */
export const vad = createVad();
/** Smart Turn: listens to a pause and says whether the speaker has finished. */
export const turn = createTurn();

// Whisper writes "[BLANK_AUDIO]" or "(wind blowing)" when it hears no words.
const NOT_SPEECH = /^[[(].*[\])]$/;

/** Turn recorded audio into text. Returns "" when there were no words. */
export async function transcribe(audio: Float32Array) {
  const text = (await stt.transcribe(audio)).trim();
  return NOT_SPEECH.test(text) ? "" : text;
}

const chatEl = () => document.querySelector("#chat")!;

function addLine(className: string, text: string) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  chatEl().prepend(p);
  return p;
}

/** The chat panel on the page. */
export const chat = {
  user: (text: string) => void addLine("user", text),
  /** Adds an agent bubble. Call append() on the result to grow it while streaming. */
  agent(text: string) {
    const p = addLine("agent", text);
    return { append: (chunk: string) => void (p.textContent += chunk) };
  },
  note: (text: string) => void addLine("note", text),
  status: (text: string) => void (document.querySelector("#status")!.textContent = text),
};
