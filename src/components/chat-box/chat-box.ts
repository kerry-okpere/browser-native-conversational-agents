import QRCode from 'qrcode';
import html from './chat-box.html?raw';
import css from './chat-box.css?inline';
import shared from '../shared.css?inline';
import type { Call, ReplyMessage, ToolCall, UserMessage } from '../../pipeline/index.type';
import { MAX_IMAGES, METRICS } from '../../constants';
import { timestamp, toSeconds } from '../../helpers';

// Where each kind of message's timings are measured from.
const ORIGIN = { speech: 'From end of speech', text: 'From Send' };

// A short timing with the full description on hover.
type Note = { text: string; title: string };

const note = (short: string, ms: number | undefined, long: string): Note | undefined =>
  ms === undefined ? undefined : { text: `${short} ${toSeconds(ms)}`, title: `${long} ${toSeconds(ms)}` };

const describeUser = (message: UserMessage): Note[] => {
  if (message.finalSegment === undefined) return [];
  const how = message.turn
    ? `turn judged ${Math.round(message.turn.probability * 100)}% finished in ${toSeconds(message.turn.ms)}`
    : 'ended by silence';
  return [
    {
      text: `turn ended ${toSeconds(message.finalSegment)}`,
      title: `${ORIGIN.speech}: ${METRICS.finalSegment} ${toSeconds(message.finalSegment)} (waiting for silence ${toSeconds(message.vadWait ?? 0)}, ${how})`,
    },
  ];
};

const describeReply = (reply: ReplyMessage): Note[] =>
  [
    note('first word', reply.firstText, `${ORIGIN[reply.from]}: ${METRICS.firstText}`),
    note('voice', reply.firstAudio, METRICS.firstAudio),
    note('done', reply.lastText, METRICS.lastText),
  ].filter((n): n is Note => Boolean(n));

const describeTool = (call: ToolCall) =>
  `${call.name}(${JSON.stringify(call.arguments)}) → ` +
  { started: 'running…', completed: JSON.stringify(call.result), error: `failed: ${call.error}` }[call.status];

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
    const turns = root.querySelector('.turns')!;
    const input = root.querySelector<HTMLInputElement>('input[type=text]')!;
    const send = root.querySelector<HTMLButtonElement>('.send')!;
    const attach = root.querySelector<HTMLLabelElement>('.attach')!;
    const picker = root.querySelector<HTMLInputElement>('input[type=file]')!;
    const picture = root.querySelector('.picture')!;
    const icon = picture.innerHTML;

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
      if (image) picture.replaceChildren(thumbnail(image));
      else picture.innerHTML = icon;
      attach.title = image ? 'Remove the picture' : 'Show the agent a picture';
    };

    // The engine takes a fixed number of pictures per call; past it the button goes quiet.
    let sent = 0;
    const showBudget = () => {
      const spent = sent >= MAX_IMAGES;
      picker.disabled = spent;
      attach.classList.toggle('spent', spent);
      if (spent) attach.title = `The agent can see ${MAX_IMAGES} pictures per call`;
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
    attach.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        attach.click();
      }
    });

    // A message: who said it, a bubble, and a footnote of timings.
    const addRow = (role: 'user' | 'assistant' | 'tool', label: string) => {
      const row = document.createElement('div');
      row.className = `row ${role}`;
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = label;
      const bubble = document.createElement(role === 'tool' ? 'div' : 'p');
      bubble.className = role === 'tool' ? 'chips' : 'bubble';
      const foot = document.createElement('span');
      foot.className = 'foot';
      row.append(who, bubble, foot);
      messages.append(row);
      return { row, bubble, foot };
    };
    const showNotes = (foot: Element, notes: Note[]) =>
      foot.replaceChildren(...notes.map((n) => Object.assign(document.createElement('span'), { textContent: n.text, title: n.title })));

    // A reply arrives many times as it is generated; update its bubble in place.
    const replies = new Map<number, ReturnType<typeof addRow>>();
    const tools = new Map<number, HTMLElement>();
    let count = 0;

    // Keeps the newest message in view.
    const scrollToBottom = () => {
      messages.scrollTop = messages.scrollHeight;
    };

    call.on('user', (user) => {
      const { bubble, foot } = addRow('user', `You · ${user.at}`);
      bubble.textContent = user.text;
      if (user.image) {
        bubble.prepend(thumbnail(user.image));
        bubble.classList.toggle('image-only', !user.text);
        showAttached(null); // it has been sent
        sent++;
        showBudget();
      }
      showNotes(foot, describeUser(user));
      turns.textContent = `${++count} ${count === 1 ? 'turn' : 'turns'}`;
      scrollToBottom();
    });

    call.on('reply', (reply) => {
      const row = replies.get(reply.id) ?? addRow('assistant', `Agent · ${reply.at ?? timestamp()}`);
      replies.set(reply.id, row);

      row.bubble.textContent = reply.error ? `Something went wrong: ${reply.error}` : reply.text;
      row.row.classList.toggle('error', Boolean(reply.error));
      showNotes(row.foot, describeReply(reply));
      scrollToBottom();
    });

    // What the agent did: one chip per tool call, updated as it runs. The chips
    // of one turn share a row.
    let chipRow: ReturnType<typeof addRow> | null = null;
    call.on('tool', (tool) => {
      let chip = tools.get(tool.id);
      if (!chip) {
        if (!chipRow || chipRow.row !== messages.lastElementChild) chipRow = addRow('tool', 'Agent did');
        chip = document.createElement('span');
        chipRow.bubble.append(chip);
        tools.set(tool.id, chip);
      }
      chip.className = `chip ${tool.status === 'started' ? 'running' : tool.status === 'error' ? 'failed' : ''}`;
      chip.textContent = tool.status === 'error' ? `${tool.title} failed` : tool.title;
      chip.title = describeTool(tool);

      // A result with a `qr` link is drawn as a QR code, for the room to scan.
      const qr = (tool.result as { qr?: string } | undefined)?.qr;
      if (qr && chipRow && !chipRow.row.querySelector('.qr')) {
        const img = document.createElement('img');
        img.className = 'qr';
        img.alt = `QR code for ${qr}`;
        QRCode.toDataURL(qr, { width: 512, margin: 1 }).then((src) => (img.src = src));
        chipRow.foot.before(img);
      }
      scrollToBottom();
    });

    call.on('state', (state) => {
      // A new call starts with an empty conversation.
      if (state === 'starting') {
        messages.replaceChildren();
        replies.clear();
        tools.clear();
        chipRow = null;
        count = 0;
        sent = 0;
        turns.textContent = '0 turns';
        showAttached(null);
        showBudget();
      }

      // Typing can step in at any time, except while a reply is being written or after the call.
      const busy = state === 'starting' || state === 'thinking' || state === 'ended';
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
