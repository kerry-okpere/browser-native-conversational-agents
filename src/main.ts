import "./style.css";
import "./components/start-button/start-button";
// import './components/speak-button/speak-button';
// import './components/mic-button/mic-button';
import "./components/chat-box/chat-box";
import "./components/model-controls/model-controls";
import { init } from "./init";

const { stt, llm, tts, models, warmUp, start } = init();

document.querySelector("start-button")!.start = start;
document.querySelector("start-button")!.warmUp = warmUp;
// document.querySelector('speak-button')!.tts = tts;
// document.querySelector('mic-button')!.stt = stt;
document.querySelector("chat-box")!.llm = llm;
document.querySelector("chat-box")!.onReply = (text) => tts.speak(text);
document.querySelector("model-controls")!.models = models;
