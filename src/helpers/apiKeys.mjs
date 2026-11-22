// Named API keys: more than one OpenAI or Anthropic key, each with a name,
// and the key each feature uses on the API-key route (Alex, 2026-11-22).
//
// The main process holds the secrets, encrypted, one file per key
// (environment.js); this module never sees one. It holds the rules both
// processes share: which key a feature uses, the default names, where a
// feature goes when its key is removed, what a key added takes over, and
// which key a field for one key shows. The settings store (renderer) and
// EnvironmentManager (main) both use it, and test/helpers/apiKeys.test.js
// pins it.
//
// A key's record: its id, provider, name ("" for the default name), the number
// of its default name, the last four characters of the secret, when it was
// added, what the provider said of it (null when it was never asked), and its
// revision, one more each time its secret is replaced. The default name is
// drawn in the interface's language from the number, so "OpenAI key 1" reads
// "OpenAI-Schlüssel 1" in German. `defaults` names each provider's default
// key, the one its single slot holds: absent means its oldest, null means the
// slot was left empty on purpose (no key of it could be read).

import { FEATURES, isUsableFeatureKey } from "./featureRoutes.mjs";

/** The providers whose keys have names, more than one each (decision 5). */
export const KEY_PROVIDERS = /** @type {const} */ (["openai", "anthropic"]);
/** The longest name a key keeps. */
export const KEY_NAME_MAX = 64;

const KEY_ID = /^k[0-9a-f]{16}$/;
const STATUSES = new Set(["ok", "limited", "legacy", "rejected", "no-access", "unknown"]);

/** @typedef {typeof KEY_PROVIDERS[number]} KeyProvider */
/** @typedef {import("./featureRoutes.mjs").Feature} Feature */
/** @typedef {import("./featureRoutes.mjs").RouteKeyStatus} RouteKeyStatus */
/**
 * @typedef {{ id: string, provider: KeyProvider, name: string, number: number, tail: string,
 *   addedAt: number, status: RouteKeyStatus | null, rev: number }} KeyRecord
 */
/** @typedef {Partial<Record<Feature, string>>} FeatureKeys */
/** @typedef {Partial<Record<KeyProvider, string | null>>} DefaultKeys */
/** @typedef {{ keys: KeyRecord[], features: FeatureKeys, defaults: DefaultKeys }} KeyRecords */

/** No records yet: the renderer before main has sent them. Compare by identity. */
/** @type {KeyRecords} */
export const NO_KEYS = Object.freeze({
  keys: Object.freeze([]),
  features: Object.freeze({}),
  defaults: Object.freeze({}),
});

/** @param {unknown} value @returns {value is KeyProvider} */
export function isKeyProvider(value) {
  return value === "openai" || value === "anthropic";
}

/** A key's id: main makes it, and builds a file name from it, so nothing else passes. */
export function isKeyId(value) {
  return typeof value === "string" && KEY_ID.test(value);
}

/** @param {unknown} value @returns {value is Feature} */
export function isFeature(value) {
  return FEATURES.some((feature) => feature === value);
}

/** @param {unknown} value @returns {value is RouteKeyStatus} */
export function isKeyStatus(value) {
  return typeof value === "string" && STATUSES.has(value);
}

/**
 * Whether a provider's key can serve a feature. Speech (Conversations,
 * Dictation) needs OpenAI: Anthropic has no speech service. Writing takes
 * either.
 *
 * @param {unknown} provider
 * @param {unknown} feature
 */
export function keyServes(provider, feature) {
  if (provider === "openai") return isFeature(feature);
  return provider === "anthropic" && feature === "writing";
}

/**
 * Whether a key can be used: what the provider said allows it, or nothing was
 * asked yet (a key saved before keys were checked), which counts as "legacy".
 *
 * @param {RouteKeyStatus | null | undefined} status
 */
export function keyUsable(status) {
  return status === null || status === undefined || isUsableFeatureKey(status);
}

/**
 * A name as a key keeps it: one line, no control characters, at most
 * KEY_NAME_MAX characters. Empty means the default name.
 *
 * @param {unknown} value
 */
export function cleanKeyName(value) {
  return Array.from(
    String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
    .slice(0, KEY_NAME_MAX)
    .join("")
    .trim();
}

/**
 * The records as they may be trusted: unknown fields and invalid entries
 * dropped, keys in the order they were added, each feature's choice kept only
 * when it names a key that can serve it, and each default only when it names
 * a key of its provider.
 *
 * @param {unknown} raw
 * @returns {KeyRecords}
 */
export function normalizeKeyRecords(raw) {
  const source = /** @type {any} */ (raw);
  const seen = new Set();
  /** @type {KeyRecord[]} */
  const keys = [];
  for (const entry of Array.isArray(source?.keys) ? source.keys : []) {
    if (!isKeyId(entry?.id) || seen.has(entry.id) || !isKeyProvider(entry?.provider)) continue;
    seen.add(entry.id);
    const number = Number(entry.number);
    const addedAt = Number(entry.addedAt);
    const rev = Number(entry.rev);
    keys.push({
      id: entry.id,
      provider: entry.provider,
      name: cleanKeyName(entry.name),
      number: Number.isInteger(number) && number > 0 ? number : 1,
      tail: String(entry.tail ?? "")
        .replace(/[^\w-]/g, "")
        .slice(-4),
      addedAt: Number.isFinite(addedAt) && addedAt >= 0 ? addedAt : 0,
      status: isKeyStatus(entry.status) ? entry.status : null,
      rev: Number.isInteger(rev) && rev > 0 ? rev : 1,
    });
  }
  keys.sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    keys,
    features: cleanFeatureKeys(source?.features, keys),
    defaults: cleanDefaultKeys(source?.defaults, keys),
  };
}

/**
 * Each feature's choice, kept only when it names one of `keys` that can serve
 * the feature.
 *
 * @param {unknown} raw
 * @param {KeyRecord[]} keys
 * @returns {FeatureKeys}
 */
export function cleanFeatureKeys(raw, keys) {
  const source = /** @type {any} */ (raw);
  /** @type {FeatureKeys} */
  const features = {};
  for (const feature of FEATURES) {
    const id = source?.[feature];
    const key = keys.find((candidate) => candidate.id === id);
    if (key && keyServes(key.provider, feature)) features[feature] = key.id;
  }
  return features;
}

/**
 * Each provider's default key, kept when it names one of `keys` of that
 * provider; null (the slot left empty on purpose) is kept as it is.
 *
 * @param {unknown} raw
 * @param {KeyRecord[]} keys
 * @returns {DefaultKeys}
 */
export function cleanDefaultKeys(raw, keys) {
  const source = /** @type {any} */ (raw);
  /** @type {DefaultKeys} */
  const defaults = {};
  for (const provider of KEY_PROVIDERS) {
    const id = source?.[provider];
    if (id === null) defaults[provider] = null;
    else if (keys.some((key) => key.id === id && key.provider === provider)) defaults[provider] = id;
  }
  return defaults;
}

/**
 * The provider a feature's key comes from: OpenAI for speech; for Writing the
 * writing provider, OpenAI until one is chosen (as `resolveFeatureRoute`
 * reads it), and none for a provider whose keys have no names (Gemini, Groq,
 * a server of the person's own).
 *
 * @param {KeyRecords} _records
 * @param {Feature} feature
 * @param {string | null | undefined} writingProvider
 * @returns {KeyProvider | null}
 */
export function featureKeyProvider(_records, feature, writingProvider) {
  if (feature !== "writing") return "openai";
  if (!writingProvider) return "openai";
  return isKeyProvider(writingProvider) ? writingProvider : null;
}

/**
 * The key a feature uses with a provider: the key chosen for it, when it is
 * that provider's; else that provider's oldest usable key; else its oldest
 * (which shows as refused). Null when the provider has no key, or cannot serve
 * the feature. A chosen key that was refused stays chosen: the person sees
 * that it was refused and chooses another.
 *
 * @param {KeyRecords} records
 * @param {Feature} feature
 * @param {string | null | undefined} provider
 * @returns {KeyRecord | null}
 */
export function resolveFeatureKey(records, feature, provider) {
  if (!keyServes(provider, feature)) return null;
  const chosen = records.keys.find((key) => key.id === records.features[feature]);
  if (chosen && chosen.provider === provider) return chosen;
  const own = records.keys.filter((key) => key.provider === provider);
  return own.find((key) => keyUsable(key.status)) ?? own[0] ?? null;
}

/**
 * The features whose key with `provider` is this key.
 *
 * @param {KeyRecords} records
 * @param {string} id
 * @param {KeyProvider} provider
 * @returns {Feature[]}
 */
export function featuresUsingKey(records, id, provider) {
  return FEATURES.filter((feature) => resolveFeatureKey(records, feature, provider)?.id === id);
}

/**
 * A provider's default key, the one its single slot (`OPENAI_API_KEY`)
 * holds, which every path that does not know features reads: the key
 * `defaults` names, else the provider's oldest.
 *
 * @param {KeyRecords} records
 * @param {KeyProvider} provider
 */
export function defaultKeyOf(records, provider) {
  const named = records.defaults?.[provider];
  return (
    records.keys.find((key) => key.id === named && key.provider === provider) ??
    records.keys.find((key) => key.provider === provider) ??
    null
  );
}

/**
 * The key a field for one key shows, and the only key it may change: for a
 * chooser that belongs to a feature, the key that feature uses with the
 * provider; for any other, the provider's default key.
 *
 * @param {KeyRecords} records
 * @param {KeyProvider} provider
 * @param {Feature | null} [feature]
 */
export function chooserKey(records, provider, feature = null) {
  return feature ? resolveFeatureKey(records, feature, provider) : defaultKeyOf(records, provider);
}

/**
 * What a field for one key does with what the person typed (Alex's rule of
 * 2026-11-22: no such field overwrites or deletes a named key it does not
 * show). Empty text removes nothing: a field for one key cannot say which
 * named key to remove, and the list of keys removes keys. Text replaces the
 * key the field shows, or adds a key when it shows none.
 *
 * @param {KeyRecord | null} shown
 * @param {string} text
 * @returns {{ action: "none" } | { action: "replace", id: string } | { action: "add" }}
 */
export function singleKeyEdit(shown, text) {
  if (!String(text ?? "").trim()) return { action: "none" };
  return shown ? { action: "replace", id: shown.id } : { action: "add" };
}

/**
 * The default name around its number, as `format` writes it for one provider
 * in one language ("OpenAI key 1" gives ["OpenAI key ", ""]); null when the
 * format has no number in it.
 *
 * @param {(number: string) => string} format
 * @returns {[string, string] | null}
 */
export function defaultNameParts(format) {
  const marker = "\u0001";
  const text = String(format(marker));
  const at = text.indexOf(marker);
  return at < 0 ? null : [text.slice(0, at), text.slice(at + marker.length)];
}

/**
 * The number of the next default name (decision 3): one more than the highest
 * number that provider's default names already use. A key renamed to
 * something else no longer uses its number.
 *
 * @param {Iterable<string>} names The names of that provider's keys, as shown.
 * @param {[string, string] | null} parts The default name around its number.
 */
export function nextDefaultNumber(names, parts) {
  let highest = 0;
  if (!parts) return 1;
  const [before, after] = parts;
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name.startsWith(before) || !name.endsWith(after)) continue;
    const digits = name.slice(before.length, name.length - after.length);
    if (/^[0-9]{1,6}$/.test(digits)) highest = Math.max(highest, Number(digits));
  }
  return highest + 1;
}

/**
 * The features a key just added takes: the one it was added for, and each
 * other feature it can serve that has no usable key yet. Writing takes a key
 * of another provider only when the key was added for it, so a key added for
 * speech does not move the writing model.
 *
 * @param {KeyRecords} records The records before the key is added.
 * @param {KeyProvider} provider The new key's provider.
 * @param {{ forFeature?: Feature | null, writingProvider?: string | null }} [options]
 * @returns {Feature[]}
 */
export function featuresForNewKey(records, provider, { forFeature = null, writingProvider = null } = {}) {
  /** @type {Feature[]} */
  const taken = [];
  for (const feature of FEATURES) {
    if (!keyServes(provider, feature)) continue;
    if (feature === forFeature) {
      taken.push(feature);
      continue;
    }
    if (feature === "writing" && writingProvider !== provider) continue;
    const current = resolveFeatureKey(records, feature, provider);
    if (!current || !keyUsable(current.status)) taken.push(feature);
  }
  return taken;
}

/**
 * Where each feature goes when a key is removed: to another usable key of the
 * same provider, else to none, the missing-key state, in which it runs on this
 * Mac until a key is added or chosen. Never to another provider: that would
 * send its text to a provider nobody chose for it (Alex, 2026-11-22).
 *
 * @param {KeyRecords} records
 * @param {string} id
 * @param {string | null} writingProvider
 * @returns {{ features: FeatureKeys, moves: Array<{ feature: Feature, to: string | null }> }}
 */
export function removalPlan(records, id, writingProvider) {
  const removed = records.keys.find((key) => key.id === id);
  if (!removed) return { features: { ...records.features }, moves: [] };
  const rest = records.keys.filter((key) => key.id !== id);
  /** @type {FeatureKeys} */
  const features = {};
  /** @type {Array<{ feature: Feature, to: string | null }>} */
  const moves = [];
  for (const feature of FEATURES) {
    const used = resolveFeatureKey(
      records,
      feature,
      featureKeyProvider(records, feature, writingProvider)
    );
    const stored = records.features[feature];
    if (used?.id !== id) {
      // A choice of the removed key that the feature did not use is dropped.
      if (stored && stored !== id) features[feature] = stored;
      continue;
    }
    const next =
      rest.find(
        (key) =>
          key.provider === removed.provider &&
          keyServes(key.provider, feature) &&
          keyUsable(key.status)
      ) ?? null;
    if (next) features[feature] = next.id;
    moves.push({ feature, to: next?.id ?? null });
  }
  return { features, moves };
}

/**
 * The choices for keys found in the providers' single slots, the first time
 * this version runs: each becomes "<Provider> key 1", and is chosen for every
 * feature that uses its provider. Writing is left to the writing provider
 * when both providers have a key.
 *
 * @param {KeyRecord[]} keys The keys made from the slots.
 * @param {FeatureKeys} [features] Choices already made.
 * @returns {FeatureKeys}
 */
export function slotKeyChoices(keys, features = {}) {
  /** @type {FeatureKeys} */
  const next = { ...features };
  const openai = keys.find((key) => key.provider === "openai");
  const anthropic = keys.find((key) => key.provider === "anthropic");
  if (openai) {
    next.conversations ??= openai.id;
    next.dictation ??= openai.id;
  }
  const writer = openai && anthropic ? null : (openai ?? anthropic);
  if (writer) next.writing ??= writer.id;
  return next;
}

/**
 * A record as it crosses to the renderer: the fields above and nothing else.
 *
 * @param {KeyRecord} key
 * @returns {KeyRecord}
 */
export function publicKeyRecord(key) {
  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    number: key.number,
    tail: key.tail,
    addedAt: key.addedAt,
    status: key.status,
    rev: key.rev,
  };
}
