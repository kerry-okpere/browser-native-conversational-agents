import { createStt } from "./pipeline/stt";
import { createLlm } from "./pipeline/llm";
import type { Models, Stage, StageName, Start, Tts, WarmUp, WarmUpResult } from "./pipeline/index.type";
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

  // Start
  // Gets every stage fully ready: downloads what is missing, loads it and warms
  // it up. The stages run in parallel, since their downloads are independent.
  const start: Start = async (onUpdate) => {
    const startStage = async (name: StageName, stage: Stage) => {
      const started = performance.now();
      try {
        const downloaded = await stage.isDownloaded();
        onUpdate(name, downloaded ? { state: "loading" } : { state: "downloading", fraction: 0 });

        await stage.load((fraction) => {
          // Loading from disk can also report progress; only show real downloads.
          if (!downloaded && fraction < 1) onUpdate(name, { state: "downloading", fraction });
        });

        onUpdate(name, { state: "loading" });
        await stage.warmUp();
        const ms = performance.now() - started;
        onUpdate(name, { state: "ready", ms, saved: await stage.isDownloaded() });
      } catch (error) {
        onUpdate(name, { state: "failed", message: (error as Error).message });
      }
    };

    await Promise.all([
      startStage("stt", stt),
      startStage("llm", llm),
      startStage("tts", tts),
    ]);
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

  return { stt, llm, tts, models, warmUp, start };
}
