import * as tts from "@diffusionstudio/vits-web";

const VOICE_ID: tts.VoiceId = "en_US-hfc_female-medium";

// Receives { id, text }, replies with progress updates and then a WAV blob.
self.addEventListener("message", async (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;

  try {
    const audio = await tts.predict({ text, voiceId: VOICE_ID }, ({ loaded, total }) => {
      self.postMessage({ id, type: "progress", loaded, total });
    });
    self.postMessage({ id, type: "audio", audio });
  } catch (error) {
    self.postMessage({ id, type: "error", message: (error as Error).message });
  }
});
