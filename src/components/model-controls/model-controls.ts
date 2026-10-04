import html from './model-controls.html?raw';
import css from './model-controls.css?inline';
import type { Models } from '../../pipeline/index.type';

const toMB = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export class ModelControls extends HTMLElement {
  models?: Models;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    const free = root.querySelector<HTMLButtonElement>('.free')!;
    const remove = root.querySelector<HTMLButtonElement>('.delete')!;
    const status = root.querySelector('.status')!;

    // How much disk this site is using, mostly downloaded models.
    const showUsage = async (prefix = '') => {
      const { usage } = await navigator.storage.estimate();
      status.textContent = `${prefix}Storage used: ${toMB(usage)}`;
    };

    free.addEventListener('click', () => {
      this.models?.freeMemory();
      showUsage('Models unloaded from memory. ');
    });

    remove.addEventListener('click', async () => {
      if (!this.models) return;

      remove.disabled = true;
      try {
        await this.models.deleteDownloads();
        await showUsage('Downloads deleted. ');
      } catch (error) {
        status.textContent = `Error: ${(error as Error).message}`;
      } finally {
        remove.disabled = false;
      }
    });

    showUsage();
  }
}

customElements.define('model-controls', ModelControls);

declare global {
  interface HTMLElementTagNameMap {
    'model-controls': ModelControls;
  }
}
