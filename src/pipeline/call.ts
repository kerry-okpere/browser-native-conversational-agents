// The conversation loop: VAD -> STT -> LLM -> TTS, plus typed messages.
import type {
  Call,
  CallEvents,
  CallState,
  Llm,
  ReplyMessage,
  Stt,
  Tts,
  Vad,
} from "./index.type";
import { ORB_BANDS } from "../constants";
import { timestamp } from "../helpers";

// How long to keep ignoring the microphone after the agent stops, so the
// tail of its own voice isn't heard as the user.
const RESUME_DELAY = 250;

// Whisper marks non-speech with tags like "[BLANK_AUDIO]" or "(wind blowing)".
const NOT_SPEECH = /^[[(].*[\])]$/;

type Stages = { vad: Vad; stt: Stt; llm: Llm; tts: Tts };
type Handlers = { [K in keyof CallEvents]: ((detail: CallEvents[K]) => void)[] };

export class VoiceCall implements Call {
  private current: CallState = "idle";
  private handlers: Handlers = { state: [], user: [], reply: [], closed: [] };
  private nextId = 0;
  // Bumped whenever a new turn starts or the call ends, so that work still in
  // flight for an older turn can tell it has been overtaken.
  private turn = 0;
  private stages: Stages;

  constructor(stages: Stages) {
    this.stages = stages;
  }

  get state() {
    return this.current;
  }

  on<K extends keyof CallEvents>(event: K, handler: (detail: CallEvents[K]) => void) {
    this.handlers[event].push(handler);
  }

  async start() {
    if (this.current !== "idle") return;
    const { vad, llm } = this.stages;

    this.setState("starting");
    try {
      await vad.listen({
        onSpeechStart: () => {
          if (this.current === "listening") this.setState("hearing");
        },
        onSpeechCancel: () => {
          if (this.current === "hearing") this.setState("listening");
        },
        onSpeechEnd: (audio, silence) => this.onSpeech(audio, silence),
      });
    } catch (error) {
      this.setState("idle");
      throw error;
    }

    llm.warmUp().catch(() => {}); // a fresh conversation, ready before the first turn
    this.setState("listening");
  }

  async send(text: string) {
    const message = text.trim();
    if (!message || this.current === "idle" || this.current === "starting") return;

    this.stages.tts.stop(); // typing interrupts the agent
    const turn = ++this.turn;
    const origin = performance.now();

    this.emit("user", { id: this.nextId++, text: message, at: timestamp(), from: "text" });
    await this.respond(message, origin, "text", turn);
  }

  end() {
    if (this.current === "idle") return;
    const { vad, llm, tts } = this.stages;

    this.turn++;
    vad.stopListening();
    tts.stop();
    llm.destroy(); // the next call starts a new conversation
    this.setState("idle");
  }

  async close() {
    const { vad, stt, llm, tts } = this.stages;
    this.end();

    const before = (await navigator.storage.estimate()).usage ?? 0;
    // Chrome owns the LLM's model, so a page can only unload it, not delete it.
    llm.destroy();
    await Promise.all([vad.deleteDownloads(), stt.deleteDownloads(), tts.deleteDownloads()]);
    const after = (await navigator.storage.estimate()).usage ?? 0;

    this.emit("closed", { recovered: Math.max(0, before - after) });
  }

  bands() {
    const { vad, tts } = this.stages;
    if (this.current === "speaking") return tts.bands();
    if (this.current === "listening" || this.current === "hearing") return vad.bands();
    return new Float32Array(ORB_BANDS);
  }

  // The user finished speaking. `silence` is how long ago that really was:
  // detection waits for a pause before it is sure the turn is over.
  private async onSpeech(audio: Float32Array, silence: number) {
    if (this.current !== "hearing") return;

    const turn = ++this.turn;
    const origin = performance.now() - silence;
    this.setState("thinking");

    try {
      const text = (await this.stages.stt.transcribe(audio)).trim();
      if (turn !== this.turn) return;

      if (!text || NOT_SPEECH.test(text)) {
        this.setState("listening");
        return;
      }

      this.emit("user", {
        id: this.nextId++,
        text,
        at: timestamp(),
        from: "speech",
        finalSegment: performance.now() - origin,
        vadWait: silence,
      });
      await this.respond(text, origin, "speech", turn);
    } catch (error) {
      if (turn !== this.turn) return;
      this.emit("reply", {
        id: this.nextId++,
        text: "",
        from: "speech",
        error: (error as Error).message,
      });
      this.setState("listening");
    }
  }

  // Gets the reply and speaks it. Every duration is measured from `origin`,
  // the end of the user's turn.
  private async respond(text: string, origin: number, from: "speech" | "text", turn: number) {
    const { vad, llm, tts } = this.stages;
    const since = () => performance.now() - origin;
    const isCurrent = () => turn === this.turn;

    const reply: ReplyMessage = { id: this.nextId++, text: "", from };
    const update = () => this.emit("reply", { ...reply });

    vad.pause(); // the agent doesn't listen while it is thinking or talking
    this.setState("thinking");

    try {
      const full = await llm.reply(text, (chunk) => {
        if (!isCurrent()) return;
        if (reply.firstText === undefined) {
          reply.firstText = since();
          reply.at = timestamp();
        }
        reply.text += chunk;
        update();
      });
      if (!isCurrent()) return;

      reply.text = full.trim(); // the model sometimes ends with blank lines
      reply.lastText = since();
      update();

      this.setState("speaking");
      await tts.speak(reply.text, () => {
        if (!isCurrent()) return;
        reply.firstAudio = since();
        update();
      });
    } catch (error) {
      if (!isCurrent()) return;
      reply.error = (error as Error).message;
      update();
    }

    if (!isCurrent()) return;
    this.setState("listening");
    setTimeout(() => {
      if (isCurrent()) vad.resume();
    }, RESUME_DELAY);
  }

  private setState(state: CallState) {
    if (state === this.current) return;
    this.current = state;
    this.emit("state", state);
  }

  private emit<K extends keyof CallEvents>(event: K, detail: CallEvents[K]) {
    for (const handler of this.handlers[event]) handler(detail);
  }
}
