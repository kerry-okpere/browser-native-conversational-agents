import './style.css';
import './components/speak-button/speak-button';
import './components/mic-button/mic-button';
import './components/model-controls/model-controls';
import { init } from './init';

const { speak, stt, models } = init();

document.querySelector('speak-button')!.speak = speak;
document.querySelector('mic-button')!.stt = stt;
document.querySelector('model-controls')!.models = models;
