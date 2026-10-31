// The conversation loop: VAD -> STT -> LLM -> TTS, plus typed messages.
import type {
  Call,
  CallEvents,
  CallState,
  Llm,
  ReplyMessage,
  Stt,
  Tts,
  Turn,
  TurnCheck,
  Vad,
} from "./index.type";
import { ORB_BANDS } from "../constants";
import { timestamp } from "../helpers";

// How long to keep ignoring the microphone after the agent stops, so the
// tail of its own voice isn't heard as the user.
const RESUME_DELAY = 250;

// A sentence is finished once its closing punctuation is followed by a space.
// Waiting for the space avoids cutting "3.5" in half mid-stream.
const SENTENCE = /^[\s\S]*?[.!?]+(?=\s)/;

// Whisper marks non-speech with tags like "[BLANK_AUDIO]" or "(wind blowing)".
// What to ask when an image is sent with no words.
const DESCRIBE_IMAGE = "What do you see in this picture?";

const NOT_SPEECH = /^[[(].*[\])]$/;

type Stages = { vad: Vad; turn: Turn; stt: Stt; llm: Llm; tts: Tts };
type Handlers = { [K in keyof CallEvents]: ((detail: CallEvents[K]) => void)[] };

export class VoiceCall implements Call {
  private current: CallState = "idle";
  private handlers: Handlers = { state: [], user: [], reply: [], closed: [] };
  private nextId = 0;
  // Bumped whenever a new turn starts or the call ends, so that work still in
  // flight for an older turn can tell it has been overtaken.
  private turn = 0;
  // The latest answer from turn detection, shown with the message it ended.
  private turnCheck?: TurnCheck;
  private stages: Stages;
  // An image waiting to go out with the next message.
  private image?: Blob;

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
    const { vad, turn, llm } = this.stages;

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
        isTurnComplete: async (audio) => {
          this.turnCheck = await turn.check(audio);
          return this.turnCheck.complete;
        },
      });
    } catch (error) {
      this.setState("idle");
      throw error;
    }

    llm.warmUp().catch(() => {}); // a fresh conversation, ready before the first turn
    this.setState("listening");
  }

  attach(image: Blob | null) {
    this.image = image ?? undefined;
  }

  async send(text: string) {
    const message = text.trim() || (this.image ? DESCRIBE_IMAGE : "");
    if (!message || this.current === "idle" || this.current === "starting") return;

    this.stages.tts.stop(); // typing interrupts the agent
    const turn = ++this.turn;
    const origin = performance.now();
    const image = this.takeImage();

    this.emit("user", { id: this.nextId++, text: message, at: timestamp(), from: "text", image });
    await this.respond(message, origin, "text", turn, image);
  }

  private takeImage() {
    const image = this.image;
    this.image = undefined;
    return image;
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
    const { vad, turn, stt, llm, tts } = this.stages;
    this.end();

    const before = (await navigator.storage.estimate()).usage ?? 0;
    // Chrome owns the LLM's model, so a page can only unload it, not delete it.
    llm.destroy();
    await Promise.all([
      vad.deleteDownloads(),
      turn.deleteDownloads(),
      stt.deleteDownloads(),
      tts.deleteDownloads(),
    ]);
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
    // Only a "finished" answer ended the turn; otherwise it was the long silence.
    const turnCheck = this.turnCheck?.complete ? this.turnCheck : undefined;
    this.turnCheck = undefined;
    this.setState("thinking");

    try {
      const text = (await this.stages.stt.transcribe(audio)).trim();
      if (turn !== this.turn) return;

      if (!text || NOT_SPEECH.test(text)) {
        this.setState("listening");
        return;
      }

      const image = this.takeImage();
      this.emit("user", {
        id: this.nextId++,
        text,
        at: timestamp(),
        from: "speech",
        finalSegment: performance.now() - origin,
        vadWait: silence,
        turn: turnCheck,
        image,
      });
      await this.respond(text, origin, "speech", turn, image);
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
  private async respond(text: string, origin: number, from: "speech" | "text", turn: number, image?: Blob) {
    const { vad, llm, tts } = this.stages;
    const since = () => performance.now() - origin;
    const isCurrent = () => turn === this.turn;

    const reply: ReplyMessage = { id: this.nextId++, text: "", from };
    const update = () => this.emit("reply", { ...reply });

    vad.pause(); // the agent doesn't listen while it is thinking or talking
    this.setState("thinking");

    // Each sentence is spoken as soon as it is complete, while the rest of
    // the reply is still being written.
    let unspoken = "";
    const spoken: Promise<void>[] = [];
    const speak = (sentence: string) => {
      const done = tts
        .speak(sentence, () => {
          if (!isCurrent()) return;
          if (reply.firstAudio === undefined) {
            reply.firstAudio = since();
            update();
          }
          this.setState("speaking");
        })
        // A speech failure shouldn't lose the written reply.
        .catch((error) => console.error("[tts]", error));
      spoken.push(done);
    };

    try {
      const full = await llm.reply(text, (chunk) => {
        if (!isCurrent()) return;
        if (reply.firstText === undefined) {
          reply.firstText = since();
          reply.at = timestamp();
        }
        reply.text += chunk;
        update();

        unspoken += chunk;
        let sentence: RegExpMatchArray | null;
        while ((sentence = unspoken.match(SENTENCE))) {
          speak(sentence[0]);
          unspoken = unspoken.slice(sentence[0].length);
        }
      }, image);
      if (!isCurrent()) return;

      reply.text = full.trim(); // the model sometimes ends with blank lines
      reply.lastText = since();
      update();

      speak(unspoken); // whatever is left once the reply ends
      await Promise.all(spoken);
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
