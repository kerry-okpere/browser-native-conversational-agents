import { SAMPLE_RATE } from "./constants";

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
