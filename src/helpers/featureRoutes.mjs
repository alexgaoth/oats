import { LOCAL_SETUP_AUTHORIZED, migrateLocalSetupAuthorization } from "./localSetupConsent.mjs";

export const FEATURES = /** @type {const} */ (["conversations", "dictation", "writing"]);
export const FEATURE_ROUTES_KEY = "oats.featureRoutes";

/** @typedef {typeof FEATURES[number]} Feature */
/** @typedef {"local" | "providers"} Route */
/** @typedef {"openai" | "anthropic"} Provider */
/** @typedef {"ok" | "limited" | "legacy" | "rejected" | "no-access" | "unknown"} RouteKeyStatus */
/** @typedef {Partial<Record<Feature, Route>>} Exceptions */
/** @typedef {Partial<Record<Feature, boolean>>} Consent */
/** @typedef {{ defaultRoute: Route, exceptions: Exceptions, consent: Consent, writingProvider: Provider | null }} FeaturePreferences */

/** @param {unknown} value @returns {value is Route} */
function isRoute(value) {
  return value === "local" || value === "providers";
}

/** @param {unknown} value @returns {value is Provider} */
function isProvider(value) {
  return value === "openai" || value === "anthropic";
}

/**
 * A feature can request the cloud without being ready to use it. Only a
 * usable key for the selected provider enables that path. The local fallback
 * does not grant consent to download weights.
 *
 * @param {FeaturePreferences} preferences
 * @param {Feature} feature
 * @param {Partial<Record<Provider, RouteKeyStatus>>} [keys]
 */
export function resolveFeatureRoute(preferences, feature, keys = {}) {
  const exception = preferences.exceptions[feature] ?? null;
  const requested = exception ?? preferences.defaultRoute;
  const provider = feature === "writing" ? (preferences.writingProvider ?? "openai") : "openai";
  const status = keys[provider];
  const usable = status === "ok" || status === "limited" || status === "legacy";
  const needsKey = requested === "providers" && !usable;
  /** @type {Route} */
  const effective = needsKey ? "local" : requested;
  return {
    exception,
    requested,
    effective,
    provider: requested === "providers" ? provider : null,
    needsKey,
    downloadAuthorized: requested === "local" && preferences.consent[feature] === true,
  };
}

/**
 * Choose the initial writing provider from the key the person supplied.
 * Once selected, keep it even if that key is removed. A new explicit
 * provider choice may replace it, but key availability alone cannot.
 *
 * @param {FeaturePreferences} preferences
 * @param {{ openai?: boolean, anthropic?: boolean }} keys
 * @returns {FeaturePreferences}
 */
export function pinWritingProvider(preferences, keys) {
  if (preferences.writingProvider || (!keys.openai && !keys.anthropic)) return preferences;
  if ((preferences.exceptions.writing ?? preferences.defaultRoute) !== "providers") {
    return preferences;
  }
  return { ...preferences, writingProvider: keys.openai ? "openai" : "anthropic" };
}

/**
 * Change the default, or change just one exception. An exception stays
 * explicit even when it matches the new default. Only reset removes it.
 *
 * @param {FeaturePreferences} preferences
 * @param {Route | null} route
 * @param {Feature} [feature]
 * @returns {FeaturePreferences}
 */
export function changeFeatureRoute(preferences, route, feature) {
  const consent = { ...preferences.consent };
  if (feature) {
    const exceptions = { ...preferences.exceptions };
    if (route === null) delete exceptions[feature];
    else exceptions[feature] = route;
    consent[feature] = (route ?? preferences.defaultRoute) === "local";
    return { ...preferences, exceptions, consent };
  }
  if (route === null) return preferences;
  for (const name of FEATURES) {
    if (!preferences.exceptions[name]) consent[name] = route === "local";
  }
  return { ...preferences, defaultRoute: route, consent };
}

/**
 * Read the new preference or derive it from the old scopes. The old
 * all-local and all-key choices become defaults. For a mixed profile, keep
 * local as the baseline and keep its existing cloud choices as exceptions.
 * Consent migrates independently of route: a key profile that used local
 * speech without an OpenAI key did not consent to model downloads.
 *
 * @param {Pick<Storage, "getItem"> | null} storage
 * @returns {FeaturePreferences}
 */
export function readFeaturePreferences(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(FEATURE_ROUTES_KEY) ?? "null");
    if (isRoute(saved?.defaultRoute)) {
      /** @type {Exceptions} */
      const exceptions = {};
      /** @type {Consent} */
      const consent = {};
      for (const feature of FEATURES) {
        if (isRoute(saved.exceptions?.[feature])) exceptions[feature] = saved.exceptions[feature];
        if (saved.consent?.[feature] === true) consent[feature] = true;
      }
      return {
        defaultRoute: saved.defaultRoute,
        exceptions,
        consent,
        writingProvider: isProvider(saved.writingProvider) ? saved.writingProvider : null,
      };
    }
  } catch {
    // Invalid stored data must not enable a cloud route.
    return { defaultRoute: "local", exceptions: {}, consent: {}, writingProvider: null };
  }

  const legacy = {
    conversations: storage?.getItem("meetingTranscriptionMode"),
    dictation: storage?.getItem("transcriptionMode"),
    writing: storage?.getItem("cleanupMode"),
  };
  /** @type {Route} */
  const defaultRoute = FEATURES.every((feature) => legacy[feature] === "providers")
    ? "providers"
    : "local";
  /** @type {Exceptions} */
  const exceptions = {};
  /** @type {Consent} */
  const consent = {};
  const authorized =
    storage?.getItem("onboardingCompleted") === "true" &&
    storage.getItem(LOCAL_SETUP_AUTHORIZED) === "true";
  for (const feature of FEATURES) {
    const route = legacy[feature];
    if (isRoute(route) && route !== defaultRoute) exceptions[feature] = route;
    if (authorized && route !== "providers") consent[feature] = true;
  }
  const provider = storage?.getItem("cleanupProvider");
  return {
    defaultRoute,
    exceptions,
    consent,
    writingProvider: isProvider(provider) ? provider : null,
  };
}

/**
 * Migrate even when 0.3.x did not have the consent flag. Persist one snapshot
 * so later changes to legacy scope settings do not rewrite the app default.
 *
 * @param {Pick<Storage, "getItem" | "setItem">} storage
 */
export function migrateFeaturePreferences(storage) {
  if (storage.getItem(FEATURE_ROUTES_KEY) !== null) return;
  migrateLocalSetupAuthorization(storage);
  storage.setItem(FEATURE_ROUTES_KEY, JSON.stringify(readFeaturePreferences(storage)));
}
