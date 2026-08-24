// Which translation keys any code path could still reach.
//
// A literal search is the obvious implementation and it is wrong here. The
// product builds keys at runtime — `t(`oats.intelligence.match.${source}`)`,
// `t(`questionCard.state.${outcome}`)` — so `oats.intelligence.match.transcript`
// appears in no source file and is very much alive. Deleting on a literal match
// would have removed the provenance labels a search result depends on.
//
// So a key is reachable when **any dotted prefix of it** appears in source.
// `oats.intelligence.match` is present, therefore every key beneath it survives.
// That is deliberately generous: the cost of keeping a dead string is a few
// bytes, and the cost of deleting a live one is a raw key rendered on screen.
//
// i18next plural suffixes (`_one`, `_other`, …) are stripped before matching,
// because the code says `t("x.y", { count })` and never writes the suffix.
//
// Pure and DOM-free so the reachability rule can be pinned rather than trusted.

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * The static head of every runtime-built key, e.g. `suggestions` from
 * `` t(`suggestions.${suggestion.kind}`) ``.
 *
 * Requiring a *dotted* prefix was not enough, and the miss was expensive:
 * `suggestions.unfinished` and `suggestions.shallow` are only ever reached
 * through that template, their static head is one segment, and the rule deleted
 * both — so an open-thread stack drew the raw key `suggestions.unfinished` at
 * anybody whose conversation left a thread unfinished. The dot requirement
 * exists to stop a bare word in prose keeping a whole namespace alive; a head
 * that is literally followed by `.${` in a template is not prose.
 */
export function dynamicBases(source) {
  const bases = new Set();
  for (const match of String(source ?? "").matchAll(/`([^`\n]*?)\$\{/g)) {
    const head = match[1].replace(/\.$/, "").trim();
    // `${foo}` with no static head, and heads with spaces, are not key prefixes.
    if (head && !/\s/.test(head)) bases.add(head);
  }
  return bases;
}

/** Every dotted prefix of a key, longest first. */
export function prefixesOf(key) {
  const parts = String(key || "").split(".");
  const out = [];
  for (let i = parts.length; i > 0; i -= 1) out.push(parts.slice(0, i).join("."));
  return out;
}

/** The lookup stem the code would actually write. */
export function stemOf(key) {
  return String(key || "").replace(PLURAL_SUFFIX, "");
}

/** Flatten a translation object to its leaf key paths. */
export function flattenKeys(node, prefix = "") {
  const keys = [];
  for (const [name, value] of Object.entries(node ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === "object" && !Array.isArray(value))
      keys.push(...flattenKeys(value, path));
    else keys.push(path);
  }
  return keys;
}

/**
 * Partition a locale's keys into reachable and unreachable.
 *
 * @param {object} translation The parsed `translation.json`.
 * @param {string} source Every source file concatenated.
 * @returns {{ reachable: string[], unreachable: string[] }} Leaf key paths,
 *   including their plural suffixes so a caller can delete exactly what it found.
 */
export function partitionKeys(translation, source) {
  const haystack = String(source ?? "");
  const reachable = [];
  const unreachable = [];
  // One pass per distinct prefix rather than per key: the prefix set is far
  // smaller than the key set and `includes` over a multi-megabyte string is the
  // expensive part.
  const verdict = new Map();
  const isPresent = (candidate) => {
    if (!verdict.has(candidate)) verdict.set(candidate, haystack.includes(candidate));
    return verdict.get(candidate);
  };

  const bases = dynamicBases(haystack);
  for (const key of flattenKeys(translation)) {
    const stem = stemOf(key);
    const hit = prefixesOf(stem).some(
      // A one-segment key like "common" is a namespace, not something the code
      // writes on its own, so a bare word in prose must not keep a whole
      // namespace alive — unless it is the head of a runtime-built key, which
      // is not prose.
      (prefix) => bases.has(prefix) || (prefix.includes(".") && isPresent(prefix))
    );
    (hit ? reachable : unreachable).push(key);
  }
  return { reachable, unreachable };
}
