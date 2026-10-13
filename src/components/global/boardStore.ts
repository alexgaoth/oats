import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BoardWidget } from "./boardLayout";
import {
  ALL_TAB,
  BOARD_STORAGE_KEY,
  BOARD_VERSION,
  EMPTY_BOARD,
  migrateBoardState,
  migrateLegacyMapLayout,
  withTabLayout,
  withoutTabLayout,
} from "./boardPersistence";
import type { BoardPersisted } from "./boardPersistence";

// The board's arrangement, one layout per tab, kept in localStorage so it
// survives a restart (`boardPersistence.ts` has the rules and the migration).

interface BoardStore extends BoardPersisted {
  /** The tab on screen. Kept while the board is away (a conversation opened
      from it, the list), not across a restart. */
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  saveLayout: (tabId: string, widgets: BoardWidget[]) => void;
  resetLayout: (tabId: string) => void;
}

// Before the store reads its own key: the single map's arrangement becomes the
// All tab's force graph arrangement, once.
if (typeof localStorage !== "undefined") migrateLegacyMapLayout(localStorage);

export const useBoardStore = create<BoardStore>()(
  persist(
    (set) => ({
      ...EMPTY_BOARD,
      activeTab: ALL_TAB,
      setActiveTab: (tabId) => set({ activeTab: tabId }),
      saveLayout: (tabId, widgets) =>
        set((state) => withTabLayout({ layouts: state.layouts }, tabId, widgets)),
      resetLayout: (tabId) => set((state) => withoutTabLayout({ layouts: state.layouts }, tabId)),
    }),
    {
      name: BOARD_STORAGE_KEY,
      version: BOARD_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ layouts: state.layouts }),
      migrate: (persisted, version) => migrateBoardState(persisted, version),
      // A layout written by hand or by an older build is cleaned on the way in.
      merge: (persisted, current) => ({
        ...current,
        ...migrateBoardState(persisted, BOARD_VERSION),
      }),
    }
  )
);
