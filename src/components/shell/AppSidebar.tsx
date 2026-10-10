import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, House, MessagesSquare, Search, Settings, Square } from "lucide-react";
import { cn } from "../lib/utils";
import { Kbd } from "../ui/kbd";
import { OatsMark } from "./OatsMark";
import { useNotes } from "../../stores/noteStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { SETTINGS_PAGES, type SettingsPageId } from "../settings/settingsPages";

export type ShellSurface = "conversation" | "intelligence" | "settings";

function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Elapsed time of the running conversation, ticking once a second. */
function useRecordingClock(recording: boolean): string | null {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!recording) {
      setStartedAt(null);
      return undefined;
    }
    setStartedAt((previous) => previous ?? Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  return startedAt === null ? null : elapsedLabel(now - startedAt);
}

function NavItem({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm",
        "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground group-aria-[current=page]:text-brand-ink" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

/**
 * The app frame's left column: the record action, the destinations, the most
 * recent conversations, and Settings at the foot — the layout every standard
 * desktop tool shares, so nothing about getting around Oats has to be learned.
 */
export function AppSidebar({
  surface,
  onNavigate,
  onOpenNote,
  onSearch,
  settingsPage,
  onSettingsPage,
  onExitSettings,
}: {
  surface: ShellSurface;
  onNavigate: (surface: ShellSurface) => void;
  onOpenNote: (noteId: number) => void;
  onSearch: () => void;
  settingsPage: SettingsPageId;
  onSettingsPage: (page: SettingsPageId) => void;
  onExitSettings: () => void;
}) {
  const { t } = useTranslation();
  const recording = useMeetingRecordingStore((state) => state.isRecording);
  const clock = useRecordingClock(recording);
  const notes = useNotes();
  const recent = useMemo(
    () => notes.filter((note) => note.note_type === "meeting").slice(0, 6),
    [notes]
  );

  // The same path as the global shortcut, the tray and the floating oat, so
  // there is one implementation of "start or stop a conversation".
  const toggleRecording = () => {
    onNavigate("conversation");
    void window.electronAPI?.requestToggleConversation?.();
  };

  // In Settings the sidebar becomes the list of Settings pages, with the way
  // back at the top — the frame Linear and System Settings use, so Settings
  // needs no second column of its own.
  if (surface === "settings") {
    return (
      <aside
        aria-label={t("oats.shell.sidebar")}
        className="flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      >
        <div
          className="h-[52px] shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="px-3 pb-4">
          <NavItem
            icon={ChevronLeft}
            label={t("oats.settings.backToApp")}
            onClick={onExitSettings}
          />
        </div>
        <div className="px-5 pb-1.5 text-xs font-medium text-muted-foreground">
          {t("oats.nav.settings")}
        </div>
        <nav aria-label={t("oats.settings.navLabel")} className="flex flex-col gap-0.5 px-3">
          {SETTINGS_PAGES.map((page) => (
            <NavItem
              key={page.id}
              icon={page.icon}
              label={t(page.title)}
              active={settingsPage === page.id}
              onClick={() => onSettingsPage(page.id)}
            />
          ))}
        </nav>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("oats.shell.sidebar")}
      className="flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      {/* The traffic lights live here on macOS; the band moves the window. */}
      <div
        className="h-[52px] shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <div className="flex items-center gap-2 px-4 pb-3">
        {/* Spins once when the app starts, and again on a click. */}
        <OatsMark interactive spinOnLaunch />
        <span className="text-sm font-semibold tracking-[-0.01em]">Oats</span>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={toggleRecording}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm font-medium shadow-xs",
            "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
            recording
              ? "bg-recording text-recording-foreground hover:bg-recording/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {recording ? (
            <Square className="size-3.5 fill-current" aria-hidden="true" />
          ) : (
            <span aria-hidden="true" className="size-2.5 rounded-full bg-current" />
          )}
          <span className="flex-1 text-left">
            {recording ? t("oats.shell.stop") : t("oats.shell.record")}
          </span>
          {recording && clock && (
            <span className="text-[13px] tabular-nums opacity-90">{clock}</span>
          )}
        </button>
      </div>

      <nav aria-label={t("oats.nav.label")} className="flex flex-col gap-0.5 px-3">
        <NavItem
          icon={House}
          label={t("oats.shell.home")}
          active={surface === "conversation"}
          onClick={() => onNavigate("conversation")}
        />
        <NavItem
          icon={MessagesSquare}
          label={t("oats.shell.conversations")}
          active={surface === "intelligence"}
          onClick={() => onNavigate("intelligence")}
        />
        <NavItem
          icon={Search}
          label={t("oats.shell.search")}
          onClick={onSearch}
          disabled={recording}
          trailing={<Kbd>/</Kbd>}
        />
      </nav>

      <div className="mt-6 px-5 pb-1.5 text-xs font-medium text-muted-foreground">
        {t("oats.shell.recent")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {recent.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
            {t("oats.shell.noRecent")}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {recent.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onOpenNote(note.id)}
                  className={cn(
                    "flex h-8 w-full items-center rounded-md px-2 text-left text-[13px] text-sidebar-foreground",
                    "outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                >
                  <span className="truncate">{note.title || t("oats.untitled")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-sidebar-border px-3 py-3">
        <NavItem
          icon={Settings}
          label={t("oats.nav.settings")}
          disabled={recording}
          onClick={() => onNavigate("settings")}
        />
      </div>
    </aside>
  );
}
