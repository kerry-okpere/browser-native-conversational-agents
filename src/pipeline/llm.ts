// LLM stage
import { Availability, CreateOptions, Llm, Session } from "./index.type";

declare const LanguageModel: {
  availability(options?: CreateOptions): Promise<Availability>;
  create(options?: CreateOptions): Promise<Session>;
};

const SYSTEM_PROMPT = `You are a friendly voice assistant having a spoken conversation.
Reply the way a person talks: one or two short, natural sentences.
Never use lists, markdown, emojis, or headings, because your reply is read aloud.
If you need more detail to help, ask one short question.`;

const OPTIONS: CreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export function createLlm(): Llm {
  let session: Promise<Session> | null = null;
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;

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

  return {
    get loaded() {
      return loaded;
    },
    availability: async () => (supported() ? LanguageModel.availability(OPTIONS) : "unavailable"),
    async load(onProgress) {
      onDownloadProgress = onProgress;
      await getSession();
    },
    async reply(text, onChunk) {
      const reader = (await getSession()).promptStreaming(text).getReader();

      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += value;
        onChunk(value);
      }
      return full;
    },
    destroy() {
      session?.then((s) => s.destroy()).catch(() => {});
      session = null;
      loaded = false;
    },
  };
}
