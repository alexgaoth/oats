#!/usr/bin/env node
/**
 * Ask i18next for every key the code can ask for, and report the ones it cannot
 * answer.
 *
 * `i18n:check` compares locales against *each other*, so it is blind to a key
 * that is missing from all ten, and blind to a key the code requests that no
 * locale has. Walking the rendered DOM is blind too: it only sees states the
 * walk enters, and a key whose fallback happens to be real English words looks
 * like working copy. Both blind spots shipped real defects.
 *
 * So this asks the library. Every literal `t("a.b")` in source, plus every
 * runtime-built `` t(`a.b.${x}`) `` expanded over the values the code can
 * actually produce, run through a real i18next instance loaded from the real
 * translation files with `saveMissing` on.
 *
 *   node scripts/check-missing-keys.js [--locale en,de,ru,ja]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOCALES = path.join(ROOT, "src", "locales");
const at = process.argv.indexOf("--locale");
const WANTED = at !== -1 && process.argv[at + 1] ? process.argv[at + 1].split(",") : ["en", "de", "ru", "ja"];

/**
 * Values a runtime-built key's variable can take, where naming them is better
 * than guessing.
 *
 * These are unions the checker cannot see — enum members, discriminated kinds —
 * and each entry says where it comes from. It is a *supplement*, never the
 * source of truth: the bases themselves are derived mechanically below, because
 * a hand-kept list of them covered 5 of the 14 in source, and deleting
 * `oats.nav.conversation` left every gate green while the Conversation nav
 * button rendered the raw key.
 */
const DYNAMIC = {
  // QuestionOutcome — src/types/conversationEvents.ts
  "questionCard.state": ["asked", "answered", "uncertain", "silence", "denied"],
  // findExcerpt's `source` — src/helpers/conversationRecall.mjs
  "oats.intelligence.match": ["transcript", "note", "summary", "title"],
  // DetailTab — src/components/OatsWorkspace.tsx
  "oats.intelligence.tabs": ["summary", "transcript", "connections"],
  // PreflightProblem — src/utils/preflight.ts
  "oats.preflight": [
    "no-microphone",
    "microphone-permission",
    "no-speech-engine",
    "no-model",
    "no-api-key",
    "no-summary-model",
    "question-cards-off",
  ],
};

/**
 * Guard the runtime-built subtrees against shrinking.
 *
 * The obvious idea — ask for every English key under each dynamic base — cannot
 * work, and measuring it is what showed why: the asked set is derived from the
 * same file being checked, so deleting `oats.nav.conversation` simply removes it
 * from both sides and the check stays green. Verified: asked went 1251 → 1249
 * and reported 0 missing.
 *
 * What the value union actually is lives in the code (`t(`oats.nav.${id}`)` with
 * `id` from a list in a component), and there is no general way to read it. So
 * this guards the thing a prune can actually break: a subtree that used to have
 * a key and now does not. It compares each dynamic base's key set against the
 * last commit.
 *
 * It does **not** catch a key that never existed — `check-i18n.js` and the
 * literal-`t()` sweep cover that ground — and it says so rather than implying
 * otherwise.
 */
function shrunkDynamicSubtrees(bases, flattenKeys) {
  let previous;
  try {
    previous = JSON.parse(
      require("child_process").execSync("git show HEAD:src/locales/en/translation.json", {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        // Silenced: outside a git checkout this prints "fatal: not a git
        // repository" and then succeeds, and a fatal line in a green build is
        // the kind of noise people learn to scroll past.
        stdio: ["ignore", "pipe", "ignore"],
      })
    );
  } catch {
    // No git, or no previous version: nothing to compare, and inventing a
    // failure here would make the gate flaky rather than strict.
    return [];
  }
  const now = new Set(flattenKeys(JSON.parse(fs.readFileSync(path.join(LOCALES, "en", "translation.json"), "utf8"))));
  const lost = [];
  for (const key of flattenKeys(previous)) {
    if (now.has(key)) continue;
    for (const base of bases) {
      if (key === base || key.startsWith(`${base}.`)) {
        lost.push(key);
        break;
      }
    }
  }
  return lost;
}

function sourceFiles() {
  const files = [];
  const skip = new Set(["dist", "locales", "assets", "node_modules", "release"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(ROOT, "src"));
  for (const file of ["main.js", "preload.js"]) {
    const full = path.join(ROOT, file);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

function literalKeys(blob) {
  const keys = new Set();
  // Strip comments first: a doc comment saying `t("x.y", { count })` is not a
  // call site, and treating it as one makes the check report a key nobody asks
  // for — which is how a green run stops meaning anything.
  const code = blob
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  for (const m of code.matchAll(/\bt\(\s*["']([A-Za-z][\w.-]*\.[\w.-]+)["']/g)) keys.add(m[1]);
  // <Trans i18nKey="..."> too.
  for (const m of code.matchAll(/i18nKey=["']([A-Za-z][\w.-]*\.[\w.-]+)["']/g)) keys.add(m[1]);
  return keys;
}

(async () => {
  const i18next = require("i18next");
  const { dynamicBases, flattenKeys } = await import("../src/helpers/localeKeyUsage.mjs");
  const blob = sourceFiles().map((f) => fs.readFileSync(f, "utf8")).join("\n");

  const asked = literalKeys(blob);
  // Keys named by data rather than by code: the model registry's
  // `descriptionKey` fields are asked for at render time exactly like a literal
  // `t()` and are invisible to a source scan of JS alone.
  for (const file of ["src/models/modelRegistryData.json"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const m of fs.readFileSync(full, "utf8").matchAll(/"descriptionKey"\s*:\s*"([^"]+)"/g)) {
      asked.add(m[1]);
    }
  }
  for (const [base, values] of Object.entries(DYNAMIC)) {
    for (const value of values) asked.add(`${base}.${value}`);
  }

  const bases = dynamicBases(blob);
  const lost = shrunkDynamicSubtrees(bases, flattenKeys);

  const resources = {};
  for (const locale of WANTED) {
    const file = path.join(LOCALES, locale, "translation.json");
    if (!fs.existsSync(file)) throw new Error(`no locale ${locale}`);
    resources[locale] = { translation: JSON.parse(fs.readFileSync(file, "utf8")) };
  }

  const missing = [];
  await i18next.init({
    resources,
    lng: WANTED[0],
    fallbackLng: false, // a fallback would hide exactly what this looks for
    ns: ["translation"],
    defaultNS: "translation",
    saveMissing: true,
    missingKeyHandler: (lngs, ns, key) => missing.push(`${lngs.join(",")}:${key}`),
    interpolation: { escapeValue: false },
  });

  const unresolved = [];
  for (const locale of WANTED) {
    await i18next.changeLanguage(locale);
    for (const key of asked) {
      // A key resolves if *any* shape of the call finds it: plain for ordinary
      // strings, with a count for plural ones. Reporting `x_one` missing for a
      // non-plural key would bury the real misses in noise.
      missing.length = 0;
      i18next.t(key);
      const plainMissed = missing.length > 0;
      missing.length = 0;
      for (const count of [1, 2, 5]) i18next.t(key, { count });
      // `> 0`, not `>= 3`.
      //
      // i18next fires the handler once per *candidate suffix*, and a language's
      // candidate count is its CLDR category count: Russian offers four, English
      // two. A `>= 3` threshold therefore made English, German, Japanese and both
      // Chinese locales unguarded — deleting `openThreads.count_one` from en left
      // this check reporting "missing: 0" while `t("openThreads.count",{count:1})`
      // returned the raw key, and `check-i18n.js` cannot catch it either because
      // it uses English as its reference.
      const pluralMissedAll = missing.length > 0;
      if (plainMissed && pluralMissedAll) unresolved.push(`${locale}:${key}`);
    }
  }

  const unique = [...new Set(unresolved)];
  console.log(
    `asked ${asked.size} keys x ${WANTED.length} locales; missing: ${unique.length}; ` +
      `runtime-built subtrees shrunk: ${lost.length}`
  );
  for (const entry of unique.slice(0, 40)) console.log(`  missing  ${entry}`);
  for (const entry of lost.slice(0, 40)) console.log(`  removed  ${entry}`);
  if (unique.length || lost.length) process.exit(1);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
