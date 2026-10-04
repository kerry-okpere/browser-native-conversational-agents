import { TRANSFORMERS_CACHE, deleteCached, hasCached } from "../cache";
import { TtsEngine } from "./index.tts";

/** Kokoro-82M via kokoro-js. Uses WebGPU when available. */
export class KokoroTts extends TtsEngine {
  private static MODEL = "Kokoro-82M";
  private static VOICES_CACHE = "kokoro-voices";

  protected createWorker() {
    return new Worker(
      new URL("../workers/tts-kokoro.ts", import.meta.url),
      { type: "module" },
    );
  }

  isDownloaded() {
    return hasCached(TRANSFORMERS_CACHE, KokoroTts.MODEL);
  }

  protected async deleteFiles() {
    await deleteCached(TRANSFORMERS_CACHE, KokoroTts.MODEL);
    await caches.delete(KokoroTts.VOICES_CACHE);
  }
}
