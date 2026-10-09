import {
  Info,
  Keyboard,
  Mic,
  Plug,
  Settings2,
  ShieldCheck,
  Sparkles,
  TextCursorInput,
} from "lucide-react";
import type { ComponentType } from "react";

/** The pages of Settings, in the order the sidebar lists them. */
export type SettingsPageId =
  | "general"
  | "shortcuts"
  | "recording"
  | "dictation"
  | "models"
  | "connections"
  | "privacy"
  | "about";

export interface SettingsPageEntry {
  id: SettingsPageId;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  /** Translation keys, written out so the key checker sees them. */
  title: string;
  description: string;
}

export const SETTINGS_PAGES: SettingsPageEntry[] = [
  {
    id: "general",
    icon: Settings2,
    title: "oats.settings.pages.general.title",
    description: "oats.settings.pages.general.description",
  },
  {
    id: "shortcuts",
    icon: Keyboard,
    title: "oats.settings.pages.shortcuts.title",
    description: "oats.settings.pages.shortcuts.description",
  },
  {
    id: "recording",
    icon: Mic,
    title: "oats.settings.pages.recording.title",
    description: "oats.settings.pages.recording.description",
  },
  {
    id: "dictation",
    icon: TextCursorInput,
    title: "oats.settings.pages.dictation.title",
    description: "oats.settings.pages.dictation.description",
  },
  {
    id: "models",
    icon: Sparkles,
    title: "oats.settings.pages.models.title",
    description: "oats.settings.pages.models.description",
  },
  {
    id: "connections",
    icon: Plug,
    title: "oats.settings.pages.connections.title",
    description: "oats.settings.pages.connections.description",
  },
  {
    id: "privacy",
    icon: ShieldCheck,
    title: "oats.settings.pages.privacy.title",
    description: "oats.settings.pages.privacy.description",
  },
  {
    id: "about",
    icon: Info,
    title: "oats.settings.pages.about.title",
    description: "oats.settings.pages.about.description",
  },
];

export function isSettingsPageId(value: unknown): value is SettingsPageId {
  return SETTINGS_PAGES.some((page) => page.id === value);
}
