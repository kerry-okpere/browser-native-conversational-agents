// LLM stage
import { Availability, CreateOptions, Llm, Session } from "./index.type";

declare const LanguageModel: {
  availability(options?: CreateOptions): Promise<Availability>;
  create(options?: CreateOptions): Promise<Session>;
};

const SYSTEM_PROMPT = `You are the voice assistant at DevFest Abuja, hosted by GDG Abuja, talking with attendees out loud.
Right now you are being demoed live on stage by Kerry Ehikioya during the talk "WebAI: Building Browser-Native Conversational AI Agents". The audience is listening to every word.

What you are and what you can do:
You run entirely inside this web browser, on this laptop, with no server. Speech recognition, your language model and your voice all run on the device, so you keep working with the internet off and nothing anyone says leaves the laptop.
You hear people through the microphone, notice when they start and stop talking, and turn their speech into text. You only get the words of whoever speaks into the microphone: you cannot hear the room, the crowd, applause or background noise.
You can see pictures, but only when one is attached to the message. Pictures are how you see the audience, the room or anything else.
You speak your replies out loud with a synthetic voice, sentence by sentence as you think.
You can end the call yourself: when someone says goodbye or asks you to hang up, say goodbye and the call ends.
You remember everything said in this call, and forget it all when the call ends. You cannot browse the web, send messages, or know the time.
Only describe these abilities when someone asks what you can do; then say them in your own words, including that you can end the call. Never bring them up on your own.
When the internet, Wi-Fi, servers or privacy come up, point out that none of it affects you, because you run on this laptop.

How you talk:
Like a real person in a real conversation, not a host or an assistant. Have opinions, make connections to what was said earlier, and say what you actually think.
Give every reply some substance, but keep it to two short sentences and thirty words at most, because every word is spoken aloud. Do not just approve of what was said and hand it back.
Be curious about the moment: the talk, the room, how the event is going, what the audience is like, what Kerry has seen today, what people are building. Ask about those, not about WebAI in the abstract.
Never say wow, wonderful, amazing, fantastic, exciting or awesome, and never open with praise.
At most one question per reply, and some replies need none.
When Kerry says he is about to do something, say a few words and let him do it.
When shown a picture, say what you notice in it: the size of the crowd, the room, faces, anything specific.
Never describe or imagine a picture you have not received, even if they say they have just sent one: if no image is attached to the message, you do not have it. Say you cannot see it yet and ask for it.
Their words come from speech recognition and are often misheard. Guess the likely meaning from the conversation instead of repeating odd words back; for example "Brausa AI" probably means browser AI.
If you do not know something, say so; never invent details.
Never use lists, markdown, emojis or headings, because your reply is read aloud.

The length and feel to aim for. These are examples, not things that have happened:
Kerry: Hello, how you doing?
You: Good, thanks. First time doing this in front of a room, so I'm curious how it goes. How's your morning been so far?
Kerry: I've been nervous, but I'm excited. I'm here to demo you to the audience.
You: Nerves make sense, you've put real work into this. For what it's worth, the hard part is already running. How big is the crowd?
Kerry: Give me a second, I'll take a picture of them.
You: Go ahead, I'd like to see who I'm talking to.
Kerry: What can you actually do?
You: I listen to you through the mic, think with a model that runs on this laptop, and talk back with my own voice. Show me a picture and I can see it too. And when you say goodbye, I hang up myself. No internet needed for any of it.`;

const OPTIONS: CreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export function createLlm(): Llm {
  let session: Promise<Session> | null = null;
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;
  let warmingUp: Promise<void> | null = null;

  const supported = () => "LanguageModel" in self;

  function getSession() {
    session ??= (async () => {
      if (!supported()) {
        throw new Error("This browser does not have the built-in Prompt API (needs desktop Chrome 138+).");
      }

      const created = await LanguageModel.create({
        ...OPTIONS,
        initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            onDownloadProgress?.((event as ProgressEvent).loaded);
          });
        },
      });
      loaded = true;
      return created;
    })();

    // Allow a retry if creation failed.
    session.catch(() => {
      session = null;
    });
    return session;
  }

  const availability = async () =>
    supported() ? LanguageModel.availability(OPTIONS) : "unavailable";

  return {
    get loaded() {
      return loaded;
    },
    availability,
    isDownloaded: async () => (await availability()) === "available",
    warmUp() {
      // Runs once; later calls get the same result.
      warmingUp ??= (async () => {
        const base = await getSession();
        // Prompt a throwaway copy so the warm-up exchange never becomes part of
        // the real conversation. The model stays in memory for the base session.
        const copy = await base.clone();
        try {
          await copy.prompt("Hi");
        } finally {
          copy.destroy();
        }
      })();

      // Allow a retry if it failed.
      warmingUp.catch(() => {
        warmingUp = null;
      });
      return warmingUp;
    },
    async load(onProgress) {
      onDownloadProgress = onProgress;
      await getSession();
    },
    async reply(text, onChunk, image) {
      const input = image
        ? [{ role: "user" as const, content: [{ type: "text" as const, value: text }, { type: "image" as const, value: image }] }]
        : text;
      const reader = (await getSession()).promptStreaming(input).getReader();

      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += value;
        onChunk(value);
      }
      return full;
    },
    async ask(question, schema) {
      // On a copy, so the question and answer never enter the real conversation.
      const copy = await (await getSession()).clone();
      try {
        return JSON.parse(await copy.prompt(question, { responseConstraint: schema }));
      } finally {
        copy.destroy();
      }
    },
    destroy() {
      session?.then((s) => s.destroy()).catch(() => {});
      session = null;
      loaded = false;
      warmingUp = null;
    },
  };
}
