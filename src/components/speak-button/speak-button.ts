import html from './speak-button.html?raw';
import css from './speak-button.css?inline';
import type { Speak } from '../../init';

const toMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export class SpeakButton extends HTMLElement {
  speak?: Speak;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    const input = root.querySelector('input')!;
    const button = root.querySelector('button')!;
    const progress = root.querySelector('progress')!;
    const status = root.querySelector('.status')!;

    button.addEventListener('click', async () => {
      if (!this.speak) return;

      button.disabled = true;
      status.textContent = 'Generating speech…';

      try {
        // Progress only fires the first time, while the voice model downloads.
        await this.speak(input.value, ({ loaded, total }) => {
          progress.hidden = false;
          if (total) {
            progress.max = total;
            progress.value = loaded;
          } else {
            progress.removeAttribute('value'); // unknown size: indeterminate bar
          }
          status.textContent = loaded === total
            ? 'Generating speech…'
            : `Downloading voice… ${toMB(loaded)}${total ? ` / ${toMB(total)}` : ''}`;
        });
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
