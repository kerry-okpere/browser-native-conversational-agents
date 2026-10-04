import * as tts from "@diffusionstudio/vits-web";

const VOICE_ID: tts.VoiceId = "en_US-hfc_female-medium";

// Downloads the voice if this device doesn't have it yet.
async function load() {
  if ((await tts.stored()).includes(VOICE_ID)) return;

  await tts.download(VOICE_ID, ({ loaded, total }) => {
    self.postMessage({ status: "tts:loading", fraction: total ? loaded / total : 0 });
  });
}

async function generate(id: number, text: string) {
  const audio = await tts.predict({ text, voiceId: VOICE_ID });
  self.postMessage({ status: "tts:complete", id, audio });
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
