// Turn detection stage: decides whether a pause is the end of the user's turn.
import type { Settle, Turn, TurnCheck } from "./index.type";
import { TRANSFORMERS_CACHE, TURN } from "../constants";
import { deleteCached, hasCached } from "./cache";

const MODEL = "smart-turn";

export function createTurn(): Turn {
  let worker: Worker | null = null;
  let loading: Promise<void> | null = null;
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;
  let ready: Settle<void> | null = null;
  let nextId = 0;
  const checks = new Map<number, Settle<TurnCheck>>();

  function fail(error: Error) {
    if (!loaded) ready?.reject(error);
    loading = null;
    for (const check of checks.values()) check.reject(error);
    checks.clear();
  }

  function getWorker() {
    if (worker) return worker;

    worker = new Worker(
      new URL("../workers/turn.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener("error", (event) => {
      fail(new Error(event.message || "Turn detection worker crashed"));
    });

    worker.addEventListener("message", (event: MessageEvent) => {
      const { status, id } = event.data;

      switch (status) {
        case "turn:loading":
          onDownloadProgress?.(event.data.fraction);
          break;
        case "turn:ready":
          loaded = true;
          ready?.resolve();
          break;
        case "turn:complete": {
          const { probability, ms } = event.data;
          checks.get(id)?.resolve({ complete: probability > TURN.threshold, probability, ms });
          checks.delete(id);
          break;
        }
        case "turn:error": {
          const error = new Error(event.data.message);
          if (id === undefined) {
            ready?.reject(error);
            loading = null; // allow a retry
          } else {
            checks.get(id)?.reject(error);
            checks.delete(id);
          }
          break;
        }
      }
    });

    return worker;
  }

  const load: Turn["load"] = (onProgress) => {
    onDownloadProgress = onProgress;
    loading ??= new Promise((resolve, reject) => {
      ready = { resolve, reject };
      getWorker().postMessage({ type: "turn:load" });
    });
    return loading;
  };

  const destroy = () => {
    worker?.terminate();
    worker = null;
    fail(new Error("Turn detection model was unloaded"));
    ready = null;
    loaded = false;
  };

  return {
    get loaded() {
      return loaded;
    },
    isDownloaded: () => hasCached(TRANSFORMERS_CACHE, MODEL),
    load,
    // The worker already runs the model once on silence as part of loading.
    warmUp: () => load(),
    check: (audio) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        checks.set(id, { resolve, reject });
        getWorker().postMessage({ type: "turn:check", id, data: audio });
      }),
    destroy,
    async deleteDownloads() {
      destroy();
      await deleteCached(TRANSFORMERS_CACHE, MODEL);
    },
  };
}
