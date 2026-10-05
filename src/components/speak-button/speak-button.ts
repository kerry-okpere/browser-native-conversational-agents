import html from './speak-button.html?raw';
import css from './speak-button.css?inline';
import type { Tts } from '../../pipeline/index.type';

export class SpeakButton extends HTMLElement {
  tts?: Tts;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    const input = root.querySelector('input')!;
    const button = root.querySelector('button')!;
    const progress = root.querySelector('progress')!;
    const status = root.querySelector('.status')!;

    button.addEventListener('click', async () => {
      if (!this.tts) return;

      button.disabled = true;
      status.textContent = 'Generating speech…';

      try {
        // Reading the model back from the browser's cache reports progress too,
        // so check first whether this is a real download.
        const verb = (await this.tts.isDownloaded()) ? 'Loading' : 'Downloading';
        await this.tts.load((fraction) => {
          progress.hidden = false;
          progress.value = fraction;
          status.textContent = `${verb} voice… ${Math.floor(fraction * 100)}%`;
        });
        progress.hidden = true;
        status.textContent = 'Generating speech…';

        await this.tts.speak(input.value);
        status.textContent = '';
      } catch (error) {
        status.textContent = `Error: ${(error as Error).message}`;
      } finally {
        progress.hidden = true;
        button.disabled = false;
      }
    });
  }
}

customElements.define('speak-button', SpeakButton);

declare global {
  interface HTMLElementTagNameMap {
    'speak-button': SpeakButton;
  }
}
