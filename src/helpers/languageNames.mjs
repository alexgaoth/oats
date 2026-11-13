// The language picker's names, in the reader's own language, and its search.
//
// The registry (config/languageRegistry.json) names every language in
// English. Read in German, "German" is not where anybody looks for Deutsch,
// so each name is given in the interface's language by Intl.DisplayNames,
// and the search also takes the English name and the code. English keeps the
// registry's names, and a name the platform does not know keeps the
// registry's too. Pure, so it is pinned by test/helpers/languageNames.test.js.

// The registry's Chinese entries are scripts, not countries.
const DISPLAY_CODE = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" };

/**
 * @param {string} code a registry code
 * @param {string | undefined} locale the interface's language
 * @param {string} fallback the registry's English name
 */
export function localizedLanguageName(code, locale, fallback) {
  if (!code || code === "auto" || !locale || /^en(-|$)/i.test(locale)) return fallback;
  try {
    const names = new Intl.DisplayNames([locale], {
      type: "language",
      languageDisplay: "standard",
      fallback: "none",
    });
    const name = names.of(DISPLAY_CODE[code] ?? code);
    if (!name) return fallback;
    // A name alone in a list starts with a capital ("allemand" is "Allemand"
    // there); German's are capitalised already.
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return fallback;
  }
}

/** Case- and accent-folded, so "francais" finds "Français". */
export function foldLanguageText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

/**
 * Whether a picker option answers what was typed: its name as shown, its
 * English name, or its code.
 *
 * @param {{ value: string, label: string, englishLabel?: string }} option
 * @param {string} query
 */
export function languageMatches(option, query) {
  const needle = foldLanguageText(String(query ?? "").trim());
  if (!needle) return true;
  return [option.label, option.englishLabel, option.value].some(
    (text) => text && foldLanguageText(text).includes(needle)
  );
}

/**
 * The registry's options for one interface language: each name in that
 * language with its English name kept for search, Auto-detect first and the
 * rest in that language's alphabetical order.
 *
 * @param {{ value: string, label: string, flag: string }[]} registry
 * @param {string | undefined} locale
 * @param {string} autoLabel what "auto" is called in that language
 */
export function localizedLanguageOptions(registry, locale, autoLabel) {
  const named = registry.map((option) => ({
    ...option,
    label:
      option.value === "auto"
        ? autoLabel || option.label
        : localizedLanguageName(option.value, locale, option.label),
    englishLabel: option.label,
  }));
  if (!locale || /^en(-|$)/i.test(locale)) return named;
  let collator;
  try {
    collator = new Intl.Collator(locale);
  } catch {
    return named;
  }
  const auto = named.filter((option) => option.value === "auto");
  const rest = named.filter((option) => option.value !== "auto");
  return [...auto, ...rest.sort((a, b) => collator.compare(a.label, b.label))];
}
