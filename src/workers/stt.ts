import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import { SAMPLE_RATE } from "../constants";

const MODEL_ID = "Xenova/whisper-tiny";
let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function handleProgress(info: ProgressInfo): void {
  if (info.status === "progress_total") {
    self.postMessage({
      status: "stt:loading",
      percentage: Math.floor(info.progress),
    });
  }
}

// Loads the model once; later calls reuse the same instance.
function load() {
  transcriber ??= (async () => {
    const gpu = await (navigator as any).gpu?.requestAdapter().catch(() => null);

    const asr = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: { encoder_model: gpu ? "webgpu" : "wasm", decoder_model_merged: "wasm" },
      dtype: { encoder_model: gpu ? "fp32" : "q8", decoder_model_merged: "q8" },
      progress_callback: handleProgress,
    });
    // Warm up on one second of silence so the first real request isn't slow.
    await asr(new Float32Array(SAMPLE_RATE));
    return asr;
  })();
  return transcriber;
}

async function generate(id: number, audio: Float32Array) {
  const asr = await load();
  const result = await asr(audio);
  const text = Array.isArray(result) ? result[0].text : result.text;
  self.postMessage({ status: "stt:complete", id, text: text.trim() });
}

self.addEventListener("message", async (event) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case "stt:load":
        await load();
        self.postMessage({ status: "stt:ready" });
        break;
      case "stt:generate":
        await generate(id, data);
        break;
    }
  } catch (error) {
    self.postMessage({
      status: "stt:error",
      id,
      message: (error as Error).message,
    });
  }
});
