import { create } from "zustand";
import type { SettingsPageId } from "../components/settings/settingsPages";

/**
 * Which Settings page is open. Shared, because the sidebar lists the pages, the
 * Settings view draws the open one, and any screen can send you to a page
 * ("set up a summary model" → AI models) without threading props through the
 * shell.
 */
interface SettingsNavState {
  page: SettingsPageId;
  setPage: (page: SettingsPageId) => void;
}

export const useSettingsNavStore = create<SettingsNavState>((set) => ({
  page: "general",
  setPage: (page) => set({ page }),
}));
