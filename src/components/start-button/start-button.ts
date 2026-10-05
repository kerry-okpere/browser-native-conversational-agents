import html from './start-button.html?raw';
import css from './start-button.css?inline';
import shared from '../shared.css?inline';
import type { Call, StageName, Start, StartUpdate, WarmUp, WarmUpResult } from '../../pipeline/index.type';
import { STAGE_LABELS } from '../../constants';
import { toMB, toSeconds } from '../../helpers';

// What a row shows: the page-load warm-up result first, then Start's progress.
type RowState = StartUpdate | WarmUpResult;

const STAGES = Object.keys(STAGE_LABELS) as StageName[];

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

/** The start screen: loads every model, shows progress, then begins the call. */
export class StartButton extends HTMLElement {
  start?: Start;
  private source?: Call;
  // Once Start is pressed, its updates own the rows.
  private started = false;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;

    root.querySelector('ul')!.innerHTML = STAGES.map((stage) => `
      <li data-stage="${stage}">
        <span class="name">${STAGE_LABELS[stage]}</span>
        <progress max="1" value="0"></progress>
        <span class="status">Checking…</span>
      </li>`).join('');

    const button = root.querySelector('button')!;

    button.addEventListener('click', async () => {
      if (!this.start) return;

      this.started = true;
      button.disabled = true;
      button.textContent = 'Loading models…';
      this.notify('');

      let failed = false;
      const unsaved: string[] = [];
      await this.start((stage, update) => {
        this.setRow(stage, update);
        failed ||= update.state === 'failed';
        if (update.state === 'ready' && !update.saved) unsaved.push(STAGE_LABELS[stage]);
      });

      // A model that loaded but isn't on the device afterwards didn't fit in
      // the storage the browser allows this site.
      if (unsaved.length) {
        const { usage } = await navigator.storage.estimate();
        this.notify(
          `Storage quota exceeded: ${unsaved.join(' and ')} could not be saved on this device. ` +
            `It works for now, but will download again after a reload. ` +
            `This site is already using ${toMB(usage)}.`,
          true,
        );
      }

      if (!failed) {
        try {
          await this.source?.start(); // opens the microphone; the page switches to the call view
        } catch (error) {
          this.notify(`Could not open the microphone: ${(error as Error).message}`, true);
          failed = true;
        }
      }

      button.disabled = false;
      button.textContent = failed ? 'Retry' : 'Start';
    });
  }

  /** The warm-up that init() ran at page load; its results fill the rows until Start takes over. */
  set warmUp(warmUp: WarmUp) {
    for (const stage of STAGES) {
      this.setRow(stage, { state: 'loading' });
      warmUp[stage].then((outcome) => {
        if (!this.started) this.setRow(stage, outcome);
      });
    }
  }

  set call(call: Call) {
    this.source = call;

    // After storage is cleared nothing is downloaded any more.
    call.on('closed', ({ recovered }) => {
      for (const stage of STAGES) this.setRow(stage, { state: 'skipped' });
      this.notify(`Storage cleared: ${toMB(recovered)} recovered.`);
    });
  }

  private notify(text: string, isError = false) {
    const notice = this.shadowRoot!.querySelector<HTMLElement>('.notice')!;
    notice.textContent = text;
    notice.hidden = !text;
    notice.classList.toggle('error', isError);
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
