import { AutoModel, Tensor, type ProgressInfo } from "@huggingface/transformers";
import { SAMPLE_RATE, VAD } from "../constants";

const MODEL_ID = "onnx-community/silero-vad";
const toSamples = (ms: number) => (ms / 1000) * SAMPLE_RATE;
const PRE_PAD_FRAMES = Math.ceil(toSamples(VAD.prePad) / VAD.frame);

type Model = (inputs: Record<string, Tensor>) => Promise<Record<string, Tensor>>;
let model: Promise<Model> | null = null;

// The model carries its own memory from one frame to the next.
const sampleRate = new Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);
const freshState = () => new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
let state = freshState();

let speaking = false;
let utterance: Float32Array[] = []; // frames of the turn in progress
let previous: Float32Array[] = []; // the last few frames before speech began
let speechSamples = 0;
let silentSamples = 0;
let turnDetection = false;
let asked = false; // whether the current pause has already been asked about
let pauseId = 0; // identifies the current pause, so a late answer about an older one is ignored

async function probability(frame: Float32Array) {
  const run = await load();
  const { stateN, output } = await run({
    input: new Tensor("float32", frame, [1, frame.length]),
    sr: sampleRate,
    state,
  });
  state = stateN;
  return output.data[0] as number;
}

function load() {
  model ??= (async () => {
    const loaded = (await AutoModel.from_pretrained(MODEL_ID, {
      config: { model_type: "custom" } as any,
      dtype: "fp32",
      progress_callback: (info: ProgressInfo) => {
        if (info.status === "progress_total") {
          self.postMessage({ status: "vad:loading", fraction: info.progress / 100 });
        }
      },
    })) as unknown as Model;

    model = Promise.resolve(loaded);
    await probability(new Float32Array(VAD.frame)); // warm up on silence
    state = freshState();
    return loaded;
  })();

  // Allow a retry if loading failed.
  model.catch(() => {
    model = null;
  });
  return model;
}

function reset() {
  speaking = false;
  utterance = [];
  previous = [];
  speechSamples = 0;
  silentSamples = 0;
  asked = false;
  pauseId++;
  state = freshState();
}

const joined = (frames: Float32Array[]) => {
  const audio = new Float32Array(frames.length * VAD.frame);
  frames.forEach((frame, index) => audio.set(frame, index * VAD.frame));
  return audio;
};

function endTurn() {
  const frames = utterance;
  const silence = silentSamples;
  const hadEnoughSpeech = speechSamples >= toSamples(VAD.minSpeech);

  speaking = false;
  utterance = [];
  speechSamples = 0;
  silentSamples = 0;
  asked = false;
  pauseId++;

  if (!hadEnoughSpeech) {
    self.postMessage({ status: "vad:speech-cancel" });
    return;
  }

  // Drop the trailing silence, except for a short pad.
  const total = frames.length * VAD.frame;
  const keep = Math.min(total, total - silence + toSamples(VAD.postPad));
  const trimmed = joined(frames).slice(0, keep);
  self.postMessage(
    { status: "vad:speech-end", audio: trimmed, silence: (silence / SAMPLE_RATE) * 1000 },
    { transfer: [trimmed.buffer] },
  );
}

async function onFrame(frame: Float32Array) {
  const p = await probability(frame);
  const isSpeech = p > VAD.speechThreshold || (speaking && p >= VAD.exitThreshold);

  if (!speaking) {
    if (isSpeech) {
      speaking = true;
      utterance = [...previous, frame];
      previous = [];
      speechSamples = frame.length;
      silentSamples = 0;
      self.postMessage({ status: "vad:speech-start" });
    } else {
      previous.push(frame);
      if (previous.length > PRE_PAD_FRAMES) previous.shift();
    }
    return;
  }

  utterance.push(frame);
  if (isSpeech) {
    speechSamples += frame.length;
    silentSamples = 0;
    // The user carried on, so any question about the last pause is void.
    asked = false;
    pauseId++;
  } else {
    silentSamples += frame.length;
  }

  if (turnDetection && !asked && silentSamples >= toSamples(VAD.pause)) {
    asked = true;
    if (speechSamples < toSamples(VAD.minSpeech)) {
      endTurn(); // too short to be speech; drop it now
      return;
    }
    const audio = joined(utterance);
    self.postMessage({ status: "vad:pause", pause: pauseId, audio }, { transfer: [audio.buffer] });
  }

  const longestSilence = turnDetection ? VAD.maxSilence : VAD.minSilence;
  const tooLong = utterance.length * VAD.frame >= toSamples(VAD.maxSpeech);
  if (silentSamples >= toSamples(longestSilence) || tooLong) endTurn();
}

// Frames must be processed one at a time and in order.
let queue: Promise<unknown> = Promise.resolve();

self.addEventListener("message", (event) => {
  const { type, data, pause } = event.data;

  queue = queue
    .then(async () => {
      switch (type) {
        case "vad:load":
          await load();
          self.postMessage({ status: "vad:ready" });
          break;
        case "vad:frame":
          await onFrame(data);
          break;
        case "vad:reset":
          reset();
          break;
        case "vad:turn-detection":
          turnDetection = data;
          break;
        case "vad:end-turn":
          // Turn detection says the user has finished, if they haven't spoken since.
          if (speaking && pause === pauseId) endTurn();
          break;
      }
    })
    .catch((error) => {
      self.postMessage({ status: "vad:error", message: (error as Error).message });
    });
});
