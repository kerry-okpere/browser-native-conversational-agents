export type Availability = "unavailable" | "downloadable" | "downloading" | "available";
export type Session = {
  promptStreaming(input: string): ReadableStream<string>;
  destroy(): void;
};

export type CreateOptions = {
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  expectedInputs?: { type: "text"; languages: string[] }[];
  expectedOutputs?: { type: "text"; languages: string[] }[];
  monitor?: (monitor: EventTarget) => void;
};

export type Llm = {
  /** Whether a session is created and ready to answer. */
  readonly loaded: boolean;
  /** Whether Chrome has the model, needs to download it, or can't run it. */
  availability: () => Promise<Availability>;
  /**
   * Create the session, downloading the model first if needed.
   * `onProgress` gets a fraction from 0 to 1. Starting a download requires a
   * user gesture, so call this from a click or submit handler.
   */
  load: (onProgress?: (fraction: number) => void) => Promise<void>;
  /** Send a message; `onChunk` receives the reply piece by piece as it is generated. */
  reply: (text: string, onChunk: (chunk: string) => void) => Promise<string>;
  /** Release the session's memory. The conversation so far is forgotten. */
  destroy: () => void;
};

export type Models = {
  /** Terminate the workers and the LLM session, releasing the RAM/GPU memory they hold. */
  freeMemory: () => void;
  /** Free memory, then delete the downloaded model files from this site's storage. */
  deleteDownloads: () => Promise<void>;
};

export type Stt = {
  /** Whether the model is loaded and warmed up. */
  readonly loaded: boolean;
  /** Download and warm up the model. Safe to call more than once. */
  load: (onProgress?: (percentage: number) => void) => Promise<void>;
  /** Transcribe 16 kHz mono samples. */
  transcribe: (audio: Float32Array) => Promise<string>;
};

import type { Progress } from "@diffusionstudio/vits-web";
export type Settle<T> = { resolve: (value: T) => void; reject: (error: Error) => void };
export type Speak = (
  text: string,
  onProgress?: (progress: Pick<Progress, "loaded" | "total">) => void,
) => Promise<void>;


