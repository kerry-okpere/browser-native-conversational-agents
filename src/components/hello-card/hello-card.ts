import html from './hello-card.html?raw';
import css from './hello-card.css?inline';

export class HelloCard extends HTMLElement {
  private count = 0;

  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;

    root.querySelector('.name')!.textContent = this.getAttribute('name') ?? 'world';

    const button = root.querySelector('button')!;
    button.addEventListener('click', () => {
      this.count++;
      button.textContent = `Clicked ${this.count} times`;
    });
  }
}

customElements.define('hello-card', HelloCard);
