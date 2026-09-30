# Browser-Native Conversational Agents

An end-to-end conversational AI agent that runs entirely **in the browser** — no server-side inference. Speech in, speech out, with an LLM and tool calling in between, powered by WebGPU/WASM.

## Vision

Have a real spoken conversation with an agent where every piece of the pipeline — STT, LLM, and TTS — runs locally on-device:

- **STT** — transcribe the user's speech to text
- **LLM + tool calling** — reason over the transcript and call tools/functions as needed
- **TTS** — speak the response back
- **Voice architecture** — turn detection and voice activity detection (VAD) so the agent knows when the user has started/stopped talking, enabling natural back-and-forth instead of push-to-talk

All inference happens client-side, using WebGPU where available (falling back to WASM), so conversations work offline and without sending audio or text to a server.

## Status

This is an early scaffold. Implemented so far:

- ✅ **TTS** — [`src/workers/tts.ts`](src/workers/tts.ts) runs [Piper](https://github.com/rhasspy/piper) voices via [`@diffusionstudio/vits-web`](https://www.npmjs.com/package/@diffusionstudio/vits-web) + ONNX Runtime Web, off the main thread in a Web Worker. Voice models are downloaded once and cached in the browser's Origin Private File System (OPFS).
- ✅ A basic UI component ([`speak-button`](src/components/speak-button/)) to type text, hear it spoken, and see model-download progress.

Not yet built:

- ⬜ **STT** (speech-to-text)
- ⬜ **LLM** inference + tool calling
- ⬜ **VAD / turn detection** for hands-free conversation
- ⬜ Wiring the three stages together into a single conversational loop

## Architecture

Each pipeline stage is designed to run in its own **Web Worker**, keeping model inference off the main thread so the UI stays responsive:

```
src/
  workers/        # one worker per pipeline stage (currently: tts.ts)
  components/     # UI, built as plain Web Components (shadow DOM, no framework)
  init.ts         # wires workers up and exposes them to the UI
  main.ts         # app entry point
```

As STT and LLM stages are added, they'll follow the same pattern: a dedicated worker, loaded on demand, communicating with the main thread via `postMessage`.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (default port: `2006`).

## Tech stack

- **TypeScript**, no framework — UI is built with native Web Components
- **Vite** for dev server and bundling
- **ONNX Runtime Web** / **WebGPU** for in-browser model inference
- **Web Workers** to isolate model inference from the UI thread
