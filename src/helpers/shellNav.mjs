// Where you are, as the sidebar and the title bar say it.
//
// Search is not a fourth surface: it searches the conversations, on the
// Conversations page. But the sidebar lists it as its own item, so while you
// are searching (the search field has focus or holds a query) the sidebar
// marks Search and the title says Search. Pressing Search once lit
// Conversations and titled the page Conversations, and it looked as if the
// click had gone to the wrong item.
//
// Pure, so the sidebar and the title cannot disagree, and so it is tested.

/**
 * @param {"conversation" | "intelligence" | "settings"} surface
 * @param {boolean} searching
 * @returns {{ current: "home" | "conversations" | "search" | "settings", titleKey: string }}
 */
export function shellNav(surface, searching) {
  if (surface === "settings") return { current: "settings", titleKey: "oats.nav.settings" };
  if (surface === "intelligence") {
    return searching
      ? { current: "search", titleKey: "oats.shell.search" }
      : { current: "conversations", titleKey: "oats.shell.conversations" };
  }
  return { current: "home", titleKey: "oats.shell.home" };
}

/**
 * Whether the Conversations page is searching: in the list (not reading a
 * conversation, not on the board), with the field focused or a query in it.
 */
export function isSearching({ view, reading, focused, query }) {
  if (reading || view !== "list") return false;
  return Boolean(focused) || String(query ?? "").trim() !== "";
}
