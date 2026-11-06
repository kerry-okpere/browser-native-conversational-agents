// Wires the codelab page to agent.ts. You don't need to change this file.
import { chat, stt, tts, vad, turn } from "./tools";
import { toSamples } from "../helpers";
import { onText, onVoice, startCall } from "./agent";
import type { Stage } from "../pipeline/index.type";

// ---- Models panel ----

const NANO_OPTIONS = { expectedOutputs: [{ type: "text" as const, languages: ["en"] }] };

type Row = { label: string; stage?: Stage };
const rows: Row[] = [
  { label: "Gemini Nano" },
  { label: "Whisper (speech-to-text)", stage: stt },
  { label: "Kokoro (text-to-speech)", stage: tts },
  { label: "Silero (voice detection)", stage: vad },
  { label: "Smart Turn (turn detection)", stage: turn },
];

const list = document.querySelector("#models")!;
const cells = rows.map(({ label }) => {
  const li = document.createElement("li");
  li.innerHTML = `<span>${label}</span><span>Checking…</span>`;
  list.append(li);
  return li.lastElementChild as HTMLElement;
});

function show(i: number, text: string, state?: "ok" | "bad") {
  cells[i].textContent = text;
  cells[i].className = state ?? "";
}

async function nanoAvailability() {
  if (!("LanguageModel" in self)) return "missing";
  return LanguageModel.availability(NANO_OPTIONS);
}

async function prepare(i: number, download: boolean) {
  const { stage } = rows[i];
  try {
    if (!stage) {
      const availability = await nanoAvailability();
      if (availability === "missing") return show(i, "Not in this browser: see the Gemini Nano step", "bad");
      if (availability === "unavailable") return show(i, "This device can't run it: see the Gemini Nano step", "bad");
      if (availability !== "available" && !download) return show(i, "Not downloaded yet");
      // create() downloads the model if needed. It needs a click, which is why there's a button.
      const session = await LanguageModel.create({
        ...NANO_OPTIONS,
        monitor: (m) =>
          m.addEventListener("downloadprogress", (e) => {
            if (e.loaded < 1) show(i, `Downloading… ${Math.round(e.loaded * 100)}%`);
          }),
      });
      session.destroy();
      return show(i, "Ready", "ok");
    }
    const onDevice = await stage.isDownloaded();
    if (!download && !onDevice) return show(i, "Not downloaded yet");
    show(i, "Loading…");
    // Loading from the cache reports progress too; only show real downloads.
    await stage.load((fraction) => {
      if (!onDevice && fraction < 1) show(i, `Downloading… ${Math.round(fraction * 100)}%`);
    });
    show(i, "Loading…");
    await stage.warmUp();
    show(i, "Ready", "ok");
  } catch (error) {
    show(i, `Failed: ${(error as Error).message}`, "bad");
  }
}

// On page load, get ready whatever is already on this device. Nothing new is downloaded.
rows.forEach((_, i) => prepare(i, false));

const download = document.querySelector<HTMLButtonElement>("#download")!;
download.addEventListener("click", async () => {
  download.disabled = true;
  await Promise.all(rows.map((_, i) => prepare(i, true)));
  download.disabled = false;
});

// ---- Talking ----

const report = (error: unknown) => {
  console.error(error);
  chat.status(`Something went wrong: ${(error as Error).message}`);
};

// When a handler adds nothing to the page, the step that builds it isn't on yet.
const count = (selector: string) => document.querySelectorAll(selector).length;
async function run(handler: () => Promise<void>, selector: string, hint: string) {
  const before = count(selector);
  try {
    await handler();
  } catch (error) {
    return report(error);
  }
  if (count(selector) === before) chat.note(hint);
}

document.querySelector("#form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#input")!;
  const text = input.value.trim();
  input.value = "";
  if (text) run(() => onText(text), "#chat .agent", "No reply yet: turn on step 1 in src/codelab/agent.ts");
});

// Hold to talk: record while the button is held, then hand the audio to onVoice().
const hold = document.querySelector<HTMLButtonElement>("#hold")!;
let recorder: MediaRecorder | null = null;

hold.addEventListener("pointerdown", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const parts: Blob[] = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => parts.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      try {
        const audio = await toSamples(new Blob(parts, { type: recorder?.mimeType }));
        chat.note(`Recorded ${(audio.length / 16000).toFixed(1)}s of audio, sent to onVoice()`);
        await run(() => onVoice(audio), "#chat .user", "Nothing was transcribed: turn on step 3, or hold the button a little longer while you talk");
      } catch (error) {
        report(error);
      }
    };
    recorder.start();
    hold.textContent = "Listening… release to send";
  } catch (error) {
    report(error);
  }
});

const release = () => {
  if (recorder?.state !== "recording") return;
  recorder.stop();
  hold.textContent = "Hold to talk";
};
hold.addEventListener("pointerup", release);
hold.addEventListener("pointerleave", release);

// Start call / End call
const callButton = document.querySelector<HTMLButtonElement>("#call")!;
let inCall = false;

callButton.addEventListener("click", async () => {
  if (inCall) {
    vad.stopListening();
    tts.stop();
    inCall = false;
    callButton.textContent = "Start call";
    chat.status("");
    return;
  }
  chat.status("");
  try {
    await startCall();
  } catch (error) {
    return report(error);
  }
  // startCall() sets the status once the microphone is open.
  if (!document.querySelector("#status")!.textContent) {
    chat.note("The call isn't built yet: turn on step 5 in src/codelab/agent.ts");
    return;
  }
  inCall = true;
  callButton.textContent = "End call";
});
