import html from './chat-box.html?raw';
import css from './chat-box.css?inline';
import type { Llm, Stt } from '../../pipeline/index.type';
import { timestamp, toSamples, toSeconds } from '../../helpers';

export class ChatBox extends HTMLElement {
  llm?: Llm;
  /** Lets the Speak button record a message and send its transcript. */
  stt?: Stt;
  /**
   * Called with the finished reply, for example to speak it. If it returns a
   * promise, the time it resolves is shown as "First sound".
   */
  onReply?: (text: string) => void | Promise<void>;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    const messages = root.querySelector('.messages')!;
    const form = root.querySelector('form')!;
    const input = root.querySelector('input')!;
    const button = root.querySelector<HTMLButtonElement>('.send')!;
    const mic = root.querySelector<HTMLButtonElement>('.mic')!;
    const progress = root.querySelector('progress')!;
    const status = root.querySelector('.status')!;

    // Adds a bubble with a small line under it for the timestamp and timings.
    const addMessage = (role: 'user' | 'assistant', text = '') => {
      const message = document.createElement('p');
      message.className = `message ${role}`;
      message.textContent = text;

      const meta = document.createElement('p');
      meta.className = `meta meta-${role}`;

      messages.append(message, meta);
      return { message, meta };
    };

    // Creates the session, showing the model download if Chrome doesn't have it yet.
    const load = async (llm: Llm) => {
      if (llm.loaded) return;

      const availability = await llm.availability();
      if (availability === 'unavailable') {
        throw new Error("Chrome's built-in model can't run on this device or browser.");
      }

      const downloading = availability !== 'available';
      const started = performance.now();
      status.textContent = downloading ? 'Downloading model… 0%' : 'Loading model…';
      progress.hidden = !downloading;
      progress.value = 0;

      await llm.load((fraction) => {
        if (!downloading) return;
        const percentage = Math.floor(fraction * 100);
        progress.value = percentage;
        status.textContent = fraction < 1
          ? `Downloading model… ${percentage}% (${toSeconds(performance.now() - started)})`
          : 'Download finished, loading model…';
      });

      progress.hidden = true;
    };


    const send = async (text: string, note = '') => {
      if (!this.llm || !text) return;

      input.disabled = button.disabled = mic.disabled = true;
      addMessage('user', text).meta.textContent = timestamp() + note;

      // when the message was sent.
      const sent = performance.now();
      const sinceSent = () => performance.now() - sent;

      try {
        const needsLoad = !this.llm.loaded;
        await load(this.llm);
        const loadTime = needsLoad ? sinceSent() : 0;

        status.textContent = 'Thinking…';
        const reply = addMessage('assistant');
        let firstWord = 0;
        let firstWordAt = '';

        const full = await this.llm.reply(text, (chunk) => {
          if (!firstWord) {
            firstWord = sinceSent();
            firstWordAt = timestamp(); // the reply's timestamp is when it started arriving
            reply.meta.textContent = firstWordAt;
          }
          reply.message.textContent += chunk;
        });
        reply.message.textContent = full.trim(); // the model sometimes ends with blank lines

        // The latency a voice user feels is the wait from sending to the first word.
        reply.meta.textContent =
          `${firstWordAt} · First word ${toSeconds(firstWord)}` +
          (needsLoad ? ` (model load ${toSeconds(loadTime)})` : '') +
          ` · Full reply ${toSeconds(sinceSent())}`;
        status.textContent = '';

        // Hand the finished reply on without holding up the next message.
        Promise.resolve(this.onReply?.(full.trim()))
          .then(() => {
            if (this.onReply) reply.meta.textContent += ` · First sound ${toSeconds(sinceSent())}`;
          })
          .catch((error) => {
            status.textContent = `Speech failed: ${(error as Error).message}`;
          });
      } catch (error) {
        progress.hidden = true;
        status.textContent = `Error: ${(error as Error).message}`;
      } finally {
        input.disabled = button.disabled = mic.disabled = false;
        input.focus();
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const text = input.value.trim();
      input.value = '';
      send(text);
    });

    // Speak: click to start recording, click again to stop, transcribe and send.
    let recorder: MediaRecorder | null = null;

    const record = async (stt: Stt) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];

      recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder = null;
        mic.classList.remove('recording');
        mic.textContent = 'Speak';
        mic.disabled = true;

        try {
          const stopped = performance.now();
          status.textContent = stt.loaded ? 'Transcribing…' : 'Loading speech model…';
          await stt.load();
          status.textContent = 'Transcribing…';

          const samples = await toSamples(new Blob(chunks, { type: chunks[0]?.type }));
          const text = (await stt.transcribe(samples)).trim();
          status.textContent = '';

          // Whisper marks silence with tags like "[BLANK_AUDIO]".
          if (!text || /^\[.*\]$/.test(text)) {
            status.textContent = "Didn't catch that, try again.";
            return;
          }
          await send(text, ` · Transcribed in ${toSeconds(performance.now() - stopped)}`);
        } catch (error) {
          status.textContent = `Error: ${(error as Error).message}`;
        } finally {
          mic.disabled = false;
        }
      });

      recorder.start();
      mic.classList.add('recording');
      mic.textContent = 'Stop';
      status.textContent = 'Listening… press Stop when you are done.';
    };

    mic.addEventListener('click', async () => {
      if (!this.stt) return;

      if (recorder) {
        recorder.stop();
        return;
      }

      try {
        await record(this.stt);
      } catch (error) {
        status.textContent = `Microphone error: ${(error as Error).message}`;
      }
    });
  }
}

customElements.define('chat-box', ChatBox);

declare global {
  interface HTMLElementTagNameMap {
    'chat-box': ChatBox;
  }
}
