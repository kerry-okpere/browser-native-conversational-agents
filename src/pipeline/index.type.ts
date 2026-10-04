export type Availability = "unavailable" | "downloadable" | "downloading" | "available";
export type Session = {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): ReadableStream<string>;
  clone(): Promise<Session>;
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
  /**
   * Load the model into memory and run one throwaway prompt, so the first real
   * reply is fast. Only runs if the model is already downloaded (no user
   * gesture needed, no surprise download). Resolves to whether it warmed up.
   * Runs once; calling it again returns the same result.
   */
  warmUp: () => Promise<boolean>;
  /** Send a message; `onChunk` receives the reply piece by piece as it is generated. */
  reply: (text: string, onChunk: (chunk: string) => void) => Promise<string>;
  /** Release the session's memory. The conversation so far is forgotten. */
  destroy: () => void;
};

/** How one stage's warm-up at page load went. */
export type WarmUpResult =
  | { state: "ready"; ms: number }
  /** The model isn't downloaded yet, so it will load on first use instead. */
  | { state: "skipped" }
  | { state: "failed"; message: string };

/** One result per pipeline stage; each settles independently. */
export type WarmUp = Record<"stt" | "llm" | "tts", Promise<WarmUpResult>>;

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


