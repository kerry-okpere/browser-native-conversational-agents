import { createStt } from "./pipeline/stt";
import { createLlm } from "./pipeline/llm";
import type { Models, Stage, Tts, WarmUp, WarmUpResult } from "./pipeline/index.type";
import { KokoroTts } from "./pipeline/tts/kokoro.tts";

export function init() {
  // Pipeline stages. Each one shares the same lifecycle (see `Stage`).
  const stt = createStt();
  const llm = createLlm();
  const tts: Tts = new KokoroTts() // PiperTTS can be deployed as TTS variant new PiperTts();

  // Warm up
  // Each stage warms up at page load only if its model is already downloaded,
  // so opening the page never starts a download. Otherwise it loads on first use.
  const warm = async (stage: Stage): Promise<WarmUpResult> => {
    try {
      if (!(await stage.isDownloaded())) return { state: "skipped" };
      const started = performance.now();
      await stage.warmUp();
      return { state: "ready", ms: performance.now() - started };
    } catch (error) {
      return { state: "failed", message: (error as Error).message };
    }
  };

  const warmUp: WarmUp = {
    stt: warm(stt),
    llm: warm(llm),
    tts: warm(tts),
  };

  // Model lifecycle
  const models: Models = {
    freeMemory() {
      stt.destroy();
      llm.destroy();
      tts.destroy();
    },
    async deleteDownloads() {
      // Chrome owns the LLM's model, so a page can only unload it, not delete it.
      llm.destroy();
      await stt.deleteDownloads();
      await tts.deleteDownloads();
    },
  };

  return { stt, llm, tts, models, warmUp };
}
