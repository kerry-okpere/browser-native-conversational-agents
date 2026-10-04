import type { Settle, Tts } from "../index.type";

// Regex to remove emoji so that tts doesn't read emoji (or invisible characters) out by name, so drop
export const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu;

export const cleanForSpeech = (text: string) =>
  text.replace(EMOJI, "").replace(/\s+/g, " ").trim();

/**
 * Base class for text-to-speech engines. Handles worker management, loading model, initiating inference. 
 * A TTS engine implements this class and specifies the worker thread and local of models download
 *
 * TTS engine's worker should use similar worker message:
 *   in:  tts:load, tts:generate { id, data: text }
 *   out: tts:loading { fraction }, tts:ready, tts:complete { id, audio }, tts:error { id?, message }
 */
export abstract class TtsEngine implements Tts {
  /** The engines define createWorker, isDownloaded, deleteFiles in their scope */
  protected abstract createWorker(): Worker;
  abstract isDownloaded(): Promise<boolean>;
  protected abstract deleteFiles(): Promise<void>;

  private worker: Worker | null = null;
  private loading: Promise<void> | null = null;
  private isLoaded = false;
  private onDownloadProgress: ((fraction: number) => void) | undefined;
  private ready: Settle<void> | null = null;
  private nextId = 0;
  private generations = new Map<number, Settle<Blob>>();

  get loaded() {
    return this.isLoaded;
  }

  load(onProgress?: (fraction: number) => void) {
    this.onDownloadProgress = onProgress;
    this.loading ??= new Promise((resolve, reject) => {
      this.ready = { resolve, reject };
      this.getWorker().postMessage({ type: "tts:load" });
    });
    return this.loading;
  }

  async warmUp() {
    await this.load();
    await this.generate("Hi"); // audio is discarded
  }

  async speak(text: string) {
    const speakable = cleanForSpeech(text);
    if (!speakable) return; // nothing left to say, e.g. the text was only emoji

    await this.load();
    const audio = await this.generate(speakable);
    await new Audio(URL.createObjectURL(audio)).play();
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;

    // Anything still in flight will never get a reply.
    const error = new Error("Text-to-speech model was unloaded");
    if (!this.isLoaded) this.ready?.reject(error);
    for (const request of this.generations.values()) request.reject(error);
    this.generations.clear();

    this.loading = null;
    this.ready = null;
    this.isLoaded = false;
  }

  async deleteDownloads() {
    this.destroy(); // the worker may hold the files open
    await this.deleteFiles();
  }

  // Turns text into a WAV blob without playing it.
  private generate(text: string) {
    return new Promise<Blob>((resolve, reject) => {
      const id = this.nextId++;
      this.generations.set(id, { resolve, reject });
      this.getWorker().postMessage({ type: "tts:generate", id, data: text });
    });
  }

  private getWorker() {
    if (this.worker) return this.worker;

    this.worker = this.createWorker();
    this.worker.addEventListener("message", (event: MessageEvent) => {
      const { status, id } = event.data;

      switch (status) {
        case "tts:loading":
          this.onDownloadProgress?.(event.data.fraction);
          break;
        case "tts:ready":
          this.isLoaded = true;
          this.ready?.resolve();
          break;
        case "tts:complete":
          this.generations.get(id)?.resolve(event.data.audio);
          this.generations.delete(id);
          break;
        case "tts:error": {
          const error = new Error(event.data.message);
          if (id === undefined) {
            this.ready?.reject(error);
            this.loading = null; // allow a retry
          } else {
            this.generations.get(id)?.reject(error);
            this.generations.delete(id);
          }
          break;
        }
      }
    });

    return this.worker;
  }
}