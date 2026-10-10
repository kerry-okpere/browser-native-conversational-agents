import { createVad } from "./pipeline/vad";
import { createTurn } from "./pipeline/turn";
import { createStt } from "./pipeline/stt";
import { createLlm } from "./pipeline/llm";
import { KokoroTts } from "./pipeline/tts/kokoro.tts";
import { PiperTts } from "./pipeline/tts/piper.tts";
import { VoiceCall } from "./pipeline/call";
import type { Stage, StageName, Start, Tts, WarmUp, WarmUpResult } from "./pipeline/index.type";

export function init() {
  // Pipeline stages. Each one shares the same lifecycle (see `Stage`).
  const vad = createVad();
  const turn = createTurn();
  const stt = createStt();
  const llm = createLlm();
  const tts: Tts = new KokoroTts() // PiperTTS can be deployed as TTS variant new PiperTts();

  const stages: Record<StageName, Stage> = { vad, turn, stt, llm, tts };
  const names = Object.keys(stages) as StageName[];

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

  const warmUp = Object.fromEntries(names.map((name) => [name, warm(stages[name])])) as WarmUp;

  // Storage held by models that are no longer used: the TTS engine that isn't
  // selected, and files from an older STT configuration.
  const deleteUnused = async () => {
    const otherTts = tts instanceof KokoroTts ? new PiperTts() : new KokoroTts();
    await Promise.all([otherTts.deleteDownloads(), stt.deleteUnused()]);
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

    // Make room first, so new downloads fit in the site's storage quota.
    await deleteUnused().catch((error) => console.error("[storage]", error));
    await Promise.all(names.map((name) => startStage(name, stages[name])));
  };

  // The conversation: VAD -> STT -> LLM -> TTS
  const call = new VoiceCall({ vad, turn, stt, llm, tts });

  return { call, warmUp, start };
}
