import "./style.css";
import "./components/start-button/start-button";
import "./components/voice-orb/voice-orb";
import "./components/call-controls/call-controls";
import "./components/chat-box/chat-box";
import "./components/call-ended/call-ended";
import { init } from "./init";
import { EVENT, TALK } from "./constants";
import { toClock } from "./helpers";

const { call, warmUp, start } = init();

document.querySelector("start-button")!.start = start;
document.querySelector("start-button")!.warmUp = warmUp;
document.querySelector("start-button")!.call = call;
document.querySelector("voice-orb")!.call = call;
document.querySelector("call-controls")!.call = call;
document.querySelector("chat-box")!.call = call;
document.querySelector("call-ended")!.call = call;
document.querySelector("call-ended")!.start = start;

document.querySelector(".event")!.textContent = EVENT;
document.querySelector(".talk")!.textContent = TALK;

// The page shows the start screen while idle, the ended screen after a call,
// and the call view otherwise. The header counts the call's length meanwhile.
const timer = document.querySelector(".timer")!;
let startedAt = 0;
let ticking = 0;
call.on("state", (state) => {
  document.body.dataset.call = state;

  if (state === "starting") {
    startedAt = performance.now();
    ticking = window.setInterval(() => (timer.textContent = toClock(performance.now() - startedAt)), 1000);
    timer.textContent = "0:00";
  }
  if (state === "ended" || state === "idle") {
    clearInterval(ticking);
    timer.textContent = "";
  }
});
