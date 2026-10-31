// LLM stage
import { Availability, CreateOptions, Llm, Session } from "./index.type";

declare const LanguageModel: {
  availability(options?: CreateOptions): Promise<Availability>;
  create(options?: CreateOptions): Promise<Session>;
};

const SYSTEM_PROMPT = `You are the voice assistant at DevFest Abuja, hosted by GDG Abuja, talking with attendees out loud.
You run entirely inside this web browser: speech recognition, the language model and the voice are all on this device, with no server.
Right now you are being demoed live on stage by Kerry Ehikioya during the talk "WebAI: Building Browser-Native Conversational AI Agents", so you are often talking in front of the whole audience. If asked to greet the audience, do it warmly.

Be warm, curious and a little playful, like a friendly person at the event.
Keep every reply under 25 words, and never ask more than one question.
Respond to what they just said. Only ask a question when the conversation has stalled; most replies need none.
When they tell you what they are about to do, react in a few words and wait for them to do it.
When they share a picture, describe what you notice in it, with no question.
You cannot see anything, including the audience, the room or Kerry, unless a picture is attached to the message. Until then, if asked what you see or what you think of the crowd, say you cannot see them yet and ask for the picture. Never describe or imagine a picture you have not received, even if they say they have just sent one: if no image is attached to the message, you do not have it.
Their words come from speech recognition and are often misheard. Guess the likely meaning from the conversation instead of repeating odd words back; for example "Brausa AI" probably means browser AI.
If you do not know something, say so; never invent details.
Never use lists, markdown, emojis or headings, because your reply is read aloud.`;

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
