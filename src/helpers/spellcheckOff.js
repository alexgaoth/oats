// Spellcheck is off in every session, so Chromium never fetches a dictionary
// that nobody asked for.
//
// On Linux and Windows, Chromium spellchecks with Hunspell dictionaries, and it
// downloads a missing one from Google (redirector.gvt1.com). A window's
// `spellcheck: false` does not prevent that. Electron 41 starts to load a
// session's dictionaries when it creates the session, whatever its windows say
// (the Session constructor), and at each launch it fills an empty dictionary
// list with the locale's language (ElectronBrowserContext::InitPrefs). An empty
// list set before that first load ends does prevent it. The load first looks
// for the file on another thread and only then downloads, and `session-created`
// fires in the same task that creates the session, so a listener that empties
// the list there drops the pending load.
//
// macOS uses its own spellchecker, downloads nothing, and ignores
// setSpellCheckerLanguages. If a download begins anyway, networkLedger.js counts
// it. test/helpers/networkBoundary.test.js pins this.

/** Empty a session's dictionary list, which also turns its spellchecker off. */
function turnOffSpellcheck(session) {
  // A build without the built-in spellchecker has no such method.
  session?.setSpellCheckerLanguages?.([]);
}

/**
 * Turn spellcheck off in every session as it is created. Call it before `app`
 * is ready; main.js does, next to the network ledger.
 *
 * Takes Electron's `app` as an argument so tests can pass a fake.
 *
 * @returns {() => void} uninstall
 */
function install({ app } = {}) {
  app?.on?.("session-created", turnOffSpellcheck);
  return () => app?.removeListener?.("session-created", turnOffSpellcheck);
}

module.exports = { install, turnOffSpellcheck };
