import { ORB_BANDS, SAMPLE_RATE } from "./constants";

export const toSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export const toMB = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const timestamp = () => new Date().toLocaleTimeString([], { hour12: false });

/** Decode a recording into the mono samples the speech-to-text model expects. */
export async function toSamples(recording: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(await recording.arrayBuffer());
    return buffer.getChannelData(0);
  } finally {
    await context.close();
  }
}

/**
 * Read an analyser's spectrum as a few bands from 0 to 1. Only the lower
 * half of the spectrum is used, which is where voice energy sits.
 */
export function readBands(analyser: AnalyserNode | null, count = ORB_BANDS): Float32Array {
  const bands = new Float32Array(count);
  if (!analyser) return bands;

  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);

  const size = Math.max(1, Math.floor(bins.length / 2 / count));
  for (let band = 0; band < count; band++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += bins[band * size + i] ?? 0;
    bands[band] = sum / size / 255;
  }
  return bands;
}
