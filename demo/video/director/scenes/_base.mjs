// Where the harness runs (npm run demo:harness, from the repo root).
export const HARNESS = process.env.OATS_HARNESS ?? "http://127.0.0.1:5391";
export const url = (query = "") => `${HARNESS}/demo.html?panel=true${query ? `&${query}` : ""}`;
/** The workspace is up: the sidebar is drawn and the demo is listening. */
export const READY = "window.oatsDemo && document.querySelector('aside') && document.fonts.status === 'loaded'";
