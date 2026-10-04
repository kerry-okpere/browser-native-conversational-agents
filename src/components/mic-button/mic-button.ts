import html from './mic-button.html?raw';
import css from './mic-button.css?inline';
import type { Stt } from '../../init';

const SAMPLE_RATE = 16000; // what the speech model expects

/** Decode a recording into 16 kHz mono samples. */
async function toSamples(recording: Blob): Promise<Float32Array> {
  // decodeAudioData resamples to the context's sample rate.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(await recording.arrayBuffer());
    return buffer.getChannelData(0);
  } finally {
    await context.close();
  }
}

export class MicButton extends HTMLElement {
  stt?: Stt;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    const button = root.querySelector('button')!;
    const progress = root.querySelector('progress')!;
    const status = root.querySelector('.status')!;
    const transcript = root.querySelector('.transcript')!;

    let recorder: MediaRecorder | null = null;
    let loaded = false;

    const loadModel = (stt: Stt) =>
      stt.load((percentage) => {
        if (loaded) return;
        progress.hidden = false;
        progress.value = percentage;
      }).then(() => {
        loaded = true;
        progress.hidden = true;
      });

    const start = async (stt: Stt) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];

      recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder = null;
        button.classList.remove('recording');
        button.disabled = true;

        try {
          status.textContent = loaded ? 'Transcribing…' : 'Loading speech model…';
          await loadModel(stt);
          status.textContent = 'Transcribing…';
          const samples = await toSamples(new Blob(chunks, { type: chunks[0]?.type }));
          transcript.textContent = (await stt.transcribe(samples)) || '(no speech detected)';
          status.textContent = '';
        } catch (error) {
          status.textContent = `Error: ${(error as Error).message}`;
        } finally {
          button.disabled = false;
          button.textContent = 'Start talking';
        }
      });

      recorder.start();
      button.classList.add('recording');
      button.textContent = 'Stop';
      status.textContent = 'Listening…';
      transcript.textContent = '';

      // Start the model download while the user is talking.
      loadModel(stt).catch(() => {}); // reported when the recording stops
    };

    button.addEventListener('click', async () => {
      if (!this.stt) return;

      if (recorder) {
        recorder.stop();
        return;
      }

      try {
        await start(this.stt);
      } catch (error) {
        status.textContent = `Microphone error: ${(error as Error).message}`;
      }
    });
  }
}

customElements.define('mic-button', MicButton);

declare global {
  interface HTMLElementTagNameMap {
    'mic-button': MicButton;
  }
}
