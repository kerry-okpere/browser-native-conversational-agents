import html from './voice-orb.html?raw';
import css from './voice-orb.css?inline';
import shared from '../shared.css?inline';
import type { Call, CallState } from '../../pipeline/index.type';
import { STATE_HINTS, STATE_LABELS } from '../../constants';

// A sphere of dots: latitude rings, each a circle of dots, seen from a tilt.
const RINGS = 14;
const PER_RING = 100;
const TILT = (-35 * Math.PI) / 180; // the top leans out toward the viewer
const ROLL = (-45 * Math.PI) / 180; // the whole sphere turned in the screen plane
const SPREAD = 0.8; // the sphere's radius as a fraction of the canvas's

// Which design token colours the orb in each state.
const COLOURS: Record<CallState, string> = {
  idle: '--faint',
  starting: '--muted',
  listening: '--ink',
  hearing: '--accent', // your voice colours it
  thinking: '--muted',
  speaking: '--ink',
  ended: '--faint',
};

// How fast it turns on its axis, in radians per frame.
const SPIN: Record<CallState, number> = {
  idle: 0.002,
  starting: 0.003,
  listening: 0.003,
  hearing: 0.004,
  thinking: 0.014,
  speaking: 0.004,
  ended: 0,
};

// How much a ring dilates with the sound in its band of the spectrum.
const GAIN: Partial<Record<CallState, number>> = { hearing: 0.7, speaking: 0.5 };
// No ring swells past this, however loud or shrill the sound.
const MAX_SWELL = 0.35;
// Which band each ring follows, scrambled so neighbouring rings move independently.
const BAND_OF_RING = Array.from({ length: RINGS }, (_, i) => (i * 7) % RINGS);

type Dot = { ring: number; angle: number };

const dots: Dot[] = [];
for (let ring = 0; ring < RINGS; ring++) {
  for (let i = 0; i < PER_RING; i++) dots.push({ ring, angle: (i / PER_RING) * Math.PI * 2 });
}
// Each ring's radius and height on a unit sphere.
const ringRadius = Array.from({ length: RINGS }, (_, i) => Math.cos(-Math.PI / 2 + ((i + 1) / (RINGS + 1)) * Math.PI) * SPREAD);
const ringHeight = Array.from({ length: RINGS }, (_, i) => Math.sin(-Math.PI / 2 + ((i + 1) / (RINGS + 1)) * Math.PI) * SPREAD);

/** A sphere of dots that turns, swells with whoever is talking, and draws in to think. */
export class VoiceOrb extends HTMLElement {
  private source?: Call;
  private state: CallState = 'idle';
  private frame = 0;
  private size = 360;
  private spin = 0;
  private scale = 1; // smoothed: thinking draws the sphere in
  private levels = new Float32Array(RINGS); // smoothed sound per ring

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${shared}${css}</style>${html}`;

    this.size = Number(this.getAttribute('size')) || this.size;
    const canvas = root.querySelector('canvas')!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = this.size * ratio;
    canvas.height = this.size * ratio;
    canvas.style.width = canvas.style.height = `${this.size}px`;
    canvas.getContext('2d')!.scale(ratio, ratio);
    this.draw();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.frame);
  }

  set call(call: Call) {
    this.source = call;
    call.on('state', (state) => {
      this.state = state;
      const root = this.shadowRoot!;
      root.querySelector('.caption')!.textContent = STATE_LABELS[state];
      root.querySelector('.hint')!.textContent = STATE_HINTS[state];
    });
  }

  private draw = () => {
    this.frame = requestAnimationFrame(this.draw);
    if (!this.checkVisibility()) return; // another screen is up

    const { size, state } = this;
    const centre = size / 2;
    const radius = size / 2;
    const dot = Math.max(1.5, size / 160);

    // The sound dilates the rings: each ring follows one band of the spectrum.
    const gain = GAIN[state] ?? 0;
    const bands = gain && this.source ? this.source.bands() : null;
    for (let ring = 0; ring < RINGS; ring++) {
      const target = bands ? Math.min(MAX_SWELL, bands[Math.floor((BAND_OF_RING[ring] / (RINGS - 1)) * (bands.length - 1))] * gain) : 0;
      this.levels[ring] += (target - this.levels[ring]) * 0.45; // quick to swell, so it feels loose
    }

    this.spin += SPIN[state];
    this.scale += ((state === 'thinking' ? 0.85 : 1) - this.scale) * 0.08;
    // While thinking a bright pulse travels around the sphere.
    const pulse = state === 'thinking' ? (performance.now() / 500) % (Math.PI * 2) : -1;

    const context = this.shadowRoot!.querySelector('canvas')!.getContext('2d')!;
    context.clearRect(0, 0, size, size);
    context.fillStyle = getComputedStyle(this).getPropertyValue(COLOURS[state]);

    for (const { ring, angle } of dots) {
      const a = angle + this.spin;
      const r = ringRadius[ring] * (1 + this.levels[ring]) * radius * this.scale;
      const x0 = Math.cos(a) * r;
      const z0 = Math.sin(a) * r;
      const y0 = ringHeight[ring] * radius * this.scale;
      // Tilt toward the viewer, then roll in the screen plane.
      const y1 = y0 * Math.cos(TILT) - z0 * Math.sin(TILT);
      const z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT);
      const x = x0 * Math.cos(ROLL) - y1 * Math.sin(ROLL);
      const y = x0 * Math.sin(ROLL) + y1 * Math.cos(ROLL);

      const depth = (z / radius + 1) / 2; // 0 at the back, 1 at the front
      let alpha = 0.12 + depth * 0.88;
      if (pulse >= 0) {
        const away = Math.abs(((a - pulse + Math.PI) % (Math.PI * 2)) - Math.PI);
        alpha = Math.min(1, alpha + Math.max(0, 1 - away / 0.7) * 0.8);
      }
      const d = dot * (0.6 + depth * 0.8);
      context.globalAlpha = alpha;
      context.fillRect(centre + x - d / 2, centre + y - d / 2, d, d);
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
