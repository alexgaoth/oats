// Opening a search in its **own** browser window rather than a tab.
//
// `shell.openExternal` hands the URL to the desktop's default handler, which for
// every mainstream browser means "new tab in the most recently focused window".
// During a conversation that is the wrong behaviour twice over: it can yank the
// user to a different workspace where that window happens to live, and it buries
// the result among whatever tabs were already open there.
//
// A dedicated window appears on the current workspace and holds exactly one
// thing. Browsers all spell that the same way — `--new-window` — so the only
// real work is finding which browser to ask.
//
// Pure and dependency-free so the mapping can be unit-tested; the actual spawn
// lives in the caller.

// Desktop-entry name → the executable that accepts `--new-window`. Matched as a
// substring so `firefox-esr.desktop`, `google-chrome-stable.desktop`, and
// `brave-browser-nightly.desktop` all resolve without an entry each.
const BROWSER_COMMANDS = [
  ["firefox", "firefox"],
  ["librewolf", "librewolf"],
  ["zen", "zen-browser"],
  ["chromium", "chromium"],
  ["google-chrome", "google-chrome-stable"],
  ["brave", "brave-browser"],
  ["vivaldi", "vivaldi"],
  ["microsoft-edge", "microsoft-edge"],
  ["opera", "opera"],
];

/**
 * Maps an xdg default-web-browser desktop entry to an argv that opens the URL in
 * a new window. Returns null when the browser is unknown, so the caller can fall
 * back to the platform's default handler rather than guessing at a command.
 *
 * @param {string} desktopEntry e.g. "firefox.desktop"
 * @param {string} url
 * @returns {{command: string, args: string[]} | null}
 */
function newWindowCommand(desktopEntry, url) {
  const entry = String(desktopEntry || "")
    .trim()
    .toLowerCase();
  if (!entry || !url) return null;
  for (const [needle, command] of BROWSER_COMMANDS) {
    if (entry.includes(needle)) {
      return { command, args: ["--new-window", url] };
    }
  }
  return null;
}

export { BROWSER_COMMANDS, newWindowCommand };
