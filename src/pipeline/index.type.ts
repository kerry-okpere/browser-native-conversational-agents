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

/** The lifecycle every pipeline stage (STT, LLM, TTS) shares. */
export type Stage = {
  /** Whether the model is in memory and ready to use. */
  readonly loaded: boolean;
  /** Whether the model files are already on this device, so loading needs no download. */
  isDownloaded: () => Promise<boolean>;
  /**
   * Download the model if needed and load it into memory. `onProgress` gets
   * the download as a fraction from 0 to 1. Safe to call more than once.
   */
  load: (onProgress?: (fraction: number) => void) => Promise<void>;
  /** Load, then run once on throwaway input so the first real use is fast. */
  warmUp: () => Promise<void>;
  /** Release the memory the model holds. It loads again on next use. */
  destroy: () => void;
};

export type Stt = Stage & {
  /** Transcribe 16 kHz mono samples. */
  transcribe: (audio: Float32Array) => Promise<string>;
  /** Unload the model and delete its downloaded files. */
  deleteDownloads: () => Promise<void>;
};

export type Llm = Stage & {
  /**
   * Whether Chrome has the model, needs to download it, or can't run it.
   * Starting a download requires a user gesture, so when this isn't
   * "available", call `load` from a click or submit handler.
   */
  availability: () => Promise<Availability>;
  /** Send a message; `onChunk` receives the reply piece by piece as it is generated. */
  reply: (text: string, onChunk: (chunk: string) => void) => Promise<string>;
};

export type Tts = Stage & {
  /** Turn text into speech and play it. */
  speak: (text: string) => Promise<void>;
  /** Unload the model and delete its downloaded files. */
  deleteDownloads: () => Promise<void>;
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
  /** Unload every stage, releasing the RAM/GPU memory the models hold. */
  freeMemory: () => void;
  /** Free memory, then delete the downloaded model files from this site's storage. */
  deleteDownloads: () => Promise<void>;
};

export type Settle<T> = { resolve: (value: T) => void; reject: (error: Error) => void };
