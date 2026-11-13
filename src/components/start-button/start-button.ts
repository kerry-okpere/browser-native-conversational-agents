import html from './start-button.html?raw';
import css from './start-button.css?inline';
import shared from '../shared.css?inline';
import type { Call, StageName, Start, StartUpdate, WarmUp, WarmUpResult } from '../../pipeline/index.type';
import { STAGE_LABELS } from '../../constants';
import { toMB, toSeconds } from '../../helpers';

// What a chip shows: the page-load warm-up result first, then Start's progress.
type RowState = StartUpdate | WarmUpResult;

const STAGES = Object.keys(STAGE_LABELS) as StageName[];

const describe = (state: RowState) => {
  switch (state.state) {
    case 'downloading':
      return `downloading ${Math.floor(state.fraction * 100)}%`;
    case 'loading':
      return 'loading';
    case 'ready':
      return 'saved' in state && !state.saved ? `${toSeconds(state.ms)}, not saved` : toSeconds(state.ms);
    case 'skipped':
      return 'not downloaded';
    case 'failed':
      return 'failed';
  }
};

/** The start screen: loads every model, shows progress, then begins the call. */
export class StartButton extends HTMLElement {
  start?: Start;
  private source?: Call;
  // Once Start is pressed, its updates own the chips.
  private started = false;
  private states = new Map<StageName, RowState['state']>();

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;

    root.querySelector('ul')!.innerHTML = STAGES.map((stage) => `
      <li data-stage="${stage}">
        <span class="fill"></span>
        <span class="tick">✓</span>
        <span class="spinner"></span>
        <span class="text">${STAGE_LABELS[stage]}</span>
      </li>`).join('');

    const button = root.querySelector('button')!;
    const label = root.querySelector('.label')!;

    button.addEventListener('click', async () => {
      if (!this.start) return;

      this.started = true;
      button.disabled = true;
      this.notify('');

      let failed = false;
      const unsaved: string[] = [];
      await this.start((stage, update) => {
        this.setRow(stage, update);
        failed ||= update.state === 'failed';
        if (update.state === 'ready' && !update.saved) unsaved.push(STAGE_LABELS[stage]);
        const ready = [...this.states.values()].filter((s) => s === 'ready').length;
        label.textContent = `Loading models… ${ready} of ${STAGES.length}`;
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
        label.textContent = 'Opening the microphone…';
        try {
          await this.source?.start(); // opens the microphone; the page switches to the call view
        } catch (error) {
          this.notify(`Could not open the microphone: ${(error as Error).message}`, true);
          failed = true;
        }
      }

      button.disabled = false;
      label.textContent = failed ? 'Retry' : 'Start a call';
    });
  }

  /** The warm-up that init() ran at page load; its results fill the chips until Start takes over. */
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
    this.shadowRoot!.querySelector('voice-orb')!.call = call;

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
    this.states.set(stage, state.state);
    const chip = this.shadowRoot!.querySelector<HTMLElement>(`[data-stage="${stage}"]`)!;
    chip.className = state.state;
    chip.title = state.state === 'failed' ? state.message : '';
    chip.querySelector('.text')!.textContent = `${STAGE_LABELS[stage]} · ${describe(state)}`;
    chip.querySelector<HTMLElement>('.fill')!.style.width = state.state === 'downloading' ? `${state.fraction * 100}%` : '0';
  }
}

customElements.define('start-button', StartButton);

declare global {
  interface HTMLElementTagNameMap {
    'start-button': StartButton;
  }
}
