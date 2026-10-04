import './style.css';
import './components/speak-button/speak-button';
import './components/mic-button/mic-button';
import { init } from './init';

const { speak, stt } = init();

document.querySelector('speak-button')!.speak = speak;
document.querySelector('mic-button')!.stt = stt;
