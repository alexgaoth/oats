// How the Global conversations board is kept between launches: one layout per
// tab, in localStorage under one key, versioned.
//
// A tab that has never been arranged has no entry, and shows the default
// layout sized to the window it is in. Moving, resizing, adding or removing a
// card saves that tab's layout; Reset layout removes the entry again.
//
// Pure, so the migration and the clean-up of a damaged entry are tested.

import { WIDGET_MIN, isWidgetType } from "./boardLayout.ts";
import type { BoardWidget } from "./boardLayout.ts";

export const BOARD_STORAGE_KEY = "oats:global-board";
export const BOARD_VERSION = 1;

/** The tab that shows every conversation. A group's tab is `group:<id>`. */
export const ALL_TAB = "all";

export function groupTab(groupId: number): string {
  return `group:${groupId}`;
}

/**
 * Where a tab's force graph keeps the places its discs were dragged to. The
 * graph saves them itself (`ForceGraph`'s `layoutKey`), as fractions of its
 * canvas, so they survive a resized card.
 */
export function forceLayoutKey(tabId: string): string {
  return `oats:global-force-layout:${tabId}`;
}

/** Where the single map of conversations kept its arrangement before tabs. */
export const LEGACY_MAP_LAYOUT_KEY = "oats:lifetime-layout";

export interface BoardPersisted {
  /** Arranged tabs only. */
  layouts: Record<string, BoardWidget[]>;
}

export const EMPTY_BOARD: BoardPersisted = { layouts: {} };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * A layout read back from storage, cleaned: cards of a type this build does
 * not know are dropped, so are cards with a broken position, and a second card
 * of a type already placed. Sizes are held to their minimum. Returns null when
 * nothing usable is left of a layout that had cards, which means "show the
 * default"; an empty layout is a board somebody cleared, and stays empty.
 */
export function sanitizeLayout(raw: unknown): BoardWidget[] | null {
  if (!Array.isArray(raw)) return null;
  // Every card removed on purpose: the board stays empty until Reset layout.
  if (!raw.length) return [];
  const seen = new Set<string>();
  const widgets: BoardWidget[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { type, x, y, w, h } = item as Record<string, unknown>;
    if (!isWidgetType(type) || seen.has(type)) continue;
    if (!finite(x) || !finite(y) || !finite(w) || !finite(h)) continue;
    seen.add(type);
    widgets.push({
      id: type,
      type,
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: Math.max(WIDGET_MIN[type].w, Math.round(w)),
      h: Math.max(WIDGET_MIN[type].h, Math.round(h)),
    });
  }
  return widgets.length ? widgets : null;
}

/**
 * Bring whatever was stored up to the current version. Version 1 is the first;
 * anything stored without a version, or in a shape this build does not
 * recognise, is cleaned entry by entry rather than thrown away whole, so one
 * damaged tab never costs the others their arrangement.
 */
export function migrateBoardState(persisted: unknown, _version: number): BoardPersisted {
  const layouts: Record<string, BoardWidget[]> = {};
  const source =
    persisted && typeof persisted === "object"
      ? (persisted as { layouts?: unknown }).layouts
      : undefined;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [tab, raw] of Object.entries(source as Record<string, unknown>)) {
      const clean = sanitizeLayout(raw);
      if (clean) layouts[tab] = clean;
    }
  }
  return { layouts };
}

/** One tab's layout saved, every other tab's left exactly as it was. */
export function withTabLayout(
  state: BoardPersisted,
  tabId: string,
  widgets: BoardWidget[]
): BoardPersisted {
  return { layouts: { ...state.layouts, [tabId]: widgets.map((widget) => ({ ...widget })) } };
}

/** One tab back to its default; the others untouched. */
export function withoutTabLayout(state: BoardPersisted, tabId: string): BoardPersisted {
  if (!(tabId in state.layouts)) return state;
  const layouts = { ...state.layouts };
  delete layouts[tabId];
  return { layouts };
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The map of conversations was one view with one arrangement. It is now the
 * force graph on the All tab, so an arrangement somebody made by hand moves
 * there rather than being lost. It never overwrites an arrangement the All tab
 * already has, and runs to completion once: the old key is removed after.
 */
export function migrateLegacyMapLayout(storage: KeyValueStorage): boolean {
  let legacy: string | null = null;
  try {
    legacy = storage.getItem(LEGACY_MAP_LAYOUT_KEY);
  } catch {
    // Unavailable storage: the graph lays itself out afresh.
    return false;
  }
  if (legacy === null) return false;
  let moved = false;
  try {
    const target = forceLayoutKey(ALL_TAB);
    const parsed = JSON.parse(legacy);
    const usable = parsed && typeof parsed === "object" && !Array.isArray(parsed);
    if (usable && storage.getItem(target) === null) {
      storage.setItem(target, legacy);
      moved = true;
    }
  } catch {
    // A damaged arrangement is not worth keeping; the graph lays itself out.
  }
  try {
    storage.removeItem(LEGACY_MAP_LAYOUT_KEY);
  } catch {
    // Left behind, it is tried again next launch and changes nothing.
  }
  return moved;
}
