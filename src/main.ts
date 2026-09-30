import './style.css';
import './components/speak-button/speak-button';
import { init } from './init';

const { speak } = init();

document.querySelector('speak-button')!.speak = speak;
