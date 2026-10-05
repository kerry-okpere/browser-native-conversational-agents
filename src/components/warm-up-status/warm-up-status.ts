import html from './warm-up-status.html?raw';
import css from './warm-up-status.css?inline';
import type { WarmUp, WarmUpResult } from '../../pipeline/index.type';
import { toSeconds } from '../../helpers';

const describe = (result: WarmUpResult) => {
  switch (result.state) {
    case 'ready':
      return `Ready in ${toSeconds(result.ms)}`;
    case 'skipped':
      return 'Not downloaded yet, loads on first use';
    case 'failed':
      return `Failed: ${result.message}`;
  }
};

export class WarmUpStatus extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;
  }

  /** Reports on the warm-up that init() started; it doesn't start anything itself. */
  show(warmUp: WarmUp) {
    for (const [stage, result] of Object.entries(warmUp)) {
      const row = this.shadowRoot!.querySelector(`[data-stage="${stage}"]`)!;
      result.then((outcome) => {
        row.textContent = describe(outcome);
        row.className = outcome.state;
      });
    }
  }
}

customElements.define('warm-up-status', WarmUpStatus);

declare global {
  interface HTMLElementTagNameMap {
    'warm-up-status': WarmUpStatus;
  }
}
