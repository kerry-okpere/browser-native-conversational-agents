import { TtsEngine } from "./index.tts";

/** Piper voices via @diffusionstudio/vits-web. */
export class PiperTts extends TtsEngine {
  private static FOLDER = "piper";

  protected createWorker() {
    return new Worker(
      new URL("../../workers/tts-piper.ts", import.meta.url),
      { type: "module" },
    );
  }

  async isDownloaded() {
    try {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(PiperTts.FOLDER);
      for await (const name of folder.keys()) {
        if (name.endsWith(".onnx")) return true;
      }
    } catch {
      // no folder yet
    }
    return false;
  }

  protected async deleteFiles() {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(PiperTts.FOLDER, { recursive: true }).catch((error) => {
      if (error.name !== "NotFoundError") throw error;
    });
  }
}
