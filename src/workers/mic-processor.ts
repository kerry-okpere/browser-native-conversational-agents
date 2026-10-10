// Runs on the audio thread. Collects microphone samples into fixed-size
// frames for voice activity detection.
import { VAD } from "../constants";

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: unknown): void;

class MicProcessor extends AudioWorkletProcessor {
  private frame = new Float32Array(VAD.frame);
  private filled = 0;

  process(inputs: Float32Array[][]) {
    const samples = inputs[0]?.[0];
    if (samples) {
      for (const sample of samples) {
        this.frame[this.filled++] = sample;
        if (this.filled === VAD.frame) {
          this.port.postMessage(this.frame.slice());
          this.filled = 0;
        }
      }
    }
    return true; // keep running
  }
}

registerProcessor("mic-processor", MicProcessor);
