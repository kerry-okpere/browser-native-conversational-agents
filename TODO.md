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
- [x] **VAD (voice activity detection)** — Silero VAD in `src/workers/vad.ts`; the turn ends after a fixed 0.5 s of silence.
- [x] **Wire the full loop** — VAD → STT → LLM → TTS in `src/pipeline/call.ts`, hands-free.
- [ ] **Turn detection** — decide when the user has finished their turn (vs. a mid-sentence pause) instead of a fixed silence. Candidate: [Smart Turn v3](https://huggingface.co/pipecat-ai/smart-turn-v3), run when the VAD reports silence.
- [ ] **Interruptions (barge-in)** — the microphone is ignored while the agent is thinking or speaking. Let the user cut in by speaking, which needs reliable echo cancellation first.
- [ ] **Speak while generating** — send each sentence to TTS as soon as it is complete instead of waiting for the whole reply.
- [ ] **Tool calling** — let the LLM call tools/functions (the Prompt API has none built in; use structured output).
- [ ] **Agent ends the call** — expose "end call" as a tool so the agent can end the session itself. Depends on tool calling.

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
