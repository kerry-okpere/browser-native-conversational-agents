import type { Progress } from "@diffusionstudio/vits-web";

export type Speak = (
  text: string,
  onProgress?: (progress: Pick<Progress, "loaded" | "total">) => void,
) => Promise<void>;

export function init() {
  // const voiceToText = new Worker(
  //   new URL("./workers/voice-to-text.ts", import.meta.url),
  //   { type: "module" },
  // );

  // voiceToText.addEventListener("message", (event: MessageEvent) => {
  //   console.log("[voice-to-text]", event.data);
  // });

  // voiceToText.postMessage("hello");

  const ttsWorker = new Worker(
    new URL("./workers/tts.ts", import.meta.url),
    { type: "module" },
  );

  let nextId = 0;
  const pending = new Map<number, {
    onProgress?: Parameters<Speak>[1];
    resolve: () => void;
    reject: (error: Error) => void;
  }>();

  ttsWorker.addEventListener("message", (event: MessageEvent) => {
    const { id, type } = event.data;
    const request = pending.get(id);
    if (!request) return;

    if (type === "progress") {
      request.onProgress?.(event.data);
      return;
    }

    pending.delete(id);
    if (type === "audio") {
      new Audio(URL.createObjectURL(event.data.audio)).play();
      request.resolve();
    } else {
      request.reject(new Error(event.data.message));
    }
  });

  const speak: Speak = (text, onProgress) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { onProgress, resolve, reject });
      ttsWorker.postMessage({ id, text });
    });

  return { speak };
}
