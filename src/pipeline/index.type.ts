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

/** The lifecycle every pipeline stage (VAD, STT, LLM, TTS) shares. */
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
  /** Delete model files left over from a configuration that is no longer used. */
  deleteUnused: () => Promise<void>;
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
  /**
   * Turn text into speech and play it. Calls queue up and play in the order
   * made, so a reply can be sent one sentence at a time. `onStart` fires when
   * this text starts playing; the promise resolves when it has finished
   * playing or was stopped.
   */
  speak: (text: string, onStart?: () => void) => Promise<void>;
  /** Stop whatever is playing and drop anything queued. */
  stop: () => void;
  /** The spectrum of the audio being played, as bands from 0 to 1. */
  bands: () => Float32Array;
  /** Unload the model and delete its downloaded files. */
  deleteDownloads: () => Promise<void>;
};

export type VadHandlers = {
  onSpeechStart: () => void;
  /** `silence` is how long ago, in ms, the speech actually stopped. */
  onSpeechEnd: (audio: Float32Array, silence: number) => void;
  /** The sound was too short to be speech. */
  onSpeechCancel: () => void;
  /**
   * Asked at each short pause, with the turn's audio so far: has the user
   * finished? Without it, the turn ends after a fixed length of silence.
   */
  isTurnComplete?: (audio: Float32Array) => Promise<boolean>;
};

export type Vad = Stage & {
  /** Open the microphone and report speech through `handlers`. */
  listen: (handlers: VadHandlers) => Promise<void>;
  /** Close the microphone. */
  stopListening: () => void;
  /** Ignore the microphone for a while, e.g. while the agent is talking. */
  pause: () => void;
  resume: () => void;
  /** The spectrum of the microphone, as bands from 0 to 1. */
  bands: () => Float32Array;
  /** Unload the model and delete its downloaded files. */
  deleteDownloads: () => Promise<void>;
};

export type TurnCheck = {
  complete: boolean;
  /** How sure the model is, from 0 to 1, that the user has finished. */
  probability: number;
  /** How long the check took. */
  ms: number;
};

export type Turn = Stage & {
  /** Judge from 16 kHz mono samples of the turn so far whether the user has finished. */
  check: (audio: Float32Array) => Promise<TurnCheck>;
  /** Unload the model and delete its downloaded files. */
  deleteDownloads: () => Promise<void>;
};

export type StageName = "vad" | "turn" | "stt" | "llm" | "tts";

/** Where one stage has got to after Start was pressed. */
export type StartUpdate =
  | { state: "downloading"; fraction: number }
  /** Files are on the device; loading into memory and warming up. */
  | { state: "loading" }
  /**
   * `saved` is false when the model could not be stored on the
   * device (the browser's storage limit is too small 306MB), so it will download
   * again after a reload.
   */
  | { state: "ready"; ms: number; saved: boolean }
  | { state: "failed"; message: string };

/**
 * Download (if needed), load and warm up every stage. `onUpdate` reports each
 * stage's progress. Must be called from a click, because Chrome only starts
 * the LLM's download in response to a user gesture.
 */
export type Start = (onUpdate: (stage: StageName, update: StartUpdate) => void) => Promise<void>;

/** How one stage's warm-up at page load went. */
export type WarmUpResult =
  | { state: "ready"; ms: number }
  /** The model isn't downloaded yet, so it will load on first use instead. */
  | { state: "skipped" }
  | { state: "failed"; message: string };

/** One result per pipeline stage; each settles independently. */
export type WarmUp = Record<StageName, Promise<WarmUpResult>>;

export type CallState = "idle" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

/** Something the user said or typed. Durations are ms from the end of their turn. */
export type UserMessage = {
  id: number;
  text: string;
  at: string;
  from: "speech" | "text";
  finalSegment?: number;
  /** How much of `finalSegment` was waiting for silence to confirm the turn had ended. */
  vadWait?: number;
  /** The turn-detection result that ended the turn, if it was the one that ended it. */
  turn?: TurnCheck;
};

/** The agent's reply. It is sent again each time it changes, with the same id. */
export type ReplyMessage = {
  id: number;
  text: string;
  at?: string;
  from: "speech" | "text";
  firstText?: number;
  lastText?: number;
  firstAudio?: number;
  error?: string;
};

export type CallEvents = {
  state: CallState;
  user: UserMessage;
  reply: ReplyMessage;
  /** `recovered` is the number of bytes freed. */
  closed: { recovered: number };
};

export type Call = {
  readonly state: CallState;
  on: <K extends keyof CallEvents>(event: K, handler: (detail: CallEvents[K]) => void) => void;
  /** Open the microphone and start listening. */
  start: () => Promise<void>;
  /** Send a typed message. It interrupts the agent if it is speaking. */
  send: (text: string) => Promise<void>;
  /** Stop listening and speaking, and forget the conversation. */
  end: () => void;
  /** End the call, unload every model and delete the downloaded files. */
  close: () => Promise<void>;
  /** The spectrum of whoever is talking, as bands from 0 to 1. */
  bands: () => Float32Array;
};

export type Settle<T> = { resolve: (value: T) => void; reject: (error: Error) => void };
