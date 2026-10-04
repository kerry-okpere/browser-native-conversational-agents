import { createLlm } from "./pipeline/llm";
import { Stt, Settle, Speak, Models, WarmUp, WarmUpResult } from "./pipeline/index.type";

export function init() {
  let nextId = 0;

  // TTS Entry
  // Workers are created on first use so they can be terminated and recreated.
  let ttsWorker: Worker | null = null;
  const pending = new Map<number, Settle<void> & {
    onProgress?: Parameters<Speak>[1];
    silent?: boolean; // generate the audio but don't play it (used to warm up)
  }>();

  function getTtsWorker() {
    if (ttsWorker) return ttsWorker;

    ttsWorker = new Worker(
      new URL("./workers/tts.ts", import.meta.url),
      { type: "module" },
    );

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
        if (!request.silent) new Audio(URL.createObjectURL(event.data.audio)).play();
        request.resolve();
      } else {
        request.reject(new Error(event.data.message));
      }
    });

    return ttsWorker;
  }

  const synthesize = (text: string, options: { onProgress?: Parameters<Speak>[1]; silent?: boolean } = {}) =>
    new Promise<void>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { ...options, resolve, reject });
      getTtsWorker().postMessage({ id, text });
    });

  const speak: Speak = (text, onProgress) => synthesize(text, { onProgress });

  // STT Entry
  let sttWorker: Worker | null = null;
  let sttLoading: Promise<void> | null = null;
  let sttLoaded = false;
  let onSttProgress: ((percentage: number) => void) | undefined;
  let sttReady: Settle<void> | null = null;
  const transcriptions = new Map<number, Settle<string>>();

  function getSttWorker() {
    if (sttWorker) return sttWorker;

    sttWorker = new Worker(
      new URL("./workers/stt.ts", import.meta.url),
      { type: "module" },
    );

    sttWorker.addEventListener("message", (event: MessageEvent) => {
      const { status, id } = event.data;

      switch (status) {
        case "stt:loading":
          onSttProgress?.(event.data.percentage);
          break;
        case "stt:ready":
          sttLoaded = true;
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

    return sttWorker;
  }

  const stt: Stt = {
    get loaded() {
      return sttLoaded;
    },
    load(onProgress) {
      onSttProgress = onProgress;
      sttLoading ??= new Promise((resolve, reject) => {
        sttReady = { resolve, reject };
        getSttWorker().postMessage({ type: "stt:load" });
      });
      return sttLoading;
    },
    transcribe: (audio) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        transcriptions.set(id, { resolve, reject });
        getSttWorker().postMessage({ type: "stt:generate", id, data: audio });
      }),
  };

  // LLM Entry
  const llm = createLlm();

  // Warm up
  // Each stage warms up at page load only if its model is already downloaded,
  const isSttDownloaded = async () =>
    (await caches.has("transformers-cache")) &&
    (await (await caches.open("transformers-cache")).keys()).length > 0;

  const isTtsDownloaded = async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const piper = await root.getDirectoryHandle("piper");
      for await (const name of piper.keys()) {
        if (name.endsWith(".onnx")) return true;
      }
    } catch {
      // no "piper" folder yet
    }
    return false;
  };

  const warm = async (
    isDownloaded: () => Promise<boolean>,
    run: () => Promise<unknown>,
  ): Promise<WarmUpResult> => {
    try {
      if (!(await isDownloaded())) return { state: "skipped" };
      const started = performance.now();
      await run();
      return { state: "ready", ms: performance.now() - started };
    } catch (error) {
      return { state: "failed", message: (error as Error).message };
    }
  };

  const warmUp: WarmUp = {
    stt: warm(isSttDownloaded, () => stt.load()),
    llm: warm(async () => (await llm.availability()) === "available", () => llm.warmUp()),
    tts: warm(isTtsDownloaded, () => synthesize("Hi", { silent: true })),
  };

  // Model lifecycle
  const models: Models = {
    freeMemory() {
      ttsWorker?.terminate();
      sttWorker?.terminate();
      ttsWorker = null;
      sttWorker = null;
      llm.destroy();

      // Anything still in flight will never get a reply.
      const error = new Error("Models were unloaded");
      for (const request of pending.values()) request.reject(error);
      for (const request of transcriptions.values()) request.reject(error);
      if (!sttLoaded) sttReady?.reject(error);
      pending.clear();
      transcriptions.clear();

      sttLoading = null;
      sttReady = null;
      sttLoaded = false;
    },
    
    async deleteDownloads() {
      models.freeMemory(); // workers may hold the files open

      // Transformers.js (STT) keeps its files in Cache Storage.
      await caches.delete("transformers-cache");

      // Piper (TTS) keeps its files in a "piper" folder in OPFS.
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("piper", { recursive: true }).catch((error) => {
        if (error.name !== "NotFoundError") throw error;
      });
    },
  };

  return { speak, stt, llm, models, warmUp };
}
