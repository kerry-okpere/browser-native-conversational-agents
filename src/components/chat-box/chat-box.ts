import html from './chat-box.html?raw';
import css from './chat-box.css?inline';
import type { Llm } from '../../pipeline/index.type';

const toSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const timestamp = () => new Date().toLocaleTimeString([], { hour12: false });

export class ChatBox extends HTMLElement {
  llm?: Llm;
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
    const button = root.querySelector('button')!;
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

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const text = input.value.trim();
      if (!this.llm || !text) return;

      input.value = '';
      input.disabled = button.disabled = true;
      addMessage('user', text).meta.textContent = timestamp();

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
        input.disabled = button.disabled = false;
        input.focus();
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
