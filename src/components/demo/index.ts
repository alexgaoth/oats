// The demo pieces: the app's own components, given the example conversation
// (`helpers/oatsTour.mjs`, `tourConversation`), and usable. The tour at the end
// of setup (`onboarding/OatsTour.tsx`) shows them one at a time.
//
// What may happen here: anything that only changes what is shown (Lanes or
// Graph, a topic's quote, a voice's turns, the answers, a card dismissed and
// brought back). What may not: nothing here calls the main process, writes
// storage, a store or a setting, asks the network for anything, or opens a
// window or a link. That is held by construction, not by care: a piece and
// every module it imports read no store and never name `window.electronAPI`
// (test/helpers/oatsTour.test.js walks the imports). The components take what
// would leave the page (a web search, opening a turn or a source, naming a
// voice) as a prop, and these pieces pass none, so those controls are not
// drawn at all rather than drawn and dead.

export { default as DemoFlow } from "./DemoFlow";
export { default as DemoQuestions } from "./DemoQuestions";
export { default as DemoShape } from "./DemoShape";
export { default as DemoVoices } from "./DemoVoices";
export { default as DemoOpen } from "./DemoOpen";
