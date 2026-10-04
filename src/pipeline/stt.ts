// STT stage
import type { Settle, Stt } from "./index.type";

// Where Transformers.js keeps its downloaded model files.
const CACHE = "transformers-cache";

export function createStt(): Stt {
  // The worker is created on first use so it can be terminated and recreated.
  let worker: Worker | null = null;
  let loading: Promise<void> | null = null;
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;
  let ready: Settle<void> | null = null;
  let nextId = 0;
  const transcriptions = new Map<number, Settle<string>>();

  function getWorker() {
    if (worker) return worker;

    worker = new Worker(
      new URL("../workers/stt.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener("message", (event: MessageEvent) => {
      const { status, id } = event.data;

      switch (status) {
        case "stt:loading":
          onDownloadProgress?.(event.data.percentage / 100);
          break;
        case "stt:ready":
          loaded = true;
          ready?.resolve();
          break;
        case "stt:complete":
          transcriptions.get(id)?.resolve(event.data.text);
          transcriptions.delete(id);
          break;
        case "stt:error": {
          const error = new Error(event.data.message);
          if (id === undefined) {
            ready?.reject(error);
            loading = null; // allow a retry
          } else {
            transcriptions.get(id)?.reject(error);
            transcriptions.delete(id);
          }
          break;
        }
      }
    });

    return worker;
  }

  const load: Stt["load"] = (onProgress) => {
    onDownloadProgress = onProgress;
    loading ??= new Promise((resolve, reject) => {
      ready = { resolve, reject };
      getWorker().postMessage({ type: "stt:load" });
    });
    return loading;
  };

  const destroy = () => {
    worker?.terminate();
    worker = null;

    // Anything still in flight will never get a reply.
    const error = new Error("Speech-to-text model was unloaded");
    if (!loaded) ready?.reject(error);
    for (const request of transcriptions.values()) request.reject(error);
    transcriptions.clear();

    loading = null;
    ready = null;
    loaded = false;
  };

  return {
    get loaded() {
      return loaded;
    },
    isDownloaded: async () =>
      (await caches.has(CACHE)) && (await (await caches.open(CACHE)).keys()).length > 0,
    load,
    // The worker already runs the model once on silence as part of loading.
    warmUp: () => load(),
    transcribe: (audio) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        transcriptions.set(id, { resolve, reject });
        getWorker().postMessage({ type: "stt:generate", id, data: audio });
      }),
    destroy,
    async deleteDownloads() {
      destroy(); // the worker may hold the files open
      await caches.delete(CACHE);
    },
  };
}
