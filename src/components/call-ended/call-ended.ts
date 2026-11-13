import html from './call-ended.html?raw';
import css from './call-ended.css?inline';
import shared from '../shared.css?inline';
import type { Call, Start } from '../../pipeline/index.type';
import { CITY } from '../../constants';
import { toClock, toSeconds } from '../../helpers';

/** The screen after a call: how it went, and a way to start another. */
export class CallEnded extends HTMLElement {
  start?: Start;
  private source?: Call;
  private startedAt = 0;
  private turns = 0;
  private firstWords = new Map<number, number>(); // reply id → ms to its first word
  private tools: string[] = [];

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;
    root.querySelector('.thanks')!.textContent = `Thanks, ${CITY}.`;

    const again = root.querySelector<HTMLButtonElement>('.again')!;
    const label = again.querySelector('.label')!;
    const notice = root.querySelector<HTMLElement>('.notice')!;

    // The same two steps as the Start button: get every stage ready, then open the microphone.
    again.addEventListener('click', async () => {
      again.disabled = true;
      label.textContent = 'Starting…';
      notice.hidden = true;
      try {
        await this.start?.(() => {});
        await this.source?.start();
      } catch (error) {
        notice.textContent = `Could not start: ${(error as Error).message}`;
        notice.hidden = false;
        notice.classList.add('error');
      } finally {
        again.disabled = false;
        label.textContent = 'Start another call';
      }
    });

    // Back to the start screen. The call is over either way, so this is only which screen shows.
    root.querySelector('.back')!.addEventListener('click', () => (document.body.dataset.call = 'idle'));
  }

  set call(call: Call) {
    this.source = call;
    this.shadowRoot!.querySelector('voice-orb')!.call = call;

    call.on('state', (state) => {
      if (state === 'starting') {
        this.startedAt = performance.now();
        this.turns = 0;
        this.firstWords.clear();
        this.tools = [];
      }
      if (state === 'ended') this.render();
    });
    call.on('user', () => this.turns++);
    call.on('reply', (reply) => {
      if (reply.firstText !== undefined) this.firstWords.set(reply.id, reply.firstText);
    });
    call.on('tool', (tool) => {
      if (tool.status === 'completed' && !this.tools.includes(tool.title)) this.tools.push(tool.title);
    });
  }

  private render() {
    const root = this.shadowRoot!;
    root.querySelector('.length')!.textContent = toClock(performance.now() - this.startedAt);
    root.querySelector('.turns')!.textContent = String(this.turns);

    const times = [...this.firstWords.values()];
    root.querySelector('.first')!.textContent = times.length
      ? toSeconds(times.reduce((sum, ms) => sum + ms, 0) / times.length)
      : '–';

    const tools = root.querySelector('.tools')!;
    tools.replaceChildren(
      ...(this.tools.length
        ? this.tools.map((title) => Object.assign(document.createElement('span'), { className: 'chip', textContent: title }))
        : ['None']),
    );
  }
}

customElements.define('call-ended', CallEnded);

declare global {
  interface HTMLElementTagNameMap {
    'call-ended': CallEnded;
  }
}
