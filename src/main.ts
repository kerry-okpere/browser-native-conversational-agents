import "./style.css";
import "./components/start-button/start-button";
import "./components/voice-orb/voice-orb";
import "./components/call-controls/call-controls";
import "./components/chat-box/chat-box";
import { init } from "./init";

const { call, warmUp, start } = init();

document.querySelector("start-button")!.start = start;
document.querySelector("start-button")!.warmUp = warmUp;
document.querySelector("start-button")!.call = call;
document.querySelector("voice-orb")!.call = call;
document.querySelector("call-controls")!.call = call;
document.querySelector("chat-box")!.call = call;

// The page shows the start screen while idle and the call view otherwise.
call.on("state", (state) => (document.body.dataset.call = state));
