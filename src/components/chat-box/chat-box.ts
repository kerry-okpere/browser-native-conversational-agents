import html from './chat-box.html?raw';
import css from './chat-box.css?inline';
import shared from '../shared.css?inline';
import type { Call, ReplyMessage, UserMessage } from '../../pipeline/index.type';
import { METRICS } from '../../constants';
import { toSeconds } from '../../helpers';

// Where each kind of message's timings are measured from.
const ORIGIN = { speech: 'From end of speech', text: 'From Send' };

const metric = (label: string, ms?: number) => (ms === undefined ? '' : `${label} ${toSeconds(ms)}`);
const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

const describeUser = (message: UserMessage) =>
  join([
    message.at,
    message.finalSegment !== undefined
      ? `${ORIGIN.speech}: ${metric(METRICS.finalSegment, message.finalSegment)}` +
        ` (waiting for silence ${toSeconds(message.vadWait ?? 0)}` +
        (message.turn
          ? `, turn judged ${Math.round(message.turn.probability * 100)}% finished in ${toSeconds(message.turn.ms)})`
          : ', ended by silence)')
      : '',
  ]);

const describeReply = (reply: ReplyMessage) =>
  join([
    reply.at,
    reply.firstText !== undefined ? `${ORIGIN[reply.from]}: ${metric(METRICS.firstText, reply.firstText)}` : '',
    metric(METRICS.lastText, reply.lastText),
    metric(METRICS.firstAudio, reply.firstAudio),
  ]);

/** The written record of the call, and a way to type instead of speaking. */
export class ChatBox extends HTMLElement {
  private source?: Call;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;

    const form = root.querySelector('form')!;
    const input = root.querySelector('input')!;

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const text = input.value;
      input.value = '';
      this.source?.send(text);
    });
  }

  set call(call: Call) {
    this.source = call;

    const root = this.shadowRoot!;
    const messages = root.querySelector('.messages')!;
    const input = root.querySelector('input')!;
    const send = root.querySelector('button')!;

    // Adds a bubble with a small line under it for the timestamp and timings.
    const addMessage = (role: 'user' | 'assistant') => {
      const message = document.createElement('p');
      message.className = `message ${role}`;

      const meta = document.createElement('p');
      meta.className = `meta meta-${role}`;

      messages.append(message, meta);
      return { message, meta };
    };

    // A reply arrives many times as it is generated; update its bubble in place.
    const replies = new Map<number, ReturnType<typeof addMessage>>();

    // Keeps the newest message in view.
    const scrollToBottom = () => {
      messages.scrollTop = messages.scrollHeight;
    };

    call.on('user', (user) => {
      const { message, meta } = addMessage('user');
      message.textContent = user.text;
      meta.textContent = describeUser(user);
      scrollToBottom();
    });

    call.on('reply', (reply) => {
      const bubble = replies.get(reply.id) ?? addMessage('assistant');
      replies.set(reply.id, bubble);

      bubble.message.textContent = reply.error ? `Something went wrong: ${reply.error}` : reply.text;
      bubble.message.classList.toggle('error', Boolean(reply.error));
      bubble.meta.textContent = describeReply(reply);
      scrollToBottom();
    });

    call.on('state', (state) => {
      // A new call starts with an empty conversation.
      if (state === 'starting') {
        messages.replaceChildren();
        replies.clear();
      }

      // Typing can step in at any time, except while a reply is being written.
      const busy = state === 'starting' || state === 'thinking';
      input.disabled = send.disabled = busy;
    });
  }
}

customElements.define('chat-box', ChatBox);

declare global {
  interface HTMLElementTagNameMap {
    'chat-box': ChatBox;
  }
}
