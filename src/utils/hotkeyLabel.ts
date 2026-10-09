// Turns a stored Electron accelerator into something a person can read.
//
// Oats shows the conversation shortcut on the idle screen so the app teaches its
// own hotkey — after somebody has learned it they will never open the window to
// record again, which makes this one of the highest-value lines in the product.
// `CommandOrControl+Shift+O` is not that line; `⇧⌘O` is.

const MAC_SYMBOLS: Record<string, string> = {
  commandorcontrol: "⌘",
  cmd: "⌘",
  command: "⌘",
  super: "⌘",
  meta: "⌘",
  control: "⌃",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];

const OTHER_LABELS: Record<string, string> = {
  commandorcontrol: "Ctrl",
  cmd: "Ctrl",
  command: "Ctrl",
  control: "Ctrl",
  ctrl: "Ctrl",
  super: "Super",
  meta: "Super",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};

/**
 * @param accelerator e.g. `CommandOrControl+Shift+O`
 * @param platform    `darwin` uses symbols and no separator, everything else
 *                    uses words joined by `+` — matching each platform's own
 *                    convention rather than inventing a third.
 */
export function formatHotkey(accelerator: string | null | undefined, platform: string): string {
  if (!accelerator) return "";
  const isMac = platform === "darwin";
  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const rendered = parts.map((part) => {
    const key = part.toLowerCase();
    if (isMac && MAC_SYMBOLS[key]) return MAC_SYMBOLS[key];
    if (!isMac && OTHER_LABELS[key]) return OTHER_LABELS[key];
    // A bare letter reads better capitalised; longer names (F9, Space) are
    // already written the way people say them.
    return part.length === 1 ? part.toUpperCase() : part;
  });

  if (!isMac) return rendered.join("+");
  // Every Mac menu writes modifiers in one order — Control, Option, Shift,
  // Command — whatever order the accelerator was stored in. `⌘⇧O` is a shortcut
  // nobody has seen in a menu; `⇧⌘O` is the one they will recognise.
  const rank = (symbol: string) => MAC_ORDER.indexOf(symbol);
  const modifiers = rendered.filter((part) => rank(part) >= 0).sort((a, b) => rank(a) - rank(b));
  const keys = rendered.filter((part) => rank(part) < 0);
  return [...modifiers, ...keys].join("");
}
