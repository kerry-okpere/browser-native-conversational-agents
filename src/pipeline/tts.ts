// TTS stage
import type { Settle, Tts } from "./index.type";

// The folder in the Origin Private File System where Piper keeps its voices.
const FOLDER = "piper";

export function createTts(): Tts {
  // The worker is created on first use so it can be terminated and recreated.
  let worker: Worker | null = null;
  let loading: Promise<void> | null = null;
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;
  let ready: Settle<void> | null = null;
  let nextId = 0;
  const generations = new Map<number, Settle<Blob>>();

  function getWorker() {
    if (worker) return worker;

    worker = new Worker(
      new URL("../workers/tts.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener("message", (event: MessageEvent) => {
      const { status, id } = event.data;

      switch (status) {
        case "tts:loading":
          onDownloadProgress?.(event.data.fraction);
          break;
        case "tts:ready":
          loaded = true;
          ready?.resolve();
          break;
        case "tts:complete":
          generations.get(id)?.resolve(event.data.audio);
          generations.delete(id);
          break;
        case "tts:error": {
          const error = new Error(event.data.message);
          if (id === undefined) {
            ready?.reject(error);
            loading = null; // allow a retry
          } else {
            generations.get(id)?.reject(error);
            generations.delete(id);
          }
          break;
        }
      }
    });

    return worker;
  }

  const load: Tts["load"] = (onProgress) => {
    onDownloadProgress = onProgress;
    loading ??= new Promise((resolve, reject) => {
      ready = { resolve, reject };
      getWorker().postMessage({ type: "tts:load" });
    });
    return loading;
  };

  // Turns text into a WAV blob without playing it.
  const generate = (text: string) =>
    new Promise<Blob>((resolve, reject) => {
      const id = nextId++;
      generations.set(id, { resolve, reject });
      getWorker().postMessage({ type: "tts:generate", id, data: text });
    });

  const destroy = () => {
    worker?.terminate();
    worker = null;

    // Anything still in flight will never get a reply.
    const error = new Error("Text-to-speech model was unloaded");
    if (!loaded) ready?.reject(error);
    for (const request of generations.values()) request.reject(error);
    generations.clear();

    loading = null;
    ready = null;
    loaded = false;
  };

  return {
    get loaded() {
      return loaded;
    },
    async isDownloaded() {
      try {
        const root = await navigator.storage.getDirectory();
        const folder = await root.getDirectoryHandle(FOLDER);
        for await (const name of folder.keys()) {
          if (name.endsWith(".onnx")) return true;
        }
      } catch {
        // no folder yet
      }
      return false;
    },
    load,
    async warmUp() {
      await load();
      await generate("Hi"); // audio is discarded
    },
    async speak(text) {
      await load();
      const audio = await generate(text);
      await new Audio(URL.createObjectURL(audio)).play();
    },
    destroy,
    async deleteDownloads() {
      destroy(); // the worker may hold the files open
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(FOLDER, { recursive: true }).catch((error) => {
        if (error.name !== "NotFoundError") throw error;
      });
    },
  };
}
