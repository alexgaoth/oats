#!/usr/bin/env node
/**
 * Remove translation keys no code path can reach.
 *
 * Reachability is `helpers/localeKeyUsage.mjs` — a key survives if **any dotted
 * prefix of it** appears in source, because the product builds keys at runtime
 * and a literal search would delete live ones. Deliberately generous: a dead
 * string costs bytes, a deleted live one puts a raw key on screen.
 *
 *   node scripts/prune-locale-keys.js            # report only
 *   node scripts/prune-locale-keys.js --write    # delete, in all ten locales
 *
 * English decides *which stems live*. It does not decide which plural forms a
 * language has: Russian's CLDR categories include `_few` and `_many`, English
 * has neither, and pruning ru against en's literal key set deleted them — so a
 * Russian user saw "2 open threads" in English for every count except one,
 * because i18next does not fall back to `_other` within a language, it falls
 * through to `fallbackLng`. `i18n:check` cannot see this: it only requires that
 * every English key exists elsewhere.
 *
 * So each locale is pruned against the surviving *stems*, and keeps whatever
 * plural forms it legitimately has for them.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOCALES = path.join(ROOT, "src", "locales");
const WRITE = process.argv.includes("--write");

function sourceBlob() {
  const parts = [];
  const skip = new Set(["dist", "locales", "assets", "node_modules", "release"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // JSON data files name keys too — `modelRegistryData.json` carries 102
      // `descriptionKey` values. Nothing was lost by omitting them, but only
      // because one of them happened to be a substring of an unrelated literal,
      // and a prune that survives on a coincidence is not a prune you can run
      // again.
      else if (/\.(tsx?|jsx?|mjs|cjs|json)$/.test(entry.name)) parts.push(fs.readFileSync(full, "utf8"));
    }
  };
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "scripts"));
  for (const file of ["main.js", "preload.js", "cleanup.js"]) {
    const full = path.join(ROOT, file);
    if (fs.existsSync(full)) parts.push(fs.readFileSync(full, "utf8"));
  }
  // `prompts.json` names keys too, and so do the locale files' own siblings.
  for (const locale of fs.readdirSync(LOCALES)) {
    const prompts = path.join(LOCALES, locale, "prompts.json");
    if (fs.existsSync(prompts)) parts.push(fs.readFileSync(prompts, "utf8"));
  }
  return parts.join("\n");
}

function prune(node, keepStems, stemOf, prefix = "") {
  const out = {};
  for (const [name, value] of Object.entries(node ?? {})) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const child = prune(value, keepStems, stemOf, key);
      if (Object.keys(child).length) out[name] = child;
    } else if (keepStems.has(stemOf(key))) {
      out[name] = value;
    }
  }
  return out;
}

(async () => {
  const { partitionKeys, flattenKeys, stemOf } = await import("../src/helpers/localeKeyUsage.mjs");
  const source = sourceBlob();
  const enPath = path.join(LOCALES, "en", "translation.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

  const { reachable, unreachable } = partitionKeys(en, source);
  console.log(`en: ${reachable.length} reachable, ${unreachable.length} unreachable`);

  const byTop = {};
  for (const key of unreachable) {
    const top = key.split(".")[0];
    byTop[top] = (byTop[top] ?? 0) + 1;
  }
  console.log(
    Object.entries(byTop)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n")
  );

  if (!WRITE) {
    console.log("\n(report only — pass --write to delete)");
    return;
  }

  const keepStems = new Set(reachable.map(stemOf));
  for (const locale of fs.readdirSync(LOCALES)) {
    const file = path.join(LOCALES, locale, "translation.json");
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const before = flattenKeys(parsed).length;
    const pruned = prune(parsed, keepStems, stemOf);
    const after = flattenKeys(pruned).length;
    fs.writeFileSync(file, `${JSON.stringify(pruned, null, 2)}\n`);
    console.log(`  ${locale}: ${before} -> ${after}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
