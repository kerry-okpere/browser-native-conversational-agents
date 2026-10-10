// VAD stage: listens to the microphone and reports when the user speaks.
import type { Settle, Vad, VadHandlers } from "./index.type";
import { SAMPLE_RATE, TRANSFORMERS_CACHE } from "../constants";
import { readBands } from "../helpers";
import { deleteCached, hasCached } from "./cache";
import micProcessorUrl from "../workers/mic-processor.ts?worker&url";

const MODEL = "silero-vad";

export function createVad(): Vad {
  let worker: Worker | null = null;
  let loading: Promise<void> | null = null;
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;
  let ready: Settle<void> | null = null;
  let handlers: VadHandlers | null = null;

  // Microphone
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let paused = false;

  function getWorker() {
    if (worker) return worker;

    worker = new Worker(
      new URL("../workers/vad.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener("error", (event) => {
      if (!loaded) ready?.reject(new Error(event.message || "Voice detection worker crashed"));
      loading = null;
    });

    worker.addEventListener("message", (event: MessageEvent) => {
      const { status } = event.data;

      switch (status) {
        case "vad:loading":
          onDownloadProgress?.(event.data.fraction);
          break;
        case "vad:ready":
          loaded = true;
          ready?.resolve();
          break;
        case "vad:speech-start":
          if (!paused) handlers?.onSpeechStart();
          break;
        case "vad:speech-end":
          if (!paused) handlers?.onSpeechEnd(event.data.audio, event.data.silence);
          break;
        case "vad:pause": {
          const { pause, audio } = event.data;
          if (paused || !handlers?.isTurnComplete) break;
          handlers
            .isTurnComplete(audio)
            .then((complete) => {
              if (complete) worker?.postMessage({ type: "vad:end-turn", pause });
            })
            // If the check fails, the turn still ends after the longest silence.
            .catch((error) => console.error("[turn]", error));
          break;
        }
        case "vad:speech-cancel":
          if (!paused) handlers?.onSpeechCancel();
          break;
        case "vad:error":
          if (!loaded) {
            ready?.reject(new Error(event.data.message));
            loading = null; // allow a retry
          } else {
            console.error("[vad]", event.data.message);
          }
          break;
      }
    });

    return worker;
  }

  const load: Vad["load"] = (onProgress) => {
    onDownloadProgress = onProgress;
    loading ??= new Promise((resolve, reject) => {
      ready = { resolve, reject };
      getWorker().postMessage({ type: "vad:load" });
    });
    return loading;
  };

  const stopListening = () => {
    stream?.getTracks().forEach((track) => track.stop());
    context?.close();
    stream = null;
    context = null;
    analyser = null;
    handlers = null;
    paused = false;
    worker?.postMessage({ type: "vad:reset" });
  };

  const destroy = () => {
    stopListening();
    worker?.terminate();
    worker = null;
    if (!loaded) ready?.reject(new Error("Voice detection model was unloaded"));
    loading = null;
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
    async listen(next) {
      await load();
      stopListening();
      handlers = next;
      getWorker().postMessage({ type: "vad:turn-detection", data: Boolean(next.isTurnComplete) });

      // The browser removes the agent's own voice from the microphone signal.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });

      // The context resamples the microphone to the rate the models expect.
      context = new AudioContext({ sampleRate: SAMPLE_RATE });
      await context.audioWorklet.addModule(micProcessorUrl);

      const source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const frames = new AudioWorkletNode(context, "mic-processor", { numberOfOutputs: 0 });
      source.connect(frames);
      frames.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (paused) return;
        getWorker().postMessage({ type: "vad:frame", data: event.data }, [event.data.buffer]);
      };
    },
    stopListening,
    pause() {
      paused = true;
      worker?.postMessage({ type: "vad:reset" }); // drop any half-heard speech
    },
    resume() {
      paused = false;
    },
    bands: () => readBands(paused ? null : analyser),
    destroy,
    async deleteDownloads() {
      destroy();
      await deleteCached(TRANSFORMERS_CACHE, MODEL);
    },
  };
}
