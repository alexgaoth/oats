import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Download, FolderOpen, KeyRound, Plus, X } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSettings } from "../../hooks/useSettings";
import { formatHotkey } from "../../utils/hotkeyLabel";
import { getCachedPlatform } from "../../utils/platform";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { NativeSelect } from "../ui/native-select";
import { SegmentedControl } from "../ui/segmented";
import { Toggle } from "../ui/toggle";
import HotkeyInput from "../ui/HotkeyInput";
import { SettingRow, SettingsSection } from "./SettingsKit";
import { processingMode, setProcessing, type ProcessingMode } from "./processing";
import { useSummaryReadiness } from "../../hooks/useSummaryReadiness";
import type { ContextStatus } from "../../types/conversationEvents";

/**
 * The parts of Settings that are Oats's own rather than inherited: the one
 * Processing switch, the conversation shortcut, the shortcuts reference, the
 * question cards, the vault and the dictionary.
 */

export function ProcessingCard() {
  const { t } = useTranslation();
  // Subscribing to the four modes is what re-renders this when a per-feature
  // choice below makes the whole "mixed".
  const mode = useSettingsStore((state) => processingMode(state));
  return (
    <SettingsSection footer={mode === "mixed" ? t("oats.settings.processingMixed") : undefined}>
      <SettingRow
        label={t("oats.settings.processing")}
        description={t("oats.settings.processingDescription")}
      >
        <SegmentedControl<ProcessingMode | "mixed">
          aria-label={t("oats.settings.processing")}
          value={mode}
          onValueChange={(next) => {
            if (next !== "mixed") setProcessing(next);
          }}
          options={[
            {
              value: "local",
              label: (
                <span className="flex items-center gap-1.5">
                  <Cpu aria-hidden="true" className="size-4" />
                  {t("oats.settings.processingLocal")}
                </span>
              ),
            },
            {
              value: "providers",
              label: (
                <span className="flex items-center gap-1.5">
                  <KeyRound aria-hidden="true" className="size-4" />
                  {t("oats.settings.processingProviders")}
                </span>
              ),
            },
          ]}
        />
      </SettingRow>
    </SettingsSection>
  );
}

/** Start and stop a conversation from anywhere. */
export function ConversationShortcutRow() {
  const { t } = useTranslation();
  const conversationKey = useSettingsStore((state) => state.conversationKey);
  const setConversationKey = useSettingsStore((state) => state.setConversationKey);
  const rejection = useSettingsStore((state) => state.hotkeyRejection);
  return (
    <SettingRow
      label={t("oats.settings.global.conversation")}
      description={
        rejection?.key === "conversationKey" ? (
          <span className="text-destructive">
            {t("oats.settings.hotkeyRejected", { hotkey: rejection.hotkey })}
            {rejection.message ? ` ${rejection.message}` : ""}
          </span>
        ) : (
          t("oats.settings.global.conversationHint")
        )
      }
    >
      <HotkeyInput
        variant="settings"
        value={conversationKey}
        onChange={(value) => void setConversationKey(value)}
      />
    </SettingRow>
  );
}

/** The keys that work inside the window. Fixed, so a reference rather than controls. */
export function InAppShortcuts() {
  const { t } = useTranslation();
  const conversationKey = useSettingsStore((state) => state.conversationKey);
  const isMac = getCachedPlatform() === "darwin";
  const rows: [string, string][] = [
    [
      t("oats.settings.inApp.toggleConversation"),
      formatHotkey(conversationKey, getCachedPlatform()),
    ],
    [t("oats.settings.inApp.mark"), "M"],
    [t("oats.settings.inApp.search"), "/"],
    [t("oats.settings.inApp.find"), isMac ? "⌘F" : "Ctrl+F"],
    [t("oats.settings.inApp.back"), "Esc"],
  ];
  return (
    <SettingsSection
      title={t("oats.settings.inApp.title")}
      description={t("oats.settings.inApp.description")}
    >
      {rows
        .filter(([, keys]) => keys)
        .map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-6 px-5 py-3">
            <span className="text-sm text-foreground">{label}</span>
            <Kbd>{keys}</Kbd>
          </div>
        ))}
    </SettingsSection>
  );
}

/**
 * Question cards: Oats notices a factual question nobody in the room could
 * answer, and offers to look it up. Detection is local; the model refines it.
 */
export function QuestionCardSettings() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((state) => state.conversationAideEnabled);
  const setEnabled = useSettingsStore((state) => state.setConversationAideEnabled);
  const inRoom = useSettingsStore((state) => state.conversationAideInRoomEnabled);
  const setInRoom = useSettingsStore((state) => state.setConversationAideInRoomEnabled);
  // Every recording is in the room, so the cards show only when both are on.
  // One switch drives both; two toggles for one effect read as two features.
  const on = enabled && inRoom;
  const setOn = (value: boolean) => {
    setEnabled(value);
    setInRoom(value);
  };
  const model = useSettingsStore((state) => state.conversationAideModel);
  const searchUrl = useSettingsStore((state) => state.conversationAideSearchBaseUrl);
  const setSearchUrl = useSettingsStore((state) => state.setConversationAideSearchBaseUrl);
  const autoSearch = useSettingsStore((state) => state.conversationAutoSearchEnabled);
  const setAutoSearch = useSettingsStore((state) => state.setConversationAutoSearchEnabled);

  // The optional classifier is chosen in the model screen with the other
  // models. Here it only decides which of two honest sentences to show.
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    void Promise.resolve(window.electronAPI?.modelGetAll?.()).then((items) =>
      setDownloaded(
        Array.isArray(items) && items.some((item) => item.id === model && item.isDownloaded)
      )
    );
  }, [model]);

  // The confidence and silence thresholds are gone from here: their defaults
  // are pinned by tests, and a person in a meeting should never tune them.
  return (
    <SettingsSection
      title={t("oats.settings.questions.title")}
      description={t("oats.settings.questions.description")}
    >
      <SettingRow
        label={t("oats.settings.questions.enable")}
        description={downloaded ? t("oats.aide.withModel") : t("oats.aide.withoutModel")}
        htmlFor="question-cards"
      >
        <Toggle id="question-cards" checked={on} onChange={setOn} />
      </SettingRow>
      {on && (
        <>
          <SettingRow
            label={t("oats.settings.autoSearch")}
            description={t("oats.settings.autoSearchHint")}
            htmlFor="auto-search"
          >
            <Toggle id="auto-search" checked={autoSearch} onChange={setAutoSearch} />
          </SettingRow>
          <SettingRow label={t("oats.settings.questions.searchWith")} htmlFor="search-url" stacked>
            <Input
              id="search-url"
              type="url"
              value={searchUrl}
              onChange={(event) => setSearchUrl(event.target.value)}
              spellCheck={false}
            />
          </SettingRow>
        </>
      )}
    </SettingsSection>
  );
}

/**
 * The optional model that refines question cards, shown in the writing-model
 * screen with the other models. Detection works without it (local pattern
 * matching), so it is a download offered, never a requirement.
 */
export function QuestionModelSettings() {
  const { t } = useTranslation();
  const model = useSettingsStore((state) => state.conversationAideModel);
  const setModel = useSettingsStore((state) => state.setConversationAideModel);
  const [models, setModels] = useState<
    Array<{ id: string; name?: string; isDownloaded?: boolean }>
  >([]);
  const [downloading, setDownloading] = useState(false);
  const refresh = useCallback(() => {
    void Promise.resolve(window.electronAPI?.modelGetAll?.()).then((items) =>
      setModels(Array.isArray(items) ? items : [])
    );
  }, []);
  useEffect(refresh, [refresh]);
  const downloaded = models.some((item) => item.id === model && item.isDownloaded);

  return (
    <SettingsSection
      title={t("oats.settings.questions.title")}
      description={t("oats.settings.questions.modelDescription")}
      className="mt-6"
    >
      <SettingRow label={t("oats.settings.questions.model")}>
        <NativeSelect
          aria-label={t("oats.settings.questions.model")}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="w-48"
        >
          {models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.id}
            </option>
          ))}
          {models.length === 0 && <option value={model}>{model}</option>}
        </NativeSelect>
        {!downloaded && model && (
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={() => {
              setDownloading(true);
              void Promise.resolve(window.electronAPI?.modelDownload?.(model)).finally(() => {
                setDownloading(false);
                refresh();
              });
            }}
          >
            <Download aria-hidden="true" />
            {t("oats.settings.questions.download")}
          </Button>
        )}
      </SettingRow>
    </SettingsSection>
  );
}

/** A path, shortened to its last two folders, with the whole of it on hover. */
function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

/**
 * The context check: a reply somebody was not sure of is checked against past
 * conversations and a folder the team shares (helpers/contextService.js,
 * helpers/contextCheck.mjs). Off by default: it reads what the team wrote and
 * uses the writing model, and both are choices to make, not defaults to find.
 */
export function ContextCheckSettings() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((state) => state.contextCheckEnabled);
  const setEnabled = useSettingsStore((state) => state.setContextCheckEnabled);
  const folder = useSettingsStore((state) => state.contextFolder);
  const setFolder = useSettingsStore((state) => state.setContextFolder);
  const readiness = useSummaryReadiness();
  const [status, setStatus] = useState<ContextStatus | null>(null);
  const agentOn = useSettingsStore((state) => state.contextAgentEnabled);
  const setAgentOn = useSettingsStore((state) => state.setContextAgentEnabled);
  // Whether Claude Code is on this Mac. The switch cannot be turned on
  // without it, and the row says so instead of failing in a meeting.
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.resolve(window.electronAPI?.contextAgentStatus?.()).then((status) => {
      if (!cancelled) setAgentAvailable(Boolean(status?.available));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // How far the folder's index has got. A large folder takes a few seconds,
  // and nothing else would say so; polled only while it is still reading.
  useEffect(() => {
    setStatus(null);
    if (!enabled || !folder) return;
    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;
    const poll = async () => {
      const next = await window.electronAPI?.getContextStatus?.();
      if (cancelled || !next) return;
      polls += 1;
      // Main hears of a new folder from the shell's effect, a moment after
      // this one asks: until it reports this folder, its status is the old one.
      const current = next.folder === folder;
      if (current) setStatus(next);
      if ((next.indexing || !current) && polls < 60) timer = window.setTimeout(poll, 800);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, folder]);

  const choose = async () => {
    const picked = await window.electronAPI?.chooseContextFolder?.();
    if (picked?.success && picked.path) setFolder(picked.path);
  };

  const folderState = !folder
    ? t("oats.settings.context.noFolder")
    : status?.error === "missing"
      ? t("oats.settings.context.missing")
      : status?.error === "unreadable"
        ? t("oats.settings.context.unreadable")
        : !status || status.indexing
          ? t("oats.settings.context.reading")
          : t("oats.settings.context.files", { count: status.files });

  return (
    <SettingsSection
      title={t("oats.settings.context.title")}
      description={t("oats.settings.context.description")}
    >
      <SettingRow
        label={t("oats.settings.context.enable")}
        description={
          enabled && readiness !== null && readiness !== "ready"
            ? t("oats.settings.context.needsModel")
            : t("oats.settings.context.enableHint")
        }
        htmlFor="context-check"
      >
        <Toggle id="context-check" checked={enabled} onChange={setEnabled} />
      </SettingRow>
      {enabled && (
        <SettingRow
          label={t("oats.settings.context.folder")}
          description={
            folder ? (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5" title={folder}>
                  <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{shortPath(folder)}</span>
                </span>
                <span className="tabular-nums">{folderState}</span>
              </span>
            ) : (
              folderState
            )
          }
        >
          {folder ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void choose()}>
                {t("oats.settings.context.change")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFolder("")}>
                {t("oats.settings.context.remove")}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void choose()}>
              {t("oats.settings.context.choose")}
            </Button>
          )}
        </SettingRow>
      )}
      {enabled && (
        <SettingRow
          label={t("oats.settings.context.agent")}
          description={
            agentAvailable === false
              ? t("oats.settings.context.agentMissing")
              : t("oats.settings.context.agentHint")
          }
          htmlFor="context-agent"
        >
          <Toggle
            id="context-agent"
            checked={agentOn && agentAvailable === true}
            onChange={setAgentOn}
            disabled={agentAvailable !== true}
          />
        </SettingRow>
      )}
    </SettingsSection>
  );
}

/** Each conversation writes itself into an Obsidian vault. */
export function VaultRow() {
  const { t } = useTranslation();
  const vaultPath = useSettingsStore((state) => state.obsidianVaultPath);
  const setVaultPath = useSettingsStore((state) => state.setObsidianVaultPath);
  const setVaultEnabled = useSettingsStore((state) => state.setObsidianExportEnabled);
  const choose = async () => {
    const picked = await window.electronAPI?.chooseObsidianVault?.();
    if (!picked?.success || !picked.path) return;
    setVaultPath(picked.path);
    setVaultEnabled(true);
  };
  return (
    <SettingRow
      label={t("oats.settings.connections.vaultFolder")}
      description={
        vaultPath ? (
          <span className="flex min-w-0 items-center gap-1.5" title={vaultPath}>
            <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{shortPath(vaultPath)}</span>
          </span>
        ) : (
          t("oats.settings.connections.noVault")
        )
      }
    >
      {vaultPath ? (
        <>
          <Button variant="outline" size="sm" onClick={() => void choose()}>
            {t("oats.settings.vaultChange")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVaultEnabled(false);
              setVaultPath("");
            }}
          >
            {t("oats.settings.vaultStop")}
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void choose()}>
          {t("oats.settings.vaultChoose")}
        </Button>
      )}
    </SettingRow>
  );
}

/**
 * Words Oats should hear right: names, products, jargon. They boost the speech
 * model and guide the cleanup, for dictation and conversations alike.
 */
export function DictionaryEditor() {
  const { t } = useTranslation();
  const words = useSettingsStore((state) => state.customDictionary);
  const setWords = useSettingsStore((state) => state.setCustomDictionary);
  // Auto-learn lives in useSettings, which also tells the main process.
  const { autoLearnCorrections: autoLearn, setAutoLearnCorrections: setAutoLearn } = useSettings();
  const [draft, setDraft] = useState("");
  const sorted = useMemo(
    () => [...words].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [words]
  );

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const fresh = draft
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean)
      .filter((word) => !words.some((known) => known.toLowerCase() === word.toLowerCase()));
    if (fresh.length) setWords([...words, ...fresh]);
    setDraft("");
  };

  return (
    <SettingsSection
      title={t("oats.settings.dictionary.title")}
      description={t("oats.settings.dictionary.description")}
    >
      <div className="px-5 py-4">
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("oats.settings.dictionary.placeholder")}
            aria-label={t("oats.settings.dictionary.placeholder")}
            spellCheck={false}
          />
          <Button type="submit" variant="outline" disabled={!draft.trim()}>
            <Plus aria-hidden="true" />
            {t("oats.settings.dictionary.add")}
          </Button>
        </form>
        {sorted.length ? (
          <ul
            className="mt-3 flex flex-wrap gap-1.5"
            aria-label={t("oats.settings.dictionary.title")}
          >
            {sorted.map((word) => (
              <li key={word}>
                <Badge className="gap-1 py-0.5 pr-1 text-[13px] font-normal">
                  {word}
                  <button
                    type="button"
                    aria-label={t("oats.settings.dictionary.remove", { word })}
                    onClick={() => setWords(words.filter((known) => known !== word))}
                    className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {t("oats.settings.dictionary.empty")}
          </p>
        )}
      </div>
      <SettingRow
        label={t("oats.settings.dictionary.autoLearn")}
        description={t("oats.settings.dictionary.autoLearnDescription")}
        htmlFor="auto-learn"
      >
        <Toggle id="auto-learn" checked={autoLearn} onChange={setAutoLearn} />
      </SettingRow>
    </SettingsSection>
  );
}
