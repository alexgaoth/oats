import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import logger from "../utils/logger";
import { checkKey, detectKeyProvider } from "../utils/keyCheck";
import { writingModelName } from "../hooks/useWritingModel";
import { CLOUD_WRITING_MODELS } from "../helpers/writingTier.mjs";
import { FEATURES, type Feature, type RouteKeyStatus } from "../helpers/featureRoutes.mjs";
import {
  cleanKeyName,
  defaultNameParts,
  featureKeyProvider,
  featuresForNewKey,
  keyServes,
  keyUsable,
  nextDefaultNumber,
  removalPlan,
  resolveFeatureKey,
  type KeyRecord,
  type KeyRecords,
} from "../helpers/apiKeys.mjs";
import {
  applyKeyRecords,
  saveFeaturePreferences,
  selectFeatureRoute,
  useSettingsStore,
  type SettingsState,
} from "./settingsStore";

// Named API keys (Alex, 2026-11-22): more than one OpenAI or Anthropic key,
// each with a name; an empty name gives the default name, "OpenAI key 1",
// counted per provider. Each feature on the API-key route uses its own key,
// which may differ between features, also within one provider. The rules are
// in helpers/apiKeys.mjs, shared with the main process, which holds the
// secrets, one encrypted file per key (environment.js). This module is what
// the interface uses: the keys as it shows them, without their secrets, and
// the actions that change them. Nothing here is kept in localStorage.

export type ApiKeyProvider = "openai" | "anthropic";

/** A saved key as the interface shows it. `name` is its name or its default name. */
export interface SavedKey {
  id: string;
  provider: ApiKeyProvider;
  name: string;
  tail: string;
  status: RouteKeyStatus | null;
}

/** Why a key cannot serve a feature: an Anthropic key has no speech, or the provider refused it. */
export type KeyOptionReason = null | "no-speech" | "refused";

export type KeyOption = SavedKey & { usable: boolean; reason: KeyOptionReason };

type KeyState = Pick<SettingsState, "apiKeys" | "featurePreferences">;

/** Brand names, as the interface writes them in every language. */
export const KEY_PROVIDER_NAMES: Record<ApiKeyProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function formatDefaultName(provider: ApiKeyProvider, number: string | number): string {
  return i18n.t("oats.keys.defaultName", { provider: KEY_PROVIDER_NAMES[provider], number });
}

function shownName(record: KeyRecord): string {
  return record.name || formatDefaultName(record.provider, record.number);
}

let savedCache: { records: KeyRecords | null; language: string; keys: SavedKey[] } = {
  records: null,
  language: "",
  keys: [],
};

/** The saved keys, in the order they were added, each with its name as shown. */
export function selectSavedKeys(state: Pick<SettingsState, "apiKeys">): SavedKey[] {
  const language = i18n.language;
  if (savedCache.records === state.apiKeys && savedCache.language === language) {
    return savedCache.keys;
  }
  const keys = state.apiKeys.keys.map((record) => ({
    id: record.id,
    provider: record.provider,
    name: shownName(record),
    tail: record.tail,
    status: record.status,
  }));
  savedCache = { records: state.apiKeys, language, keys };
  return keys;
}

/** The saved keys, for a component: stable while nothing changes, again on a language change. */
export function useSavedKeys(): SavedKey[] {
  const { i18n: instance } = useTranslation();
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const language = instance.language;
  return useMemo(() => {
    void language;
    return selectSavedKeys({ apiKeys });
  }, [apiKeys, language]);
}

/**
 * The key a feature uses on the API-key route: the key chosen for it, else
 * its provider's oldest usable key. Null when there is none, and for Writing
 * on a provider whose keys have no names. A chosen key the provider refused is
 * still the feature's key, so the row can say so.
 */
export function selectFeatureKey(state: KeyState, feature: Feature): SavedKey | null {
  const provider = featureKeyProvider(
    state.apiKeys,
    feature,
    state.featurePreferences.writingProvider
  );
  const record = resolveFeatureKey(state.apiKeys, feature, provider);
  if (!record) return null;
  return selectSavedKeys(state).find((key) => key.id === record.id) ?? null;
}

const optionsCache = new Map<Feature, { keys: SavedKey[]; options: KeyOption[] }>();

/** Every saved key, as a choice for a feature: whether it can serve it, and why not. */
export function selectKeyOptions(state: KeyState, feature: Feature): KeyOption[] {
  const keys = selectSavedKeys(state);
  const cached = optionsCache.get(feature);
  if (cached?.keys === keys) return cached.options;
  const options = keys.map((key) => {
    const serves = keyServes(key.provider, feature);
    const usable = serves && keyUsable(key.status);
    const reason: KeyOptionReason = !serves ? "no-speech" : usable ? null : "refused";
    return { ...key, usable, reason };
  });
  optionsCache.set(feature, { keys, options });
  return options;
}

const usersCache = new Map<string, Feature[]>();

/** The features whose effective route uses this key: on the API-key route, ready, with it. */
export function selectKeyUsers(state: SettingsState, id: string): Feature[] {
  const users = FEATURES.filter(
    (feature) =>
      selectFeatureRoute(state, feature).effective === "providers" &&
      selectFeatureKey(state, feature)?.id === id
  );
  const cached = usersCache.get(id);
  if (cached && cached.length === users.length && cached.every((f, i) => f === users[i])) {
    return cached;
  }
  usersCache.set(id, users);
  return users;
}

/**
 * Where each feature that uses a key goes if it is removed: another usable key
 * of the same provider, else (Writing) one of the other provider, else none,
 * when the feature runs on this Mac until a key is added.
 */
export function selectRemovalPlan(
  state: KeyState,
  id: string
): Array<{ feature: Feature; to: SavedKey | null }> {
  const plan = removalPlan(state.apiKeys, id, state.featurePreferences.writingProvider);
  const keys = selectSavedKeys(state);
  return plan.moves.map((move) => ({
    feature: move.feature,
    to: keys.find((key) => key.id === move.to) ?? null,
  }));
}

/**
 * The name a key of this provider gets when it is added without one
 * (decision 3): "OpenAI key 2", one more than the highest number that
 * provider's default names already use.
 */
export function defaultKeyName(provider: ApiKeyProvider, keys: SavedKey[]): string {
  return formatDefaultName(provider, nextNumber(provider, keys));
}

function nextNumber(provider: ApiKeyProvider, keys: SavedKey[]): number {
  const parts = defaultNameParts((number) => formatDefaultName(provider, number));
  return nextDefaultNumber(
    keys.filter((key) => key.provider === provider).map((key) => key.name),
    parts
  );
}

type AddResult = { ok: true; key: SavedKey; note?: string } | { ok: false; reason: string };

/** What the provider's refusal says, in one line. */
function refusalText(
  provider: ApiKeyProvider,
  status: "rejected" | "no-access" | "unknown",
  reason: string | null
): string {
  const name = KEY_PROVIDER_NAMES[provider];
  if (status === "no-access") {
    return i18n.t("oats.featureRoutes.keyNoAccess", {
      model: writingModelName(CLOUD_WRITING_MODELS[provider]),
    });
  }
  if (status === "unknown") return i18n.t("oats.featureRoutes.keyNotChecked");
  return reason
    ? i18n.t("oats.keys.rejectedReason", { provider: name, reason })
    : i18n.t("oats.keys.rejected", { provider: name });
}

/** The provider and what it says of a key, before it is saved; a refusal as text. */
async function checkedKey(
  secret: string,
  provider: ApiKeyProvider | undefined
): Promise<
  | { ok: true; provider: ApiKeyProvider; status: "ok" | "limited"; note?: string }
  | { ok: false; reason: string }
> {
  const detected = detectKeyProvider(secret);
  if (!detected) return { ok: false, reason: i18n.t("oats.keys.notAKey") };
  if (provider && detected !== provider) {
    return {
      ok: false,
      reason: i18n.t("oats.keys.notThisKey", { provider: KEY_PROVIDER_NAMES[provider] }),
    };
  }
  // A key the provider refuses is not saved. A restricted OpenAI key that may
  // not read the model list is saved, with a line that says so (keyStatus.mjs).
  const { status, reason } = await checkKey(detected, secret);
  if (status !== "ok" && status !== "limited") {
    return { ok: false, reason: refusalText(detected, status, reason) };
  }
  return {
    ok: true,
    provider: detected,
    status,
    ...(status === "limited" && {
      note: i18n.t("oats.keys.limited", {
        model: writingModelName(CLOUD_WRITING_MODELS[detected]),
      }),
    }),
  };
}

function setWritingProvider(provider: string | null): void {
  const { featurePreferences } = useSettingsStore.getState();
  if (featurePreferences.writingProvider === provider) return;
  saveFeaturePreferences({
    ...featurePreferences,
    writingProvider: provider as typeof featurePreferences.writingProvider,
  });
}

function savedKey(id: string): SavedKey | null {
  return selectSavedKeys(useSettingsStore.getState()).find((key) => key.id === id) ?? null;
}

function notSaved(): { ok: false; reason: string } {
  return { ok: false, reason: i18n.t("oats.keys.notSaved") };
}

/**
 * Add a key. It is checked with its provider first, as before; a key the
 * provider refuses is not saved, and `reason` says why in one line. An empty
 * name gives the default name. The key is chosen for `forFeature` and for each
 * other feature it can serve that has no usable key yet; added for Writing, it
 * also makes its provider the writing provider.
 */
export async function addApiKey(input: {
  secret: string;
  name?: string;
  provider?: ApiKeyProvider;
  forFeature?: Feature;
}): Promise<AddResult> {
  const secret = String(input.secret ?? "").trim();
  const checked = await checkedKey(secret, input.provider);
  if (checked.ok === false) return { ok: false, reason: checked.reason };
  const api = window.electronAPI;
  if (!api?.addApiKey) return notSaved();

  const state = useSettingsStore.getState();
  const writingProvider = state.featurePreferences.writingProvider;
  const forFeature =
    input.forFeature && keyServes(checked.provider, input.forFeature) ? input.forFeature : null;
  const number = nextNumber(checked.provider, selectSavedKeys(state));
  const name = cleanKeyName(input.name);
  const result = await api
    .addApiKey({
      provider: checked.provider,
      secret,
      // The default name typed out stays a default name: it follows the language.
      name: name === formatDefaultName(checked.provider, number) ? "" : name,
      number,
      status: checked.status,
      assign: featuresForNewKey(state.apiKeys, checked.provider, { forFeature, writingProvider }),
    })
    .catch(() => null);
  if (!result?.ok) return notSaved();
  await applyKeyRecords(result.list);
  if (forFeature === "writing") setWritingProvider(checked.provider);
  const key = savedKey(result.id);
  if (!key) return notSaved();
  return { ok: true, key, ...(checked.note && { note: checked.note }) };
}

/**
 * Put another secret in a saved key's place: a key pasted by mistake, or one
 * the provider no longer takes. Checked as a new key is. A key of the same
 * provider keeps the key's id, its name (unless `name` gives one) and the
 * features that use it; a key of the other provider, where `provider` allows
 * one, is added, and the old one removed.
 */
export async function replaceApiKey(
  id: string,
  input: { secret: string; name?: string; provider?: ApiKeyProvider; forFeature?: Feature }
): Promise<AddResult> {
  const record = useSettingsStore.getState().apiKeys.keys.find((key) => key.id === id);
  if (!record) return addApiKey(input);
  const secret = String(input.secret ?? "").trim();
  const checked = await checkedKey(secret, input.provider);
  if (checked.ok === false) return { ok: false, reason: checked.reason };
  if (checked.provider !== record.provider) {
    const added = await addApiKey({ ...input, provider: checked.provider });
    if (added.ok) await removeApiKey(id);
    return added;
  }
  const api = window.electronAPI;
  if (!api?.replaceApiKey) return notSaved();
  const name = input.name === undefined ? undefined : cleanKeyName(input.name);
  const result = await api
    .replaceApiKey(id, {
      secret,
      status: checked.status,
      ...(name && { name }),
    })
    .catch(() => null);
  if (!result?.ok) return notSaved();
  await applyKeyRecords(result.list);
  const key = savedKey(id);
  if (!key) return notSaved();
  return { ok: true, key, ...(checked.note && { note: checked.note }) };
}

/** Give a key another name. An empty name gives back its default name. */
export function renameApiKey(id: string, name: string): void {
  const state = useSettingsStore.getState();
  const record = state.apiKeys.keys.find((key) => key.id === id);
  if (!record) return;
  let clean = cleanKeyName(name);
  let number = record.number;
  // Its own default name, typed out, stays a default name: it follows the language.
  if (clean === formatDefaultName(record.provider, number)) clean = "";
  if (!clean) {
    const others = selectSavedKeys(state).filter(
      (key) => key.id !== id && key.provider === record.provider
    );
    if (others.some((key) => key.name === formatDefaultName(record.provider, number))) {
      number = nextNumber(record.provider, others);
    }
  }
  if (clean === record.name && number === record.number) return;
  useSettingsStore.setState({
    apiKeys: {
      ...state.apiKeys,
      keys: state.apiKeys.keys.map((key) =>
        key.id === id ? { ...key, name: clean, number } : key
      ),
    },
  });
  window.electronAPI
    ?.renameApiKey?.(id, clean, number)
    ?.then((list) => {
      if (list) void applyKeyRecords(list);
    })
    .catch((error: unknown) => {
      logger.warn("Could not rename a key", { error: (error as Error)?.message }, "settings");
    });
}

/**
 * Remove a key: main deletes its secret. Each feature that used it moves to
 * another usable key of the same provider, else (Writing) to one of the other
 * provider, else shows the missing-key state and runs on this Mac until a key
 * is added.
 */
export async function removeApiKey(id: string): Promise<void> {
  const state = useSettingsStore.getState();
  if (!state.apiKeys.keys.some((key) => key.id === id)) return;
  const plan = removalPlan(state.apiKeys, id, state.featurePreferences.writingProvider);
  const list = await window.electronAPI
    ?.removeApiKey?.(id, plan.features as Record<string, string>)
    ?.catch((error: unknown) => {
      logger.warn("Could not remove a key", { error: (error as Error)?.message }, "settings");
      return null;
    });
  if (!list) return;
  await applyKeyRecords(list);
  setWritingProvider(plan.writingProvider);
}

/**
 * Choose the key a feature uses on the API-key route. A key that cannot serve
 * the feature (an Anthropic key for speech) is not taken. Choosing an
 * Anthropic key for Writing while it writes with OpenAI, or the other way
 * round, makes that the writing provider.
 */
export function chooseFeatureKey(feature: Feature, id: string): void {
  const state = useSettingsStore.getState();
  const key = state.apiKeys.keys.find((candidate) => candidate.id === id);
  if (!key || !keyServes(key.provider, feature)) return;
  const features = { ...state.apiKeys.features, [feature]: id };
  useSettingsStore.setState({ apiKeys: { ...state.apiKeys, features } });
  if (feature === "writing") setWritingProvider(key.provider);
  window.electronAPI
    ?.setFeatureApiKeys?.(features as Record<string, string>)
    ?.then((list) => {
      if (list) void applyKeyRecords(list);
    })
    .catch((error: unknown) => {
      logger.warn("Could not choose a key", { error: (error as Error)?.message }, "settings");
    });
}
