import pellwood from "../sets/pellwood.mjs";
import ideas from "../sets/ideas.mjs";

// Where the harness runs (npm run demo:harness, from the repo root).
export const HARNESS = process.env.OATS_HARNESS ?? "http://127.0.0.1:5391";
/** The content the film shows: `OATS_SET=ideas` for the second film. */
export const SHEET = { pellwood, ideas }[process.env.OATS_SET ?? "pellwood"];
if (!SHEET) throw new Error(`No set ${process.env.OATS_SET}`);
export const url = (query = "") => {
  const all = [query, SHEET.query].filter(Boolean).join("&");
  return `${HARNESS}/demo.html?panel=true${all ? `&${all}` : ""}`;
};
/** The workspace is up: the sidebar is drawn and the demo is listening. */
export const READY = "window.oatsDemo && document.querySelector('aside') && document.fonts.status === 'loaded'";
