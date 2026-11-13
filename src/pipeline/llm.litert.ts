// LLM stage on LiteRT-LM: Gemma 4 running on WebGPU in the page, instead of Chrome's built-in model.
import { AutoToolChat, Backend, Engine, SamplerType, type ChatInterface, type Conversation, type JsonValue, type Message, type Schema } from "@litert-lm/core";
import type { Llm, Tool, ToolCall } from "./index.type";
import { LITERT_CACHE, LITERT_MODEL_URL } from "../constants";
import { SYSTEM_PROMPT } from "./llm";

// shortcut: the WASM runtime loads from jsdelivr, so the first page load needs internet;
// self-host node_modules/@litert-lm/core/wasm with loadLiteRtLm() when the demo must run offline.
const ENGINE = {
  visionBackend: Backend.GPU,
  mainExecutorSettings: { maxNumImages: 2 }, // vision on this backend reserves space per image up front
};

const CONVERSATION = {
  preface: { messages: [{ role: "system", content: SYSTEM_PROMPT }], extra_context: { enable_thinking: false } },
  sessionConfig: { maxOutputTokens: 256, samplerParams: { type: SamplerType.TOP_P, temperature: 0.8, p: 0.95, k: 40 } },
  prefillPrefaceOnInit: true, // the system prompt is processed at creation, so warm-up is just creating it
};

// A second conversation answers ask(). Cloning the real one breaks its next turn on this backend.
const JUDGE = {
  preface: { extra_context: { enable_thinking: false } },
  sessionConfig: { maxOutputTokens: 64, samplerParams: { type: SamplerType.GREEDY } },
};

const JSON_ONLY = "\nAnswer with only a JSON object matching this schema, nothing else: ";

/** The text parts of a message, joined. */
function textOf(message: Message) {
  if (typeof message.content === "string") return message.content;
  return (message.content ?? []).map((part) => (part.type === "text" ? part.text : "")).join("");
}

export function createLiteRtLlm(): Llm {
  let engine: Promise<Engine> | null = null;
  let conversation: Promise<ChatInterface> | null = null;
  let tools: Tool[] = [];
  let onToolCall: ((call: ToolCall) => void) | undefined;
  let onToolStart: (() => void) | undefined; // set by reply() while it streams
  let judge: Promise<Conversation> | null = null;
  let latest = ""; // the latest exchange, which is what ask() gets to see
  let loaded = false;
  let onDownloadProgress: ((fraction: number) => void) | undefined;

  const supported = () => "gpu" in navigator;
  const cached = async () => (await caches.open(LITERT_CACHE)).match(LITERT_MODEL_URL);

  // The model file, from Cache Storage, downloading it into there first if needed.
  async function fetchModel(): Promise<Blob> {
    let hit = await cached();
    if (!hit) {
      const response = await fetch(LITERT_MODEL_URL);
      if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status})`);
      const total = Number(response.headers.get("Content-Length"));
      let received = 0;
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            if (total) onDownloadProgress?.(received / total);
            controller.enqueue(chunk);
          },
        }),
      );
      await (await caches.open(LITERT_CACHE)).put(LITERT_MODEL_URL, new Response(counted));
      hit = (await cached())!;
    }
    return hit.blob();
  }

  function getEngine() {
    engine ??= (async () => {
      if (!supported()) throw new Error("This browser has no WebGPU, which LiteRT-LM needs.");
      const created = await Engine.create({ ...ENGINE, model: await fetchModel() });
      loaded = true;
      return created;
    })();
    engine.catch(() => {
      engine = null; // allow a retry
    });
    return engine;
  }

  // AutoToolChat runs the tools the model calls and feeds the results back until it answers.
  function getConversation() {
    conversation ??= getEngine().then(async (engine) => {
      const chat = new AutoToolChat({
        engine,
        config: structuredClone(CONVERSATION), // AutoToolChat writes its tools into the config it is given
        tools: tools.map(({ run, parameters, ...declaration }) => ({
          ...declaration,
          parameters: parameters as Schema,
          execute: (args) => run(args) as JsonValue,
        })),
        onToolProgress: (call) => {
          if (call.status === "started") onToolStart?.();
          onToolCall?.(call);
        },
      });
      await chat.getHistory(); // creates the conversation now, so the system prompt is prefilled before the first turn
      return chat;
    });
    conversation.catch(() => {
      conversation = null;
    });
    return conversation;
  }

  function getJudge() {
    judge ??= getEngine().then((e) => e.createConversation(JUDGE));
    judge.catch(() => {
      judge = null;
    });
    return judge;
  }

  return {
    get loaded() {
      return loaded;
    },
    async availability() {
      if (!supported()) return "unavailable";
      return (await cached()) ? "available" : "downloadable";
    },
    isDownloaded: async () => !!(await cached()),
    useTools(list, onCall) {
      tools = list;
      onToolCall = onCall;
    },
    async load(onProgress) {
      onDownloadProgress = onProgress;
      await getEngine();
    },
    async warmUp() {
      await getConversation();
    },
    async reply(text, onChunk, image) {
      const content = image ? [{ type: "text" as const, text }, { type: "image" as const, data: image }] : text;
      const reader = (await getConversation()).sendMessageStreaming({ role: "user", content }).getReader();

      // After a tool call the model tends to repeat what it said before calling it,
      // so text that merely repeats the previous round is held back and dropped.
      let full = "";
      let previous = "";
      let current = "";
      let holding = false;
      onToolStart = () => {
        previous = current;
        current = "";
        holding = previous.length > 0;
      };
      const emit = (chunk: string) => {
        full += chunk;
        onChunk(chunk);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = textOf(value);
          current += chunk;
          if (!holding) emit(chunk);
          else if (!previous.startsWith(current)) {
            holding = false;
            emit(current); // it only started like the previous round
          }
        }
      } finally {
        onToolStart = undefined;
      }
      latest = `User: ${text}\nAssistant: ${full}`;
      return full;
    },
    async ask(question, schema) {
      // shortcut: the judge sees only the latest exchange, not the whole call; pass more history if a question needs it.
      const prompt = `The latest exchange in a conversation:\n${latest}\n\n${question}${JSON_ONLY}${JSON.stringify(schema)}`;
      const answer = textOf(await (await getJudge()).sendMessage(prompt));
      return JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? answer);
    },
    destroy() {
      // Only the conversations go; the engine stays loaded, since streaming 3.3 GB
      // back onto the GPU for every call would take longer than the call.
      for (const open of [conversation, judge]) open?.then((c) => c.delete()).catch(() => {});
      conversation = judge = null;
      latest = "";
    },
  };
}
