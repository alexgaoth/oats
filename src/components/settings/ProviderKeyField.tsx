import * as React from "react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useSettingsStore, type SettingsState } from "../../stores/settingsStore";
import { checkKey, detectKeyProvider, type KeyProvider } from "../../utils/keyCheck";
import { writingModelName } from "../../hooks/useWritingModel";
import { CLOUD_WRITING_MODELS } from "../../helpers/writingTier.mjs";
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
const SETTERS: Record<string, (state: SettingsState) => Setter> = {
  openai: (state) => state.setOpenaiApiKey,
  anthropic: (state) => state.setAnthropicApiKey,
  gemini: (state) => state.setGeminiApiKey,
  groq: (state) => state.setGroqApiKey,
  tinfoil: (state) => state.setTinfoilApiKey,
  openrouter: (state) => state.setOpenrouterApiKey,
};

type Message = { tone: "success" | "warning" | "danger" | "muted"; text: string } | null;

/**
 * One field for an API key, the same in setup and in Settings. With `any` it
 * takes an OpenAI or an Anthropic key and tells them apart by their prefix,
 * so nobody has to say which provider first. An OpenAI or Anthropic key is
 * checked with the provider before it is saved (keyCheck.ts): a key the
 * provider rejects is not saved, and every other answer is said in one line.
 * Other providers' keys are saved as they are.
 */
export function ProviderKeyField({
  provider = "any",
  onSaved,
  className,
  autoFocus = false,
}: {
  /** "any" for OpenAI or Anthropic, or one provider's id. */
  provider?: "any" | KeyProvider | string;
  onSaved?: (provider: string) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const messageId = useId();
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  // The key just saved, shown masked with what the provider said, until the
  // person replaces it.
  const [saved, setSaved] = useState<{ provider: string; tail: string } | null>(null);
  const checked = provider === "any" || provider === "openai" || provider === "anthropic";

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = draft.trim();
    if (!key || checking) return;
    let target: string = provider;
    if (checked) {
      const detected = detectKeyProvider(key);
      if (!detected || (provider !== "any" && detected !== provider)) {
        setMessage({
          tone: "danger",
          text:
            provider === "any"
              ? t("oats.keys.notAKey")
              : t("oats.keys.notThisKey", { provider: PROVIDER_NAMES[provider] }),
        });
        return;
      }
      target = detected;
      setChecking(true);
      setMessage({
        tone: "muted",
        text: t("oats.keys.checking", { provider: PROVIDER_NAMES[target] }),
      });
      const status = await checkKey(detected, key);
      setChecking(false);
      if (status === "rejected") {
        setMessage({
          tone: "danger",
          text: t("oats.keys.rejected", { provider: PROVIDER_NAMES[target] }),
        });
        return;
      }
      const model = writingModelName(CLOUD_WRITING_MODELS[detected]);
      setMessage(
        status === "ok"
          ? { tone: "success", text: t("oats.keys.works", { model }) }
          : status === "no-access"
            ? { tone: "warning", text: t("oats.keys.noAccess", { model }) }
            : { tone: "muted", text: t("oats.keys.unchecked") }
      );
    } else {
      setMessage({ tone: "success", text: t("oats.keys.saved") });
    }
    SETTERS[target]?.(useSettingsStore.getState())(key);
    setDraft("");
    setSaved({ provider: target, tail: key.slice(-4) });
    onSaved?.(target);
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
              setSaved(null);
              setMessage(null);
            }}
          >
            {t("oats.keys.replace")}
          </Button>
        </div>
        {message && (
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
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={(event) => void save(event)} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
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
        <Button type="submit" variant="outline" disabled={!draft.trim() || checking}>
          {checking ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {t("common.save")}
        </Button>
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
 * and the stored key, masked, with Replace once there is one.
 */
export function ProviderKey({ provider }: { provider: string }) {
  const { t } = useTranslation();
  const field = PROVIDER_KEYS[provider];
  const stored = useSettingsStore((state) => (field ? String(state[field] ?? "") : ""));
  // Once the field is in use it stays, so what the provider said of the key
  // just saved is still there to read (ProviderKeyField's saved state).
  const [editing, setEditing] = useState(false);
  if (!field) return null;
  if (!stored.trim() || editing) {
    return (
      <ProviderKeyField provider={provider} autoFocus={editing} onSaved={() => setEditing(true)} />
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
