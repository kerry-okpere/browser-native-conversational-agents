import html from './start-button.html?raw';
import css from './start-button.css?inline';
import type { StageName, Start, StartUpdate, WarmUp, WarmUpResult } from '../../pipeline/index.type';

const toSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const NAMES: Record<StageName, string> = {
  stt: 'Speech-to-text',
  llm: 'LLM',
  tts: 'Text-to-speech',
};

const toMB = (bytes = 0) => `${Math.round(bytes / 1024 / 1024)} MB`;

// What a row shows: the page-load warm-up result first, then Start's progress.
type RowState = StartUpdate | WarmUpResult;

const describe = (state: RowState) => {
  switch (state.state) {
    case 'downloading':
      return `Downloading… ${Math.floor(state.fraction * 100)}%`;
    case 'loading':
      return 'Loading and warming up…';
    case 'ready':
      return 'saved' in state && !state.saved
        ? `Ready in ${toSeconds(state.ms)}, but not saved (storage quota exceeded)`
        : `Ready in ${toSeconds(state.ms)}`;
    case 'skipped':
      return 'Not downloaded yet, press Start';
    case 'failed':
      return `Failed: ${state.message}`;
  }
};

export class StartButton extends HTMLElement {
  start?: Start;
  // Once Start is pressed, its updates own the rows.
  private started = false;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    const button = root.querySelector('button')!;
    const notice = root.querySelector<HTMLElement>('.notice')!;

    button.addEventListener('click', async () => {
      if (!this.start) return;

      this.started = true;
      button.disabled = true;
      button.textContent = 'Starting…';
      notice.hidden = true;

      let failed = false;
      const unsaved: string[] = [];
      await this.start((stage, update) => {
        this.setRow(stage, update);
        failed ||= update.state === 'failed';
        if (update.state === 'ready' && !update.saved) unsaved.push(NAMES[stage]);
      });

      // A model that loaded but isn't on the device afterwards didn't fit in
      // the storage the browser allows this site.
      if (unsaved.length) {
        const { usage } = await navigator.storage.estimate();
        notice.textContent =
          `Storage quota exceeded: ${unsaved.join(' and ')} could not be saved on this device. ` +
          `It works for now, but will download again after a reload. ` +
          `This site is already using ${toMB(usage)}. Free up space with "Delete downloaded models", ` +
          `or raise the site's storage quota in the browser.`;
        notice.hidden = false;
      }

      // Let a failed start be retried; a successful one is done.
      button.disabled = !failed;
      button.textContent = failed ? 'Retry' : 'Started';
    });
  }

  /** The warm-up that init() ran at page load; its results fill the rows until Start takes over. */
  set warmUp(warmUp: WarmUp) {
    for (const [stage, result] of Object.entries(warmUp) as [StageName, WarmUp[StageName]][]) {
      this.setRow(stage, { state: 'loading' });
      result.then((outcome) => {
        if (!this.started) this.setRow(stage, outcome);
      });
    }
  }

  private setRow(stage: StageName, state: RowState) {
    const row = this.shadowRoot!.querySelector(`[data-stage="${stage}"]`)!;
    const progress = row.querySelector('progress')!;
    const status = row.querySelector('.status')!;

    status.textContent = describe(state);
    status.className = `status ${state.state}`;

    if (state.state === 'downloading') {
      progress.value = state.fraction;
    } else if (state.state === 'loading') {
      progress.removeAttribute('value'); // busy, with no percentage to show
    } else {
      progress.value = state.state === 'ready' ? 1 : 0;
    }
  }
}

customElements.define('start-button', StartButton);

declare global {
  interface HTMLElementTagNameMap {
    'start-button': StartButton;
  }
}
