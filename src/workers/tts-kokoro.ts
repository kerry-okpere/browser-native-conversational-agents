import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
// const VOICE = "af_heart";
const VOICE = "af_bella";

let model: Promise<KokoroTTS> | null = null;

// Loads the model once and keeps it in memory; later calls reuse it.
function load() {
  model ??= (async () => {
    // Full precision on the GPU when there is one, a smaller quantized model on the CPU.
    const gpu = await (navigator as any).gpu?.requestAdapter().catch(() => null);

    return KokoroTTS.from_pretrained(MODEL_ID, {
      device: gpu ? "webgpu" : "wasm",
      dtype: gpu ? "fp32" : "q8",
      progress_callback: (info) => {
        // The model file is nearly all of the download, so report on that one.
        if (info.status === "progress" && info.file.endsWith(".onnx")) {
          self.postMessage({
            status: "tts:loading",
            fraction: info.total ? info.loaded / info.total : 0,
          });
        }
      },
    });
  })();

  // Allow a retry if loading failed.
  model.catch(() => {
    model = null;
  });
  return model;
}

async function generate(id: number, text: string) {
  const audio = await (await load()).generate(text, { voice: VOICE });
  self.postMessage({ status: "tts:complete", id, audio: audio.toBlob() });
}

self.addEventListener("message", async (event) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case "tts:load":
        await load();
        self.postMessage({ status: "tts:ready" });
        break;
      case "tts:generate":
        await generate(id, data);
        break;
    }
  } catch (error) {
    self.postMessage({
      status: "tts:error",
      id,
      message: (error as Error).message,
    });
  }
});
