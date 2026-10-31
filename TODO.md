# TODO

## Browser-based TTS options

- **Web Speech API** (`speechSynthesis`) — native, zero download, quality varies by OS/browser
- **Piper** ([`tts-piper.ts`](src/workers/tts-piper.ts) via `@diffusionstudio/vits-web`) — solid quality, ~20-60MB per voice, no cloning
- **Kokoro-82M** (current — [`tts-kokoro.ts`](src/workers/tts-kokoro.ts) via `kokoro-js`) — better quality than Piper, ~80-300MB, WebGPU or WASM
- **Transformers.js** (MMS-TTS, SpeechT5, etc.) — flexible, quality varies by model
- **Bark / StyleTTS2 / XTTS** — best quality, some support cloning, but large and mostly research demos, not turnkey

None of these give real voice cloning out of the box — see Voice Cloning below.

## Pipeline stages

- [x] **STT (speech-to-text)** — Whisper via Transformers.js in `src/workers/stt.ts`, encoder on WebGPU.
- [x] **VAD (voice activity detection)** — Silero VAD in `src/workers/vad.ts`.
- [x] **Wire the full loop** — VAD → STT → LLM → TTS in `src/pipeline/call.ts`, hands-free.
- [x] **Turn detection** — [Smart Turn v3](https://huggingface.co/pipecat-ai/smart-turn-v3) in `src/workers/turn.ts`. After 0.2 s of silence it judges whether the user has finished; a 2.5 s silence ends the turn regardless.
- [ ] **Faster turn check** — a check takes about 0.2 s in the browser against the 12 ms the model's authors report. Find where the time goes (spectrogram in JS, single-threaded WASM) and reduce it.
- [ ] **Interruptions (barge-in)** — the microphone is ignored while the agent is thinking or speaking. Let the user cut in by speaking, which needs reliable echo cancellation first.
- [x] **Speak while generating** — each sentence goes to TTS as soon as it is complete, in `src/pipeline/call.ts`.
- [ ] **Tool calling** — let the LLM call tools/functions (the Prompt API has none built in; use structured output).
- [ ] **Agent ends the call** — expose "end call" as a tool so the agent can end the session itself. Depends on tool calling.

## In-browser RAG

- [ ] Add retrieval-augmented generation that runs entirely in the browser, so the agent can answer from our own documents. Use [voy-search](https://www.npmjs.com/package/voy-search) as the vector index, with embeddings computed in the browser (e.g. a Transformers.js embedding model).

## Voice cloning

- [ ] Investigate few-shot/zero-shot voice cloning options that can run in-browser (or acceptably via a hybrid approach), as an alternative/addition to the fixed-voice engines above.
- [ ] If browser-native cloning isn't practical yet, document the offline path: record training audio, fine-tune a Piper (or other) model, export to ONNX, host and load it like a normal voice — see the "Voice cloning" discussion in project chat history for the full breakdown.

## Pluggable pipeline API (Pipecat-style)

- [ ] Design a `Pipeline`/`Voice` class that lets the app pick which implementation is used for each stage, independently — e.g.:

  ```ts
  const pipeline = new VoicePipeline({
    stt: new WhisperSTT(),
    llm: new WebLLM({ model: '...' }),
    tts: new PiperTTS({ voiceId: 'en_US-hfc_female-medium' }),
    vad: new SileroVAD(),
  });
  ```

- [ ] Define a shared interface/contract per stage (`STTEngine`, `TTSEngine`, `LLMEngine`, `VADEngine`) so engines are swappable without changing the pipeline glue — mirrors how [Pipecat](https://github.com/pipecat-ai/pipecat) composes STT/LLM/TTS/VAD services behind common interfaces.
- [ ] Each engine should still own its Worker internally (as `tts.ts` does today), so the pipeline class is orchestration only, not where inference happens.


Backchanneling or proactive interruption

- Implement imgae reasoning 
- improve the agent prompt to optimize it for gdg abuja
- Implement barge in 
- tool calling 
- RAG Implement https://www.npmjs.com/package/voy-search and embedded gemma 