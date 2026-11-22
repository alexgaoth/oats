import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ProviderKeyField } from "./ProviderKeyField";
import { featureRouteName } from "./featureRouteCopy";
import {
  KEY_PROVIDER_NAMES,
  removeApiKey,
  renameApiKey,
  selectKeyUsers,
  selectRemovalPlan,
  useSavedKeys,
  type SavedKey,
} from "../../stores/apiKeys";
import { useSettingsStore } from "../../stores/settingsStore";
import { KEY_NAME_MAX, keyUsable } from "../../helpers/apiKeys.mjs";
import type { Feature } from "../../helpers/featureRoutes.mjs";
import { getCachedPlatform } from "../../utils/platform";

/** Features as people read a list of them: "Conversations and Writing". */
function useFeatureList() {
  const { t, i18n } = useTranslation();
  return (features: Feature[]) => {
    const names = features.map((feature) => featureRouteName(t, feature));
    try {
      return new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(names);
    } catch {
      return names.join(", ");
    }
  };
}

/**
 * Settings › AI models › API keys (Alex, 2026-11-22): the saved OpenAI and
 * Anthropic keys, one line each with its name, its provider and last four
 * characters, and which features use it; Rename in place, and Remove, which
 * asks in place and says where those features go. Add API key heads the list.
 * With more than one key per provider, this is where keys are managed; each
 * feature's own key is chosen on its row (FeatureModelRow's key menu).
 */
export function ApiKeysList() {
  const { t } = useTranslation();
  const titleId = useId();
  const keys = useSavedKeys();
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  return (
    <section aria-labelledby={titleId} data-api-keys>
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {t("oats.keys.title")}
          </h3>
          {keys.length === 0 && (
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              {t("oats.keys.empty")}
            </p>
          )}
        </div>
        <Button
          ref={addButton}
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" />
          {t("apiKeyInput.add")}
        </Button>
      </div>
      {keys.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {keys.map((key) => (
            <KeyRow key={key.id} savedKey={key} onRemoved={() => addButton.current?.focus()} />
          ))}
        </div>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent
          aria-describedby={undefined}
          className="oats-surface motion-reduce:animate-none"
        >
          <DialogTitle>{t("apiKeyInput.add")}</DialogTitle>
          <ProviderKeyField autoFocus />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function KeyRow({ savedKey, onRemoved }: { savedKey: SavedKey; onRemoved: () => void }) {
  const { t } = useTranslation();
  const list = useFeatureList();
  const users = useSettingsStore(useShallow((state) => selectKeyUsers(state, savedKey.id)));
  const [mode, setMode] = useState<"view" | "rename" | "remove">("view");
  const [replacing, setReplacing] = useState(false);
  const [draft, setDraft] = useState(savedKey.name);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Back from renaming or from the question, the focus goes back to the menu.
  const editing = useRef(false);
  useEffect(() => {
    if (mode !== "view") editing.current = true;
    else if (editing.current) {
      editing.current = false;
      menuButton.current?.focus();
    }
  }, [mode]);

  const saveName = (event: React.FormEvent) => {
    event.preventDefault();
    // An empty name gives the key back its default name (renameApiKey).
    renameApiKey(savedKey.id, draft);
    setMode("view");
  };

  return (
    <div data-key-row={savedKey.name} className="px-5 py-3">
      <div className="flex items-center gap-3">
        <KeyRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {mode === "rename" ? (
            <form onSubmit={saveName} className="flex items-center gap-2" data-key-rename>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  setMode("view");
                }}
                aria-label={t("oats.keys.renameLabel", { name: savedKey.name })}
                placeholder={t("oats.keys.nameHint")}
                maxLength={KEY_NAME_MAX}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="h-8 min-w-0 flex-1 text-sm"
              />
              <Button type="submit" size="sm">
                {t("common.save")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("view")}>
                {t("common.cancel")}
              </Button>
            </form>
          ) : (
            <p className="truncate text-sm font-medium text-foreground">{savedKey.name}</p>
          )}
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            {KEY_PROVIDER_NAMES[savedKey.provider]}{" "}
            <span className="font-mono tabular-nums">••••{savedKey.tail}</span>
            <span aria-hidden="true"> · </span>
            {/* A key the provider refused serves nothing until it is replaced;
                say so here, where Replace is. */}
            {keyUsable(savedKey.status) ? (
              <span data-key-users>
                {users.length
                  ? t("oats.keys.usedBy", { features: list(users) })
                  : t("oats.keys.notInUse")}
              </span>
            ) : (
              <span data-key-users className="text-warning">
                {t("oats.keys.reasonRefused", { provider: KEY_PROVIDER_NAMES[savedKey.provider] })}
              </span>
            )}
          </p>
        </div>
        {mode === "view" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuButton}
                variant="ghost"
                size="icon-sm"
                aria-label={t("oats.keys.actions", { name: savedKey.name })}
                data-key-actions
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                onSelectAfterClose={() => {
                  setDraft(savedKey.name);
                  setMode("rename");
                }}
              >
                <Pencil aria-hidden="true" />
                {t("oats.keys.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelectAfterClose={() => setReplacing(true)}>
                <RefreshCw aria-hidden="true" />
                {t("oats.keys.replaceEllipsis")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelectAfterClose={() => setMode("remove")}>
                <Trash2 aria-hidden="true" />
                {t("oats.keys.remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {mode === "remove" && (
        <RemoveQuestion
          savedKey={savedKey}
          onCancel={() => setMode("view")}
          onRemoved={onRemoved}
        />
      )}
      {/* A key revoked or rotated: paste its successor in its place. It keeps
          its name and the features that use it (replaceApiKey). */}
      <Dialog open={replacing} onOpenChange={setReplacing}>
        <DialogContent
          className="oats-surface motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuButton.current?.focus();
          }}
        >
          <DialogTitle>{t("oats.keys.replaceTitle", { name: savedKey.name })}</DialogTitle>
          <DialogDescription>{t("oats.keys.replaceDescription")}</DialogDescription>
          <ProviderKeyField provider={savedKey.provider} replaces={savedKey.id} autoFocus />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Remove, asked in place: the key's name, where each feature that uses it
 * goes (another usable key of the same provider, never another provider's;
 * else this Mac until another key is chosen), Cancel and Remove. Main deletes the
 * secret (removeApiKey).
 */
function RemoveQuestion({
  savedKey,
  onCancel,
  onRemoved,
}: {
  savedKey: SavedKey;
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const list = useFeatureList();
  const [removing, setRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The plan is new each time it is asked for, so it is worked out from the
  // two things it reads, not selected: a selector that returns a new array on
  // every call renders without end.
  const keyRecords = useSettingsStore((state) => state.keyRecords);
  const featurePreferences = useSettingsStore((state) => state.featurePreferences);
  const plan = useMemo(
    () => selectRemovalPlan({ keyRecords, featurePreferences }, savedKey.id),
    [keyRecords, featurePreferences, savedKey.id]
  );
  const mac = getCachedPlatform() === "darwin";
  const groups = new Map<string, { to: SavedKey | null; features: Feature[] }>();
  for (const move of plan) {
    const id = move.to?.id ?? "";
    const group = groups.get(id) ?? { to: move.to, features: [] };
    group.features.push(move.feature);
    groups.set(id, group);
  }
  const where = [...groups.values()].map(({ to, features }) =>
    to
      ? t("oats.keys.moveTo", { key: to.name, features: list(features) })
      : t(mac ? "oats.keys.moveToMac" : "oats.keys.moveToComputer", { features: list(features) })
  );
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-key-remove
      className="mt-3 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p id={titleId} className="text-sm font-medium text-foreground">
          {t("oats.keys.removeTitle", { name: savedKey.name })}
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
          {where.length ? where.join(" ") : t("oats.keys.removeUnused")}
        </p>
        {failure && (
          <p role="alert" className="mt-2 text-[13px] leading-5 text-destructive">
            {failure}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={removing} autoFocus>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              setFailure(null);
              // A removal main did not make leaves the key, and the question,
              // here, with the line the store gives (removeApiKey rejects).
              await removeApiKey(savedKey.id).catch((error: unknown) => {
                setFailure((error as Error)?.message || t("oats.keys.notRemoved"));
              });
              const kept = useSettingsStore
                .getState()
                .keyRecords.keys.some((key) => key.id === savedKey.id);
              if (kept) setRemoving(false);
              else onRemoved();
            }}
          >
            <Trash2 aria-hidden="true" />
            {t("oats.keys.remove")}
          </Button>
        </div>
      </div>
    </div>
  );
}
