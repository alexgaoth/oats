// Named API keys: more than one OpenAI or Anthropic key, each with a name,
// and the key each feature uses on the API-key route (Alex, 2026-11-22).
//
// The main process holds the secrets, encrypted, one file per key
// (environment.js); this module never sees one. It holds the rules both
// processes share: which key a feature uses, the default names, where a
// feature goes when its key is removed, and what a key added takes over. The
// settings store (renderer) and EnvironmentManager (main) both use it, and
// test/helpers/apiKeys.test.js pins it.
//
// A key's record: its id, provider, name ("" for the default name), the number
// of its default name, the last four characters of the secret, when it was
// added, and what the provider said of it (null when it was never asked).
// The default name is drawn in the interface's language from the number, so
// "OpenAI key 1" reads "OpenAI-Schlüssel 1" in German.

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
 *   addedAt: number, status: RouteKeyStatus | null }} KeyRecord
 */
/** @typedef {Partial<Record<Feature, string>>} FeatureKeys */
/** @typedef {{ keys: KeyRecord[], features: FeatureKeys }} KeyRecords */

/** @type {KeyRecords} */
export const NO_KEYS = Object.freeze({ keys: Object.freeze([]), features: Object.freeze({}) });

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
 * dropped, keys in the order they were added, and each feature's choice kept
 * only when it names a key that can serve it.
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
    });
  }
  keys.sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { keys, features: cleanFeatureKeys(source?.features, keys) };
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
 * A provider's default key, its oldest. It fills the provider's single slot
 * (`OPENAI_API_KEY`), which every path that does not know features reads.
 *
 * @param {KeyRecords} records
 * @param {KeyProvider} provider
 */
export function defaultKeyOf(records, provider) {
  return records.keys.find((key) => key.provider === provider) ?? null;
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
export function featuresForNewKey(
  records,
  provider,
  { forFeature = null, writingProvider = null } = {}
) {
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
 * Where each feature goes when a key is removed. A feature that used it moves
 * to another usable key of the same provider, else (Writing) to a usable key
 * of another provider that serves it, else to none: the missing-key state, in
 * which it runs on this Mac until a key is added. `writingProvider` changes
 * when Writing moves to another provider.
 *
 * @param {KeyRecords} records
 * @param {string} id
 * @param {string | null} writingProvider
 * @returns {{ features: FeatureKeys, writingProvider: string | null,
 *   moves: Array<{ feature: Feature, to: string | null }> }}
 */
export function removalPlan(records, id, writingProvider) {
  const removed = records.keys.find((key) => key.id === id);
  if (!removed) return { features: { ...records.features }, writingProvider, moves: [] };
  const rest = records.keys.filter((key) => key.id !== id);
  /** @type {FeatureKeys} */
  const features = {};
  let provider = writingProvider;
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
    const serves = (/** @type {KeyRecord} */ key) =>
      keyServes(key.provider, feature) && keyUsable(key.status);
    const next =
      rest.find((key) => key.provider === removed.provider && serves(key)) ??
      (feature === "writing" ? rest.find((key) => serves(key)) : undefined) ??
      null;
    if (next) features[feature] = next.id;
    if (feature === "writing" && next && next.provider !== removed.provider) {
      provider = next.provider;
    }
    moves.push({ feature, to: next?.id ?? null });
  }
  return { features, writingProvider: provider, moves };
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
  };
}
