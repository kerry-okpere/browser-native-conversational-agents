// The live codelab: every step's code box runs right on the page.
/// <reference types="dom-chromium-ai" />
import { chat, transcribe, stt, tts, vad, turn } from "../../src/codelab/tools";
import { toSamples } from "../../src/helpers";
import type { Stage } from "../../src/pipeline/index.type";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// ---- Models box (same as src/codelab/kit.ts) ----

const NANO_OPTIONS = { expectedOutputs: [{ type: "text" as const, languages: ["en"] }] };

const rows: { label: string; stage?: Stage }[] = [
  { label: "Gemini Nano" },
  { label: "Whisper (speech-to-text)", stage: stt },
  { label: "Kokoro (text-to-speech)", stage: tts },
  { label: "Silero (voice detection)", stage: vad },
  { label: "Smart Turn (turn detection)", stage: turn },
];

const cells = rows.map(({ label }) => {
  const li = document.createElement("li");
  li.innerHTML = `<span>${label}</span><span>Checking…</span>`;
  $("#models").append(li);
  return li.lastElementChild as HTMLElement;
});

function show(i: number, text: string, state?: "ok" | "bad") {
  cells[i].textContent = text;
  cells[i].className = state ?? "";
}

async function prepare(i: number, download: boolean) {
  const { stage } = rows[i];
  try {
    if (!stage) {
      if (!("LanguageModel" in self)) return show(i, "Not in this browser: update Chrome to 148 or later", "bad");
      const availability = await LanguageModel.availability(NANO_OPTIONS);
      if (availability === "unavailable") return show(i, "This device can't run it", "bad");
      if (availability !== "available" && !download) return show(i, "Not downloaded yet");
      // create() downloads the model if needed, and needs a click: that's why there's a button.
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
    await stage.load((fraction) => {
      if (!onDevice && fraction < 1) show(i, `Downloading… ${Math.round(fraction * 100)}%`);
    });
    await stage.warmUp();
    show(i, "Ready", "ok");
  } catch (error) {
    show(i, `Failed: ${(error as Error).message}`, "bad");
  }
}

rows.forEach((_, i) => prepare(i, false));

$<HTMLButtonElement>("#download").addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  await Promise.all(rows.map((_, i) => prepare(i, true)));
  button.disabled = false;
});

// ---- Code boxes ----
// In the HTML, "+ " starts a line the attendee turns on and "- " one they turn off.

const comment = (line: string) => line.replace(/^(\s*)/, "$1// ");
const starterOf = (src: string) =>
  src.replace(/^([+-]) (.*)$/gm, (_, mark, rest) => (mark === "+" ? comment(`  ${rest}`) : `  ${rest}`));
const solutionOf = (src: string) =>
  src.replace(/^([+-]) (.*)$/gm, (_, mark, rest) => (mark === "-" ? comment(`  ${rest}`) : `  ${rest}`));

const steps = [...document.querySelectorAll<HTMLElement>(".step")];
const sources = steps.map((step) => step.querySelector(".code")?.textContent?.replace(/^\n+|\s+$/g, ""));

const saved = (i: number) => {
  try {
    return localStorage.getItem(`codelab-step-${i}`);
  } catch {
    return null;
  }
};
const save = (i: number, code: string) => {
  paint();
  try {
    localStorage.setItem(`codelab-step-${i}`, code);
  } catch {
    // private window: edits just aren't remembered
  }
};

const editor = $<HTMLTextAreaElement>("#code");
const highlight = $("#highlight");
const errorBox = $("#error");
let current = 0;

// Colours the code in a layer behind the textarea, whose own text is transparent.
// shortcut: a small regex tokenizer for the code in these steps, not a full JS parser.
const TOKEN =
  /(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*")|\b(const|let|async|await|function|return|if|for|of|while|new|typeof)\b|\b(LanguageModel|chat|tts|vad|turn|transcribe)\b|\b(\d+)\b/g;
const CLASSES = ["c", "s", "k", "g", "n"];
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function paint() {
  const code = editor.value;
  let html = "";
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const kind = match.slice(1).findIndex((group) => group !== undefined);
    html += escape(code.slice(last, match.index)) + `<span class="${CLASSES[kind]}">${escape(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  highlight.innerHTML = html + escape(code.slice(last)) + "\n"; // the extra line keeps a trailing newline visible
}

editor.addEventListener("input", () => save(current, editor.value));
editor.addEventListener("scroll", () => {
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
});

$("#reset").addEventListener("click", () => setCode(starterOf(sources[current]!)));
$("#fill").addEventListener("click", () => setCode(solutionOf(sources[current]!)));

function setCode(code: string) {
  editor.value = code;
  save(current, code);
}

// ⌘/ or Ctrl+/ turns the selected lines on or off. "// STEP" headings are never turned into code.
editor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    runCode();
  } else if (event.key === "Tab") {
    event.preventDefault();
    editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    save(current, editor.value);
  } else if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    toggleComments();
  }
});

function toggleComments() {
  const { value } = editor;
  const start = value.lastIndexOf("\n", editor.selectionStart - 1) + 1;
  let end = value.indexOf("\n", Math.max(editor.selectionEnd - 1, editor.selectionStart));
  if (end === -1) end = value.length;
  const lines = value.slice(start, end).split("\n");

  const isHeading = (line: string) => /^\s*\/\/ STEP/.test(line);
  const isOff = (line: string) => /^\s*\/\//.test(line) && !isHeading(line);
  const turnOn = lines.some(isOff);
  const changed = lines.map((line) => {
    if (turnOn) return isOff(line) ? line.replace(/^(\s*)\/\/ ?/, "$1") : line;
    return line.trim() && !isHeading(line) ? comment(line) : line;
  });

  const text = changed.join("\n");
  editor.setRangeText(text, start, end, "select");
  save(current, editor.value);
}

// ---- Running the code ----

type Agent = {
  onText?: (text: string) => Promise<void>;
  onVoice?: (audio: Float32Array) => Promise<void>;
  startCall?: () => Promise<void>;
};
let agent: Agent | null = null;

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<Agent>;

async function runCode() {
  endCall();
  errorBox.textContent = "";
  const exported = ["onText", "onVoice", "startCall"].map((name) => `${name}: typeof ${name} === "function" ? ${name} : undefined`);
  try {
    const build = new AsyncFunction("chat", "transcribe", "tts", "vad", "turn", `${editor.value}\nreturn { ${exported.join(", ")} };`);
    agent = await build(chat, transcribe, tts, vad, turn);
    chat.note("Your code is running. Talk to the agent.");
  } catch (error) {
    agent = null;
    errorBox.textContent = `Your code has a mistake: ${(error as Error).message}`;
  }
}

$("#run").addEventListener("click", runCode);

const HINT = "Nothing happened: turn on this step's lines (select them, press ⌘/ or Ctrl+/), then press Run";

const report = (error: unknown) => {
  console.error(error);
  chat.status(`Something went wrong: ${(error as Error).message}`);
};

// Calls one of the agent's functions, and gives a hint when it adds nothing to the chat.
async function call(name: keyof Agent, selector: string, ...args: unknown[]) {
  if (!agent) return chat.note("Press Run first, to start the code in the box above");
  const fn = agent[name] as ((...a: unknown[]) => Promise<void>) | undefined;
  if (!fn) return chat.note(`Your code has no ${name}() yet: it arrives in a later step`);
  const before = document.querySelectorAll(selector).length;
  try {
    await fn(...args);
  } catch (error) {
    return report(error);
  }
  if (document.querySelectorAll(selector).length === before) chat.note(HINT);
}

$("#form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>("#input");
  const text = input.value.trim();
  input.value = "";
  if (text) call("onText", "#chat .agent", text);
});

// Hold to talk: record while the button is held, then hand the audio to onVoice().
const hold = $<HTMLButtonElement>("#hold");
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
        await call("onVoice", "#chat .user", audio);
      } catch (error) {
        report(error);
      }
    };
    recorder.start();
    hold.textContent = "Listening… let go to send";
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
const callButton = $<HTMLButtonElement>("#call");
let inCall = false;

function endCall() {
  if (!inCall) return;
  vad.stopListening();
  tts.stop();
  inCall = false;
  callButton.textContent = "Start call";
  chat.status("");
}

callButton.addEventListener("click", async () => {
  if (inCall) return endCall();
  chat.status("");
  await call("startCall", "#status:not(:empty)");
  // startCall() sets the status once the microphone is open.
  if (!$("#status").textContent) return;
  inCall = true;
  callButton.textContent = "End call";
});

// ---- Pages ----

const nav = $("#steps");
steps.forEach((step, i) => {
  const li = document.createElement("li");
  li.textContent = step.dataset.title!;
  li.addEventListener("click", () => go(i));
  nav.append(li);
});

function go(i: number) {
  if (sources[current]) save(current, editor.value);
  endCall();
  agent = null;
  current = i;

  steps.forEach((step, j) => (step.hidden = j !== i));
  [...nav.children].forEach((li, j) => li.classList.toggle("active", j === i));

  const step = steps[i];
  const slot = step.querySelector(".models-slot");
  if (slot) slot.append($("#models-box"));
  $("#models-box").hidden = !slot;

  const source = sources[i];
  $("#agent-box").hidden = !source;
  if (source) {
    step.append($("#agent-box"));
    editor.value = saved(i) ?? starterOf(source);
    paint();
    editor.rows = editor.value.split("\n").length + 1;
    errorBox.textContent = "";
    $("#chat").replaceChildren();
  }

  $<HTMLButtonElement>("#back").disabled = i === 0;
  $<HTMLButtonElement>("#next").disabled = i === steps.length - 1;
  $("#progress").textContent = `${i + 1} of ${steps.length}`;
  history.replaceState(null, "", `#${i + 1}`);
  scrollTo(0, 0);
}

$("#back").addEventListener("click", () => go(current - 1));
$("#next").addEventListener("click", () => go(current + 1));

const fromUrl = () => {
  const i = Number(location.hash.slice(1)) - 1;
  return i >= 0 && i < steps.length ? i : 0;
};
addEventListener("hashchange", () => go(fromUrl()));
go(fromUrl());
