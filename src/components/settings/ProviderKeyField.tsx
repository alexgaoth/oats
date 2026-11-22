import * as React from "react";
import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  selectUsableFeatureKey,
  selectWritingKeyProvider,
  useSettingsStore,
  type SettingsState,
} from "../../stores/settingsStore";
import {
  addApiKey,
  defaultKeyName,
  replaceApiKey,
  useSavedKeys,
  type ApiKeyProvider,
} from "../../stores/apiKeys";
import { getCachedPlatform } from "../../utils/platform";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { detectKeyProvider, type KeyProvider } from "../../utils/keyCheck";
import { defaultKeyOf, isKeyProvider, KEY_NAME_MAX } from "../../helpers/apiKeys.mjs";
import type { Feature } from "../../helpers/featureRoutes.mjs";
import { openExternalLink, withUtm } from "../../utils/externalLinks";
import { PROVIDER_KEYS } from "../../utils/writingKeys";

/** Where each provider hands out keys. */
const KEY_PAGES: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/app/api-keys",
  groq: "https://console.groq.com/keys",
  tinfoil: "https://tinfoil.sh/inference?utm_source=referral&utm_campaign=oats",
  openrouter: "https://openrouter.ai/keys",
};

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  tinfoil: "Tinfoil",
  openrouter: "OpenRouter",
};

type Setter = (key: string) => void;
// The providers whose keys have no names (decision 5): one key each, saved as it is.
const SETTERS: Record<string, (state: SettingsState) => Setter> = {
  gemini: (state) => state.setGeminiApiKey,
  groq: (state) => state.setGroqApiKey,
  tinfoil: (state) => state.setTinfoilApiKey,
  openrouter: (state) => state.setOpenrouterApiKey,
};

type Message = { tone: "success" | "warning" | "danger" | "muted"; text: string } | null;

/** What setup asks of the field: Get started checks and saves the key in it. */
export interface ProviderKeyHandle {
  /** Check the key in the field and save it: true once saved, false when there is none or it is refused. */
  commit: () => Promise<boolean>;
}

export function KeyCapabilities({ className }: { className?: string }) {
  const { t } = useTranslation();
  const openai = useSettingsStore((state) => selectUsableFeatureKey(state, "openai"));
  const anthropic = useSettingsStore((state) => selectUsableFeatureKey(state, "anthropic"));
  const writer = useSettingsStore(selectWritingKeyProvider);
  return (
    <p
      role="status"
      className={cn("text-[13px] leading-5 text-muted-foreground empty:hidden", className)}
    >
      {openai && anthropic
        ? t("oats.keys.bothCapabilities", { provider: getProviderDisplayName(writer ?? "openai") })
        : openai
          ? t("oats.keys.openaiCapabilities")
          : anthropic
            ? getCachedPlatform() === "darwin"
              ? t("oats.keys.anthropicCapabilities")
              : t("oats.keys.anthropicCapabilitiesComputer")
            : null}
    </p>
  );
}

/**
 * One field for an API key, the same in setup and in Settings. With `any` it
 * takes an OpenAI or an Anthropic key and tells them apart by their prefix,
 * so nobody has to say which provider first. An OpenAI or Anthropic key is
 * checked with the provider before it is saved (stores/apiKeys.ts): a key the
 * provider calls invalid is not saved, and every other answer is said in one
 * line. It takes an optional name (Alex, 2026-11-22); without one the key is
 * "OpenAI key 2", the name the field shows as its hint once the key's prefix
 * says whose it is. A key added for a feature (`forFeature`) is chosen for it.
 * Other providers' keys have no names and are saved as they are. In setup
 * there is no Save: Get started checks and saves the key (`ref`, `showSave`).
 */
export function ProviderKeyField({
  provider = "any",
  onSaved,
  className,
  autoFocus = false,
  showSave = true,
  onDraftChange,
  forFeature,
  replaces,
  ref,
}: {
  /** "any" for OpenAI or Anthropic, or one provider's id. */
  provider?: "any" | KeyProvider | string;
  onSaved?: (provider: string) => void;
  className?: string;
  autoFocus?: boolean;
  /** False where another button saves the key (setup's Get started). */
  showSave?: boolean;
  /** The text in the field, whenever it changes. */
  onDraftChange?: (draft: string) => void;
  /** The feature this key is added for: it uses the key on the API-key route. */
  forFeature?: Feature;
  /** A saved key (its id) whose secret this field replaces, keeping its name. */
  replaces?: string;
  ref?: React.Ref<ProviderKeyHandle>;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const nameId = useId();
  const messageId = useId();
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  // The key just saved, shown masked with what the provider said, until the
  // person replaces it.
  const [saved, setSaved] = useState<{ provider: string; tail: string; id?: string } | null>(null);
  // The saved key the next key takes the place of: the one this field just
  // saved, once the person presses Replace, or the one it was opened for.
  const [replacing, setReplacing] = useState<string | null>(replaces ?? null);
  const checked = provider === "any" || provider === "openai" || provider === "anthropic";
  const keys = useSavedKeys();
  const replaced = replacing ? (keys.find((key) => key.id === replacing) ?? null) : null;
  const typedProvider: ApiKeyProvider | null =
    provider === "openai" || provider === "anthropic" ? provider : detectKeyProvider(draft);
  // The name the key gets when the person gives none, once it is known whose
  // key it is: the replaced key's own, or the next default name.
  const nameHint =
    replaced && (!typedProvider || typedProvider === replaced.provider)
      ? replaced.name
      : typedProvider
        ? defaultKeyName(typedProvider, keys)
        : t("oats.keys.nameHint");

  // Check the key in the field and save it. True once it is saved; false
  // when there is nothing to save or the key is refused (the reason is shown).
  const commit = async (): Promise<boolean> => {
    const key = draft.trim();
    if (!key || checking) return false;
    let target: string = provider;
    if (checked) {
      const detected = detectKeyProvider(key);
      if (detected && (provider === "any" || detected === provider)) {
        setMessage({
          tone: "muted",
          text: t("oats.keys.checking", { provider: PROVIDER_NAMES[detected] }),
        });
      }
      setChecking(true);
      // A key the provider refuses is not saved, and the provider's reason is
      // said when it gave one. A restricted key that may not read the model
      // list is saved, with a line that says so (helpers/keyStatus.mjs).
      const input = {
        secret: key,
        name,
        forFeature,
        provider: provider === "any" ? undefined : (provider as ApiKeyProvider),
      };
      const result =
        replaced && replacing ? await replaceApiKey(replacing, input) : await addApiKey(input);
      setChecking(false);
      if (result.ok === false) {
        setMessage({ tone: "danger", text: result.reason });
        return false;
      }
      setMessage(result.note ? { tone: "muted", text: result.note } : null);
      target = result.key.provider;
      setSaved({ provider: target, tail: result.key.tail, id: result.key.id });
    } else {
      setMessage({ tone: "success", text: t("oats.keys.saved") });
      SETTERS[target]?.(useSettingsStore.getState())(key);
      setSaved({ provider: target, tail: key.slice(-4) });
    }
    setDraft("");
    setName("");
    setReplacing(null);
    onDraftChange?.("");
    onSaved?.(target);
    return true;
  };
  useImperativeHandle(ref, () => ({ commit }));
  // A field that goes away takes its text with it: whoever was told of the
  // text (setup's Get started) is told it is gone.
  const draftListener = useRef(onDraftChange);
  draftListener.current = onDraftChange;
  useEffect(() => () => draftListener.current?.(""), []);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void commit();
  };

  const pages =
    provider === "any" ? ["openai", "anthropic"] : KEY_PAGES[provider] ? [provider] : [];

  if (saved) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted-foreground">
            <KeyRound aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">
              {t("oats.keys.savedKey", {
                provider: PROVIDER_NAMES[saved.provider] ?? saved.provider,
              })}
            </span>
            <span className="font-mono tabular-nums">••••{saved.tail}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setReplacing(saved.id ?? null);
              setSaved(null);
              setMessage(null);
            }}
          >
            {t("oats.keys.replace")}
          </Button>
        </div>
        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "mt-2 text-[13px] leading-5",
              message.tone === "success" && "text-success",
              message.tone === "warning" && "text-warning",
              message.tone === "muted" && "text-muted-foreground"
            )}
          >
            {message.text}
          </p>
        ) : (
          <div className="mt-2">
            <KeyCapabilities />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={save} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <KeyRound
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={fieldId}
              type="password"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                onDraftChange?.(event.target.value);
                if (message?.tone === "danger") setMessage(null);
              }}
              placeholder={
                provider === "any"
                  ? t("oats.keys.placeholderAny")
                  : t("oats.keys.placeholder", { provider: PROVIDER_NAMES[provider] ?? provider })
              }
              aria-label={
                provider === "any"
                  ? t("oats.keys.placeholderAny")
                  : t("oats.keys.placeholder", { provider: PROVIDER_NAMES[provider] ?? provider })
              }
              aria-describedby={message ? messageId : undefined}
              aria-invalid={message?.tone === "danger" || undefined}
              autoComplete="off"
              spellCheck={false}
              autoFocus={autoFocus}
              // The key is an identifier, so it is mono; the hint is prose.
              className={cn("pl-9 text-[13px]", draft && "font-mono")}
            />
          </div>
          {checked && (
            <div className="mt-3">
              <label
                htmlFor={nameId}
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                {t("oats.keys.name")}{" "}
                <span className="font-normal text-muted-foreground">{t("oats.keys.optional")}</span>
              </label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={nameHint}
                maxLength={KEY_NAME_MAX}
                autoComplete="off"
                spellCheck={false}
                className="text-[13px]"
              />
            </div>
          )}
        </div>
        {showSave && (
          <Button type="submit" variant="outline" disabled={!draft.trim() || checking}>
            {checking ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {t("common.save")}
          </Button>
        )}
      </form>
      <p
        id={messageId}
        role="status"
        aria-live="polite"
        className={cn(
          "mt-2 text-[13px] leading-5 empty:hidden",
          message?.tone === "success" && "text-success",
          message?.tone === "warning" && "text-warning",
          message?.tone === "danger" && "text-destructive",
          message?.tone === "muted" && "text-muted-foreground"
        )}
      >
        {message?.text ?? ""}
      </p>
      {pages.length > 0 && !message && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {pages.map((id) => {
            const href = withUtm(KEY_PAGES[id], "api_key");
            // A button, not an anchor: the app's unlayered `a` rule would take
            // the underline and the colour (index.css).
            return (
              <Button
                key={id}
                type="button"
                variant="link"
                onClick={() => openExternalLink(href)}
                className="h-auto p-0 text-[13px] font-normal text-muted-foreground underline decoration-muted-foreground/40 hover:text-foreground"
              >
                {t("oats.keys.getKey", { provider: PROVIDER_NAMES[id] })}
              </Button>
            );
          })}
        </p>
      )}
    </div>
  );
}

/**
 * A provider's key where a chooser needs it: the field while there is none,
 * and the stored key, masked, with Replace once there is one. For OpenAI and
 * Anthropic that is the provider's default key, its oldest (helpers/apiKeys.mjs),
 * and Replace puts a new secret in its place, keeping its name and features.
 */
export function ProviderKey({ provider }: { provider: string }) {
  const { t } = useTranslation();
  const field = PROVIDER_KEYS[provider];
  const stored = useSettingsStore((state) => (field ? String(state[field] ?? "") : ""));
  const defaultId = useSettingsStore((state) =>
    isKeyProvider(provider) ? (defaultKeyOf(state.apiKeys, provider)?.id ?? null) : null
  );
  // Once the field is in use it stays, so what the provider said of the key
  // just saved is still there to read (ProviderKeyField's saved state).
  const [editing, setEditing] = useState(false);
  if (!field) return null;
  if (!stored.trim() || editing) {
    return (
      <ProviderKeyField
        provider={provider}
        autoFocus={editing}
        replaces={editing ? (defaultId ?? undefined) : undefined}
        onSaved={() => setEditing(true)}
      />
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted-foreground">
        <KeyRound aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">
          {t("oats.keys.savedKey", { provider: PROVIDER_NAMES[provider] ?? provider })}
        </span>
        <span className="font-mono tabular-nums">••••{stored.trim().slice(-4)}</span>
      </span>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        {t("oats.keys.replace")}
      </Button>
    </div>
  );
}
