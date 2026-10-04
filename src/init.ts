import type { Progress } from "@diffusionstudio/vits-web";

export type Speak = (
  text: string,
  onProgress?: (progress: Pick<Progress, "loaded" | "total">) => void,
) => Promise<void>;

export type Stt = {
  /** Download and warm up the model. Safe to call more than once. */
  load: (onProgress?: (percentage: number) => void) => Promise<void>;
  /** Transcribe 16 kHz mono samples. */
  transcribe: (audio: Float32Array) => Promise<string>;
};

export function init() {
  // TTS Entry
  const ttsWorker = new Worker(
    new URL("./workers/tts.ts", import.meta.url),
    { type: "module" },
  );

  let nextId = 0;
  const pending = new Map<number, {
    onProgress?: Parameters<Speak>[1];
    resolve: () => void;
    reject: (error: Error) => void;
  }>();

  ttsWorker.addEventListener("message", (event: MessageEvent) => {
    const { id, type } = event.data;
    const request = pending.get(id);
    if (!request) return;

    if (type === "tts:progress") {
      request.onProgress?.(event.data);
      return;
    }

    pending.delete(id);
    if (type === "tts:audio") {
      new Audio(URL.createObjectURL(event.data.audio)).play();
      request.resolve();
    } else {
      request.reject(new Error(event.data.message));
    }
  });

  // STT Entry
  const speak: Speak = (text, onProgress) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { onProgress, resolve, reject });
      ttsWorker.postMessage({ id, text });
    });

  const sttWorker = new Worker(
    new URL("./workers/stt.ts", import.meta.url),
    { type: "module" },
  );

  let sttLoading: Promise<void> | null = null;
  let onSttProgress: ((percentage: number) => void) | undefined;
  let sttReady: { resolve: () => void; reject: (error: Error) => void } | null = null;
  const transcriptions = new Map<number, {
    resolve: (text: string) => void;
    reject: (error: Error) => void;
  }>();

  sttWorker.addEventListener("message", (event: MessageEvent) => {
    const { status, id } = event.data;

    switch (status) {
      case "stt:loading":
        onSttProgress?.(event.data.percentage);
        break;
      case "stt:ready":
        sttReady?.resolve();
        break;
      case "stt:complete":
        transcriptions.get(id)?.resolve(event.data.text);
        transcriptions.delete(id);
        break;
      case "stt:error": {
        const error = new Error(event.data.message);
        if (id === undefined) {
          sttReady?.reject(error);
          sttLoading = null; // allow a retry
        } else {
          transcriptions.get(id)?.reject(error);
          transcriptions.delete(id);
        }
        break;
      }
    }
  });

  const stt: Stt = {
    load(onProgress) {
      onSttProgress = onProgress;
      sttLoading ??= new Promise((resolve, reject) => {
        sttReady = { resolve, reject };
        sttWorker.postMessage({ type: "stt:load" });
      });
      return sttLoading;
    },
    transcribe: (audio) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        transcriptions.set(id, { resolve, reject });
        sttWorker.postMessage({ type: "stt:generate", id, data: audio });
      }),
  };

  return { speak, stt };
}
