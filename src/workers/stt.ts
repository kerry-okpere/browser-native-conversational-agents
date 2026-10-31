import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import { SAMPLE_RATE } from "../constants";

const MODEL_ID = "Xenova/whisper-tiny";
// Keyword boost: Whisper treats this as the text spoken just before the audio, so it
// spells these names the same way. A natural sentence works better than a bare list.
const KEYWORDS = "Welcome to DevFest Abuja, hosted by GDG Abuja. Kerry is giving a talk on WebAI and browser AI, with Gemini nano and WebGPU.";
let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let prompt: number[] = [];

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
    const tokenizer = asr.tokenizer;
    prompt = [
      tokenizer.convert_tokens_to_ids("<|startofprev|>"),
      ...tokenizer.encode(` ${KEYWORDS}`, { add_special_tokens: false }),
      ...tokenizer.convert_tokens_to_ids(["<|startoftranscript|>", "<|en|>", "<|transcribe|>", "<|notimestamps|>"]),
    ];

    // Warm up on one second of silence so the first real request isn't slow.
    await transcribe(asr, new Float32Array(SAMPLE_RATE));
    return asr;
  })();
  return transcriber;
}

// Calls the model directly because the pipeline has no option for a Whisper prompt.
async function transcribe(asr: AutomaticSpeechRecognitionPipeline, audio: Float32Array) {
  const { input_features } = await asr.processor(audio);
  const output = await asr.model.generate({ inputs: input_features, decoder_input_ids: prompt });
  // The output starts with the prompt; decode only what came after it.
  const ids = (output as any).tolist()[0].slice(prompt.length);
  return asr.tokenizer.decode(ids, { skip_special_tokens: true }).trim();
}

async function generate(id: number, audio: Float32Array) {
  const text = await transcribe(await load(), audio);
  self.postMessage({ status: "stt:complete", id, text });
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
