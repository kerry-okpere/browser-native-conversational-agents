import QRCode from 'qrcode';
import html from './chat-box.html?raw';
import css from './chat-box.css?inline';
import shared from '../shared.css?inline';
import type { Call, ReplyMessage, ToolCall, UserMessage } from '../../pipeline/index.type';
import { METRICS } from '../../constants';
import { timestamp, toSeconds } from '../../helpers';

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

const describeTool = (call: ToolCall) =>
  `${call.name}(${JSON.stringify(call.arguments)})\n→ ` +
  { started: 'running…', completed: JSON.stringify(call.result), error: `failed: ${call.error}` }[call.status];

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
    const input = root.querySelector<HTMLInputElement>('input[type=text]')!;

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
    const input = root.querySelector<HTMLInputElement>('input[type=text]')!;
    const send = root.querySelector('button')!;
    const attach = root.querySelector<HTMLLabelElement>('.attach')!;
    const picker = root.querySelector<HTMLInputElement>('input[type=file]')!;

    // The image waits on the button as a thumbnail until it goes out with the
    // next message; clicking the thumbnail removes it.
    const thumbnail = (image: Blob) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(image);
      img.alt = '';
      return img;
    };
    const showAttached = (image: Blob | null) => {
      attach.classList.toggle('chosen', Boolean(image));
      attach.querySelector('span')!.replaceChildren(image ? thumbnail(image) : 'Image');
      attach.title = image ? 'Remove the image' : 'Show the agent an image';
    };

    picker.addEventListener('change', () => {
      const image = picker.files?.[0] ?? null;
      picker.value = ''; // so choosing the same file again still fires
      call.attach(image);
      showAttached(image);
    });
    attach.addEventListener('click', (event) => {
      if (!attach.classList.contains('chosen')) return; // opens the file picker
      event.preventDefault();
      call.attach(null);
      showAttached(null);
    });

    // Adds a bubble with a small line under it for the timestamp and timings.
    const addMessage = (role: 'user' | 'assistant' | 'tool') => {
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
      if (user.image) {
        message.prepend(thumbnail(user.image));
        message.classList.toggle('image-only', !user.text);
        showAttached(null); // it has been sent
      }
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

    // A tool call is reported as it starts and when it finishes; update its card in place.
    const tools = new Map<number, ReturnType<typeof addMessage>>();

    call.on('tool', (tool) => {
      const card = tools.get(tool.id) ?? addMessage('tool');
      tools.set(tool.id, card);

      card.message.textContent = describeTool(tool);
      card.message.classList.toggle('error', tool.status === 'error');
      // A result with a `qr` link is drawn as a QR code, for the room to scan.
      const qr = (tool.result as { qr?: string } | undefined)?.qr;
      if (qr) {
        const img = document.createElement('img');
        img.alt = `QR code for ${qr}`;
        QRCode.toDataURL(qr, { width: 640, margin: 1 }).then((src) => (img.src = src));
        card.message.append(img);
      }
      card.meta.textContent = `${timestamp()} · Tool call`;
      scrollToBottom();
    });

    call.on('state', (state) => {
      // A new call starts with an empty conversation.
      if (state === 'starting') {
        messages.replaceChildren();
        replies.clear();
        tools.clear();
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
