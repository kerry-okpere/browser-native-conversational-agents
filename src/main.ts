import './style.css';
import './components/speak-button/speak-button';
import './components/mic-button/mic-button';
import './components/chat-box/chat-box';
import './components/model-controls/model-controls';
import { init } from './init';

const { speak, stt, llm, models } = init();

document.querySelector('speak-button')!.speak = speak;
document.querySelector('mic-button')!.stt = stt;
document.querySelector('chat-box')!.llm = llm;
document.querySelector('model-controls')!.models = models;
