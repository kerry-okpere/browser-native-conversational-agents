// The agent's tools. The app runs them; the model only decides when to call them.
import type { Call, Tool } from "./pipeline/index.type";
import { QR_URL } from "./constants";

export const createTools = (call: Call): Tool[] => [
  {
    name: "set_lights",
    description: "Turn the lights on or off: the screen switches between light and dark mode.",
    parameters: {
      type: "object",
      properties: { on: { type: "boolean", description: "true for lights on, false for lights off" } },
      required: ["on"],
    },
    run: ({ on }) => {
      document.body.dataset.theme = on ? "light" : "dark";
      return `The lights are now ${on ? "on" : "off"}.`;
    },
    title: ({ on }) => (on ? "Lights on" : "Lights off"),
  },
  {
    name: "show_qr_code",
    description: "Show a QR code in the chat that links to this app, so the audience can open it on their phones.",
    // A `qr` field in a tool result is drawn as a QR code in the chat.
    run: () => ({ qr: QR_URL, shown: true }),
    title: () => "QR code shown",
  },
  {
    name: "end_call",
    description:
      "Hang up the call. Call it whenever the user says goodbye or asks you to end the call; nothing else ends the call. Say goodbye in the same reply.",
    run: () => {
      call.hangUp(); // after the goodbye has been spoken
      return "The call ends once you finish this reply, so say goodbye and that you are hanging up.";
    },
    title: () => "Hanging up",
  },
];
