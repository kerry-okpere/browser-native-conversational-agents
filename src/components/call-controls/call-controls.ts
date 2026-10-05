import html from './call-controls.html?raw';
import css from './call-controls.css?inline';
import shared from '../shared.css?inline';
import type { Call } from '../../pipeline/index.type';

const CLOSE_LABEL = 'Close and recover storage';
const CONFIRM_LABEL = 'Click again to delete downloaded models';
const CONFIRM_WINDOW = 4000; // ms the second click is waited for

/** Ends the call, or ends it and frees the storage the models use. */
export class CallControls extends HTMLElement {
  call?: Call;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;

    const end = root.querySelector<HTMLButtonElement>('.end')!;
    const close = root.querySelector<HTMLButtonElement>('.close')!;

    end.addEventListener('click', () => this.call?.end());

    // Deleting the models means downloading them again, so ask twice.
    let confirming = 0;
    close.addEventListener('click', async () => {
      if (!confirming) {
        close.textContent = CONFIRM_LABEL;
        confirming = window.setTimeout(() => {
          confirming = 0;
          close.textContent = CLOSE_LABEL;
        }, CONFIRM_WINDOW);
        return;
      }

      clearTimeout(confirming);
      confirming = 0;
      close.textContent = CLOSE_LABEL;
      await this.call?.close();
    });
  }
}

customElements.define('call-controls', CallControls);

declare global {
  interface HTMLElementTagNameMap {
    'call-controls': CallControls;
  }
}
