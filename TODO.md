# TODO

## Browser-based TTS options

- **Web Speech API** (`speechSynthesis`) — native, zero download, quality varies by OS/browser
- **Piper** (current — [`tts.ts`](src/workers/tts.ts) via `@diffusionstudio/vits-web`) — solid quality, ~20-60MB per voice, no cloning
- **Kokoro-82M** (`kokoro-js`) — better quality than Piper, ~80-300MB, WebGPU or WASM
- **Transformers.js** (MMS-TTS, SpeechT5, etc.) — flexible, quality varies by model
- **Bark / StyleTTS2 / XTTS** — best quality, some support cloning, but large and mostly research demos, not turnkey

None of these give real voice cloning out of the box — see Voice Cloning below.

## Pipeline stages

- [ ] **STT (speech-to-text)** — transcribe user speech to text, in a dedicated worker (e.g. `src/workers/stt.ts`), following the same Worker + `postMessage` pattern as `tts.ts`.
- [ ] **VAD (voice activity detection)** — detect when the user starts/stops speaking, to drive recording start/stop without push-to-talk.
- [ ] **Turn detection** — decide when the user has finished their turn (vs. a mid-sentence pause), so the agent knows when to respond.
- [ ] **LLM + tool calling** — run an in-browser LLM (WebGPU-accelerated) that can call tools/functions, wired to take STT output and produce a response for TTS.
- [ ] **Wire the full loop** — STT → VAD/turn detection → LLM (+ tools) → TTS, as one conversational pipeline.

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
