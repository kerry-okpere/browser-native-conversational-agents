import { AutoModel, Tensor, WhisperFeatureExtractor, type ProgressInfo } from "@huggingface/transformers";
import { SAMPLE_RATE, TURN } from "../constants";

// Smart Turn: listens to how a sentence was said and judges whether the
// speaker has finished, or has only paused.
const MODEL_ID = "pipecat-ai/smart-turn-v3";
const MODEL_FILE = "smart-turn-v3.2-cpu"; // the small quantized build, made for CPUs
const SAMPLES = TURN.seconds * SAMPLE_RATE;

type Model = (inputs: Record<string, Tensor>) => Promise<Record<string, Tensor>>;
let model: Promise<Model> | null = null;

// The model is built on Whisper's encoder, so it takes the same kind of
// spectrogram, sized for its shorter window.
const extractor = new WhisperFeatureExtractor({
  feature_size: 80,
  sampling_rate: SAMPLE_RATE,
  hop_length: 160,
  n_fft: 400,
  n_samples: SAMPLES,
  nb_max_frames: SAMPLES / 160,
}) as unknown as (audio: Float32Array) => Promise<{ input_features: Tensor }>;

// The model expects exactly its window of audio, ending at the pause: keep the
// most recent part of a long turn, and put silence before a short one. The
// result is scaled to zero mean and unit variance, as in training.
function prepare(audio: Float32Array) {
  const input = new Float32Array(SAMPLES);
  const recent = audio.length > SAMPLES ? audio.subarray(audio.length - SAMPLES) : audio;
  input.set(recent, SAMPLES - recent.length);

  let mean = 0;
  for (const sample of input) mean += sample;
  mean /= SAMPLES;

  let variance = 0;
  for (const sample of input) variance += (sample - mean) ** 2;
  const deviation = Math.sqrt(variance / SAMPLES + 1e-7);

  for (let i = 0; i < SAMPLES; i++) input[i] = (input[i] - mean) / deviation;
  return input;
}

// The probability, from 0 to 1, that the speaker has finished their turn.
async function probability(audio: Float32Array) {
  const run = await load();
  const { input_features } = await extractor(prepare(audio));
  const output = await run({ input_features });
  return Object.values(output)[0].data[0] as number;
}

function load() {
  model ??= (async () => {
    const loaded = (await AutoModel.from_pretrained(MODEL_ID, {
      config: { model_type: "custom" } as any,
      subfolder: "",
      model_file_name: MODEL_FILE,
      dtype: "fp32",
      device: "wasm",
      progress_callback: (info: ProgressInfo) => {
        if (info.status === "progress_total") {
          self.postMessage({ status: "turn:loading", fraction: info.progress / 100 });
        }
      },
    })) as unknown as Model;

    model = Promise.resolve(loaded);
    await probability(new Float32Array(SAMPLE_RATE)); // warm up on silence
    return loaded;
  })();

  // Allow a retry if loading failed.
  model.catch(() => {
    model = null;
  });
  return model;
}

self.addEventListener("message", async (event) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case "turn:load":
        await load();
        self.postMessage({ status: "turn:ready" });
        break;
      case "turn:check": {
        const started = performance.now();
        const result = await probability(data);
        self.postMessage({
          status: "turn:complete",
          id,
          probability: result,
          ms: performance.now() - started,
        });
        break;
      }
    }
  } catch (error) {
    self.postMessage({ status: "turn:error", id, message: (error as Error).message });
  }
});
