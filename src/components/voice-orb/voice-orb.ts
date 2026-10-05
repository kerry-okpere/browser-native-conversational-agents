import html from './voice-orb.html?raw';
import css from './voice-orb.css?inline';
import shared from '../shared.css?inline';
import type { Call, CallState } from '../../pipeline/index.type';
import { STATE_LABELS } from '../../constants';

const SIZE = 280; // canvas width and height in CSS pixels
const RADIUS = SIZE * 0.3; // the ring at rest
const DOTS = 2600;
const DOT = 1.3; // dot size in CSS pixels
const LOBES = 5; // how many times the spectrum repeats around the ring

// How the dots behave, like sand held by a magnet: sound shakes them loose
// and the pull draws them back to where they rest.
const PULL = 0.07; // strength of the pull back to rest
const DRAG = 0.86; // how quickly a moving dot slows down
const SHAKE = 0.045; // how hard sound throws the dots
const STILLNESS = 0.012; // a little movement even in silence, so it looks alive

// Which design token colours the orb in each state.
const COLOURS: Record<CallState, string> = {
  idle: '--line',
  starting: '--muted',
  listening: '--ink',
  hearing: '--accent',
  thinking: '--muted',
  speaking: '--ink',
};

// Distances below are fractions of the ring's radius.
type Dot = {
  angle: number;
  rest: number; // where it sits relative to the ring: 0 on it, negative inside
  offset: number; // how far sound has pushed it from rest
  speed: number;
  loose: number; // how easily sound moves it
  alpha: number;
};

// Random numbers clustered near zero, for dots that thin out with distance.
const falloff = (scale: number) => -Math.log(1 - Math.random()) * scale;
const spread = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1; // roughly bell-shaped, -1 to 1

function createDot(): Dot {
  const angle = Math.random() * Math.PI * 2;
  const kind = Math.random();

  // Most dots form the bright rim.
  if (kind < 0.55) {
    return { angle, rest: spread() * 0.02, offset: 0, speed: 0, loose: 0.5 + Math.random() * 0.6, alpha: 0.9 };
  }
  // A haze of grain inside the rim that fades toward the centre.
  if (kind < 0.9) {
    const depth = Math.min(0.75, falloff(0.14));
    return { angle, rest: -depth, offset: 0, speed: 0, loose: 0.25, alpha: 0.55 * (1 - depth / 0.75) + 0.08 };
  }
  // A few strays just outside, which scatter the furthest.
  return { angle, rest: falloff(0.05), offset: 0, speed: 0, loose: 1.6, alpha: 0.5 };
}

/** A ring of fine dots that scatters with the voice of whoever is talking. */
export class VoiceOrb extends HTMLElement {
  private source?: Call;
  private state: CallState = 'idle';
  private frame = 0;
  private level = 0; // smoothed loudness
  private dots = Array.from({ length: DOTS }, createDot);

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;

    const canvas = root.querySelector('canvas')!;
    const scale = window.devicePixelRatio || 1;
    canvas.width = SIZE * scale;
    canvas.height = SIZE * scale;
    canvas.style.width = canvas.style.height = `${SIZE}px`;
    canvas.getContext('2d')!.scale(scale, scale);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.frame);
  }

  set call(call: Call) {
    this.source = call;
    call.on('state', (state) => {
      this.state = state;
      this.shadowRoot!.querySelector('.caption')!.textContent = STATE_LABELS[state];

      cancelAnimationFrame(this.frame);
      if (state !== 'idle') this.draw();
    });
  }

  private draw = () => {
    this.frame = requestAnimationFrame(this.draw);

    const bands = this.source!.bands();
    const loudness = bands.reduce((sum, band) => sum + band, 0) / bands.length;
    this.level += (loudness - this.level) * 0.2;

    // While thinking there is no sound, so the ring breathes slowly instead.
    const thinking = this.state === 'thinking';
    const breath = thinking ? 0.04 * Math.sin(performance.now() / 350) : 0;
    const ring = RADIUS * (1 + breath + this.level * 0.25);

    const context = this.shadowRoot!.querySelector('canvas')!.getContext('2d')!;
    context.clearRect(0, 0, SIZE, SIZE);
    context.fillStyle = getComputedStyle(this).getPropertyValue(COLOURS[this.state]);

    for (const dot of this.dots) {
      // The sound at this dot's place on the ring: the spectrum repeats in
      // lobes around it, on top of the overall loudness, so the whole ring
      // stirs and the lobes scatter the most.
      const place = Math.abs(Math.sin((dot.angle * LOBES) / 2));
      const energy = bands[Math.floor(place * (bands.length - 1))] * 0.7 + this.level * 0.6 + STILLNESS;

      // Sound throws the dot, mostly outward; the pull brings it back.
      dot.speed += (Math.random() - 0.3) * energy * dot.loose * SHAKE;
      dot.speed -= dot.offset * PULL;
      dot.speed *= DRAG;
      dot.offset += dot.speed;

      if (thinking) dot.angle += 0.004; // a slow turn while it works

      const distance = ring * (1 + dot.rest + dot.offset);
      context.globalAlpha = dot.alpha;
      context.fillRect(
        SIZE / 2 + distance * Math.cos(dot.angle) - DOT / 2,
        SIZE / 2 + distance * Math.sin(dot.angle) - DOT / 2,
        DOT,
        DOT,
      );
    }
    context.globalAlpha = 1;
  };
}

customElements.define('voice-orb', VoiceOrb);

declare global {
  interface HTMLElementTagNameMap {
    'voice-orb': VoiceOrb;
  }
}
