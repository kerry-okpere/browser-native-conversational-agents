// The one file you change in the codelab. Each step turns on one layer of the agent.
// Lost? See the finished version in agent.done.ts.
import { chat, transcribe, tts, vad, turn } from "./tools";

// ─── STEP 1 · Ask Gemini Nano ────────────────────────────────────────────
// Gemini Nano is built into Chrome. LanguageModel.create() opens a session
// on it: no API key, no server. The system prompt is written for speech.

const SYSTEM_PROMPT = `You are a friendly voice assistant.
Reply the way a person talks: one or two short sentences.
Never use lists, markdown or emojis, because your reply is read aloud.`;

let session: LanguageModel | undefined;

async function getSession() {
  if (!session) {
    session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
  }
  return session;
}

/** Runs when you press Send. */
export async function onText(text: string) {
  chat.user(text);

  // STEP 1 · one question, one answer: uncomment the next two lines
  const answer = await (await getSession()).prompt(text);
  chat.agent(answer);

  // STEP 2 · hear the answer: uncomment the next line
  // await tts.speak(answer);

  // STEP 4 · real time: comment out the step 1 and 2 lines above, then uncomment the next line
  // await replyInRealTime(text);
}

// ─── STEP 3 · Speak instead of typing ────────────────────────────────────
// The page records while you hold the button and passes the audio here.
// Whisper turns it into text, and the text goes down the same path as typing.

/** Runs when you release Hold to talk, and (from step 5) when the VAD hears you stop. */
export async function onVoice(audio: Float32Array) {
  // STEP 3 · uncomment the next two lines
  // const text = await transcribe(audio);
  // if (text) await onText(text);
}

// ─── STEP 4 · Real time: speak while it is still thinking ────────────────
// promptStreaming() hands over the reply a few words at a time. As soon as a
// whole sentence has arrived it goes to Kokoro, so the agent starts talking
// before the model has finished writing.

// A sentence is finished once its . ! or ? is followed by a space ("3.5" is not cut in half).
const SENTENCE = /^[\s\S]*?[.!?]+(?=\s)/;

async function replyInRealTime(text: string) {
  const bubble = chat.agent("");
  const spoken: Promise<void>[] = [];
  let unspoken = "";

  vad.pause(); // STEP 5 · don't listen while the agent talks

  const stream = (await getSession()).promptStreaming(text);
  for await (const chunk of stream) {
    bubble.append(chunk);
    unspoken += chunk;

    let sentence;
    while ((sentence = unspoken.match(SENTENCE))) {
      spoken.push(tts.speak(sentence[0]));
      unspoken = unspoken.slice(sentence[0].length);
    }
  }
  spoken.push(tts.speak(unspoken)); // whatever is left at the end
  await Promise.all(spoken);

  vad.resume(); // STEP 5 · listen again
}

// ─── STEP 5 · Hands-free with voice activity detection (VAD) ─────────────
// No more button. Silero VAD scores every 32 ms of microphone audio for speech
// and calls these handlers when you start talking and when you stop.

/** Runs when you press Start call. */
export async function startCall() {
  // STEP 5 · uncomment from here to the end of the function
  // await vad.listen({
  //   onSpeechStart: () => chat.status("Hearing you…"),
  //   onSpeechEnd: (audio) => {
  //     chat.status("Thinking…");
  //     onVoice(audio).finally(() => chat.status("Listening"));
  //   },
  //   onSpeechCancel: () => chat.status("Listening"), // a cough or a click, not speech
  //
  //   // STEP 6 · turn detection: uncomment these five lines
  //   // isTurnComplete: async (audio) => {
  //   //   const { complete, probability } = await turn.check(audio);
  //   //   chat.note(`Turn detection: ${Math.round(probability * 100)}% sure you've finished`);
  //   //   return complete;
  //   // },
  // });
  // chat.status("Listening");
}
