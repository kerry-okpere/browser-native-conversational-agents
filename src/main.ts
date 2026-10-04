import './style.css';
import './components/warm-up-status/warm-up-status';
import './components/speak-button/speak-button';
import './components/mic-button/mic-button';
import './components/chat-box/chat-box';
import './components/model-controls/model-controls';
import { init } from './init';

const { speak, stt, llm, models, warmUp } = init();

document.querySelector('warm-up-status')!.show(warmUp);
document.querySelector('speak-button')!.speak = speak;
document.querySelector('mic-button')!.stt = stt;
document.querySelector('chat-box')!.llm = llm;
document.querySelector('model-controls')!.models = models;
