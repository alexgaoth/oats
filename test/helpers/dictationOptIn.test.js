const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Dictation is opt-in on macOS (Settings › General › Advanced) and stays on by
// default on Windows and Linux. Off has to mean off everywhere at once: no
// floating oat, no dictation key bound on any backend, no Dictation page, and
// no Accessibility prompt, since Accessibility only pastes a dictation.
//
// The main-process parts run here for real, against a stubbed Electron: the
// .env default, the hotkey slots and the window manager's gates. The renderer
// parts are pure helpers plus source pins on the components that use them.

// Stub Electron before anything requires it. globalShortcut is a Map so the
// assertions can read exactly which accelerators are bound.
const registered = new Map();
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "oats-dictation-"));
const noop = () => {};
require.cache[require.resolve("electron")] = {
  exports: {
    app: { on: noop, getPath: () => userData, getName: () => "Oats", isPackaged: false },
    globalShortcut: {
      register(accelerator, callback) {
        if (registered.has(accelerator)) return false;
        registered.set(accelerator, callback);
        return true;
      },
      unregister(accelerator) {
        registered.delete(accelerator);
      },
      isRegistered: (accelerator) => registered.has(accelerator),
      unregisterAll: () => registered.clear(),
    },
    BrowserWindow: class {
      static getAllWindows() {
        return [];
      }
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({
        id: 1,
        workArea: { x: 0, y: 0, width: 1440, height: 900 },
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
      }),
    },
    powerSaveBlocker: { start: () => 1, stop: noop, isStarted: () => true },
    Menu: { setApplicationMenu: noop, buildFromTemplate: () => ({}) },
    shell: {},
    dialog: {},
    // Read by secretCrypto; absent means no encryption, which nothing here needs.
    safeStorage: undefined,
  },
};

const HotkeyManager = require("../../src/helpers/hotkeyManager.js");
const { DICTATION_SLOTS } = HotkeyManager;
const EnvironmentManager = require("../../src/helpers/environment.js");
const WindowManager = require("../../src/helpers/windowManager.js");

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from > -1 && to > -1, `could not find ${start} … ${end}`);
  return source.slice(from, to);
};
const count = (source, needle) => source.split(needle).length - 1;

let resolveDictationEnabled;
let defaultDictationEnabled;
let isSettingsPageShown;
let needsAccessibility;
let visibleSettingsPages;
let shownSettingsPage;
let areRequiredPermissionsMet;

test.before(async () => {
  ({ resolveDictationEnabled, defaultDictationEnabled, isSettingsPageShown, needsAccessibility } =
    await import("../../src/helpers/dictationSetting.mjs"));
  ({ visibleSettingsPages, shownSettingsPage } =
    await import("../../src/components/settings/settingsPages.ts"));
  ({ areRequiredPermissionsMet } = await import("../../src/utils/permissions.ts"));
});

test.after(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

// The constructor default, the slot defaults and the .env default all read
// process.platform, so each platform is checked on whichever one runs this.
async function onPlatform(platform, fn) {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { ...original, value: platform });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

async function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (had) process.env[name] = previous;
    else delete process.env[name];
  }
}

// The floating oat, as much of a BrowserWindow as the window manager touches.
function fakeOat() {
  const oat = {
    shows: 0,
    sent: [],
    visible: false,
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => oat.visible,
    restore: noop,
    focus: noop,
    show() {
      oat.shows += 1;
      oat.visible = true;
    },
    showInactive() {
      oat.shows += 1;
      oat.visible = true;
    },
    hide() {
      oat.visible = false;
    },
    getBounds: () => ({ x: 1340, y: 800, width: 96, height: 96 }),
    setBounds: noop,
    setIgnoreMouseEvents: noop,
    webContents: {
      send: (channel) => oat.sent.push(channel),
      isLoading: () => false,
      once: noop,
      executeJavaScript: async () => "",
    },
  };
  return oat;
}

test("dictation starts off on macOS and on everywhere else", () => {
  for (const [platform, expected] of [
    ["darwin", false],
    ["win32", true],
    ["linux", true],
  ]) {
    assert.equal(defaultDictationEnabled(platform), expected, platform);
    // An install that never chose follows the default, whatever an older build
    // or a hand edit left behind; an explicit choice wins on every platform.
    for (const unset of [null, undefined, "", "yes"]) {
      assert.equal(resolveDictationEnabled(unset, platform), expected, `${platform}, ${unset}`);
    }
    assert.equal(resolveDictationEnabled("true", platform), true);
    assert.equal(resolveDictationEnabled("false", platform), false);
  }
});

test("the main process reads .env exactly as the renderer reads localStorage", async () => {
  // Main decides at launch, before any window exists, whether the oat shows and
  // the keys are bound. If the two twins disagreed about an unset value, the
  // switch would show one state while the app behaved in the other.
  const env = Object.create(EnvironmentManager.prototype);
  for (const platform of ["darwin", "win32", "linux"]) {
    for (const stored of [undefined, "", "true", "false", "yes"]) {
      await onPlatform(platform, () =>
        withEnv("DICTATION_ENABLED", stored, () => {
          assert.equal(
            env.getDictationEnabled(),
            resolveDictationEnabled(stored ?? null, platform),
            `${platform}, DICTATION_ENABLED=${stored}`
          );
        })
      );
    }
  }
});

test("a choice is written to .env and outranks the platform default", async () => {
  const env = Object.create(EnvironmentManager.prototype);
  const written = [];
  env.saveAllKeysToEnvFile = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    written.push(process.env.DICTATION_ENABLED);
    return { success: true };
  };
  await withEnv("DICTATION_ENABLED", undefined, async () => {
    // Resolves only once .env is on disk: turning dictation on can bind the
    // default key, and that path reloads .env with override.
    await env.saveDictationEnabled(false);
    assert.deepEqual(written, ["false"]);
    await onPlatform("linux", () => assert.equal(env.getDictationEnabled(), false));

    await env.saveDictationEnabled(true);
    assert.deepEqual(written, ["false", "true"]);
    await onPlatform("darwin", () => assert.equal(env.getDictationEnabled(), true));
  });
  // And it is one of the keys the .env writer keeps; anything else is dropped
  // on the next write.
  const persisted = between(read("src/helpers/environment.js"), "const PERSISTED_KEYS", "];");
  assert.match(persisted, /"DICTATION_ENABLED"/);
});

test("no dictation key is bound while dictation is off", async () => {
  registered.clear();
  // macOS skips the Linux desktop backends, so the slots are bound through the
  // globalShortcut stub on every machine that runs this.
  await onPlatform("darwin", async () => {
    await withEnv("DICTATION_KEY", "F8", async () => {
      const mgr = new HotkeyManager();
      await mgr.setDictationEnabled(false);
      // The constructor's GLOBE default must not linger: the Globe listener
      // reads this slot and would start a dictation from Fn.
      assert.deepEqual(mgr.getSlotHotkeys("dictation"), []);

      await mgr.initializeHotkey(fakeOat(), noop);
      await mgr.registerSlot("voiceAgent", "F7", noop);
      await mgr.registerSlot("translation", "F6", noop);
      await mgr.registerSlot("conversation", "Control+Shift+O", noop);
      await mgr.registerSlot("search", "Control+Shift+K", noop);

      assert.deepEqual([...registered.keys()].sort(), ["Control+Shift+K", "Control+Shift+O"]);
      for (const slot of DICTATION_SLOTS) {
        assert.deepEqual(mgr.getSlotHotkeys(slot), [], `${slot} must be empty`);
      }
      assert.deepEqual(mgr.getNativeListenerKeys("push"), [], "push-to-talk watches nothing");

      // A key chosen while off (Settings, onboarding) is kept for later, not bound.
      const viaSlot = await mgr.registerSlot("dictation", "F9", noop);
      assert.equal(viaSlot.success, true);
      mgr.saveHotkeyToRenderer = async () => true;
      const viaUpdate = await mgr.updateHotkey("F10", noop);
      assert.equal(viaUpdate.success, true);
      assert.equal(registered.has("F9") || registered.has("F10"), false);
      assert.deepEqual(mgr.getSlotHotkeys("dictation"), []);
    });
  });
});

test("turning dictation on binds the saved keys at once, and off releases them", async () => {
  registered.clear();
  await onPlatform("darwin", async () => {
    await withEnv("DICTATION_KEY", "F8", async () => {
      const mgr = new HotkeyManager();
      await mgr.setDictationEnabled(false);
      await mgr.initializeHotkey(fakeOat(), noop);
      await mgr.registerSlot("voiceAgent", "F7", noop);
      await mgr.registerSlot("translation", "F6", noop);
      await mgr.registerSlot("conversation", "Control+Shift+O", noop);

      await mgr.setDictationEnabled(true);
      assert.deepEqual(mgr.getSlotHotkeys("dictation"), ["F8"], "the saved key, from .env");
      for (const key of ["F8", "F7", "F6", "Control+Shift+O"]) {
        assert.ok(registered.has(key), `${key} should be bound`);
      }

      await mgr.setDictationEnabled(false);
      assert.deepEqual([...registered.keys()], ["Control+Shift+O"], "only the conversation key");

      // A key cleared while dictation is off stays cleared when it comes back.
      mgr.unregisterSlot("translation");
      await mgr.setDictationEnabled(true);
      assert.ok(registered.has("F8") && registered.has("F7"));
      assert.equal(registered.has("F6"), false);
    });
  });
});

test("a delayed desktop binding does not land after dictation is turned off", async () => {
  // GNOME, KDE and Hyprland bind the dictation key a second after startup.
  const mgr = new HotkeyManager();
  let bound = false;
  mgr._armDictation(() => {
    bound = true;
  }, 10);
  await mgr.setDictationEnabled(false);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(bound, false);
});

test("the oat stays hidden and no dictation starts while dictation is off", async () => {
  const wm = new WindowManager();
  const oat = fakeOat();
  wm.mainWindow = oat;
  try {
    await wm.setDictationEnabled(false);

    // Every way the oat is shown or a dictation starts.
    wm.showDictationPanel();
    wm.sendToggleDictation();
    wm.sendToggleVoiceAgent();
    wm.sendToggleTranslation();
    wm.sendStartDictation();
    wm.startWindowsPushToTalk("F8");
    wm.startMacCompoundPushToTalk("Control+Alt");
    // A conversation starting used to bring the oat back for its duration.
    wm.setConversationState({ recording: true, startedAt: Date.now() });

    assert.equal(oat.shows, 0, "the oat was shown");
    assert.deepEqual(
      oat.sent.filter((channel) => channel !== "conversation-state-changed"),
      [],
      "a dictation was started"
    );
    assert.equal(wm.winPushState, null);
    assert.equal(wm.macCompoundPushState, null);

    // On again, with no restart: the oat comes back and a key reaches it.
    await wm.setDictationEnabled(true);
    assert.equal(oat.shows, 1);
    wm.sendToggleDictation();
    assert.ok(oat.sent.includes("toggle-dictation"));

    await wm.setDictationEnabled(false);
    assert.equal(oat.visible, false, "turning it off hides the oat");
  } finally {
    wm.hideDictationPanel();
    wm.releaseSleepGuard();
  }
});

test("main applies the setting before the oat or any key exists", () => {
  const main = read("main.js");
  const applied = main.indexOf(
    "await windowManager.setDictationEnabled(environmentManager.getDictationEnabled());"
  );
  const created = main.indexOf("await windowManager.createMainWindow();");
  const keys = main.indexOf('hotkeyManager.registerSlot(\n      "voiceAgent"');
  assert.ok(applied > -1, "startup must apply the saved setting");
  assert.ok(applied < created, "before the oat is created, or it shows for a moment");
  assert.ok(keys === -1 || applied < keys, "before the voice agent key is registered");

  // The runtime switch is a real IPC channel on both sides.
  assert.match(read("src/helpers/ipcHandlers.js"), /ipcMain\.handle\("set-dictation-enabled"/);
  assert.match(read("preload.js"), /ipcRenderer\.invoke\("set-dictation-enabled", enabled\)/);
});

test("the renderer's default is the same platform rule", () => {
  const store = read("src/stores/settingsStore.ts");
  assert.match(
    store,
    /dictationEnabled: resolveDictationEnabled\(\s*isBrowser \? localStorage\.getItem\("dictationEnabled"\) : null,\s*getCachedPlatform\(\)\s*\)/
  );
  // A write from the Settings window reaches the oat's window as a boolean.
  assert.match(between(store, "const BOOLEAN_SETTINGS", "]);"), /"dictationEnabled"/);
});

test("the Dictation page is listed only while dictation is on", () => {
  assert.equal(isSettingsPageShown("dictation", false), false);
  assert.equal(isSettingsPageShown("dictation", true), true);

  const off = visibleSettingsPages(false).map((page) => page.id);
  const on = visibleSettingsPages(true).map((page) => page.id);
  assert.equal(off.includes("dictation"), false);
  assert.deepEqual(
    on.filter((id) => id !== "dictation"),
    off,
    "nothing else changes with the switch"
  );
  assert.ok(on.includes("dictation"));

  // An open Dictation page falls back to General when dictation is turned off.
  assert.equal(shownSettingsPage("dictation", false), "general");
  assert.equal(shownSettingsPage("dictation", true), "dictation");
  assert.equal(shownSettingsPage("privacy", false), "privacy");

  const sidebar = read("src/components/shell/AppSidebar.tsx");
  assert.match(sidebar, /visibleSettingsPages\(dictationEnabled\)\.map/);
  assert.doesNotMatch(sidebar, /SETTINGS_PAGES\.map/, "the sidebar must use the filtered list");
  const workspace = read("src/components/OatsWorkspace.tsx");
  assert.match(workspace, /shownSettingsPage\(requested, dictationEnabled\)/);
  assert.match(workspace, /shownSettingsPage\(settingsPage, dictationEnabled\)/);
});

test("the dictation shortcut and tap or hold moved under the switch, not copied", () => {
  const settings = read("src/components/SettingsPage.tsx");
  const general = between(settings, 'case "general":', 'case "shortcuts":');
  const shortcuts = between(settings, 'case "shortcuts":', 'case "recording":');

  assert.match(general, /<SectionHeader title=\{t\("oats\.settings\.advanced\.title"\)\} \/>/);
  assert.match(
    general,
    /<Toggle\s+checked=\{dictationEnabled\}\s+onChange=\{setDictationEnabled\}/
  );
  // Both rows sit in the Advanced panel and render only while dictation is on.
  const advanced = general.slice(general.indexOf("oats.settings.advanced.title"));
  assert.match(
    advanced,
    /\{dictationEnabled && \(\s*<SettingsPanelRow>\s*<SettingsRow\s+label=\{t\("oats\.settings\.global\.dictation"\)\}/
  );
  assert.match(
    advanced,
    /\{dictationEnabled && \(!isUsingNativeShortcut \|\| platform === "linux"\)/
  );
  assert.match(advanced, /<ActivationModeSelector/);
  assert.match(advanced, /registerHotkey\(effectiveDefaultHotkey\)/, "the reset button moved too");

  assert.doesNotMatch(shortcuts, /registerHotkey\(|ActivationModeSelector|global\.dictation/);
  assert.match(shortcuts, /<ConversationShortcutRow \/>/, "the conversation key stays");
  assert.match(shortcuts, /value=\{searchKey\}/, "the search key stays");

  assert.equal(count(settings, "<ActivationModeSelector"), 1);
  assert.equal(count(settings, "registerHotkey(list)"), 1);
});

test("Accessibility is neither required nor shown while dictation is off", () => {
  // The microphone is the one permission that gates anything.
  assert.equal(areRequiredPermissionsMet(true), true);
  assert.equal(areRequiredPermissionsMet(false), false);

  assert.equal(needsAccessibility("darwin", false), false);
  assert.equal(needsAccessibility("darwin", true), true);
  assert.equal(needsAccessibility("win32", true), false);
  assert.equal(needsAccessibility("linux", true), false);

  // Every place that shows or checks it asks the same question.
  const settings = read("src/components/SettingsPage.tsx");
  const privacy = between(settings, 'case "privacy":', 'case "about":');
  assert.match(privacy, /needsAccessibility\(platform, dictationEnabled\) && \(\s*<PermissionCard/);
  assert.match(
    privacy,
    /needsAccessibility\(platform, dictationEnabled\) && \(\s*<div className="mt-8">/
  );
  const section = read("src/components/ui/PermissionsSection.tsx");
  assert.match(section, /needsAccessibility\(platform, dictationEnabled\)/);
  assert.doesNotMatch(section, /\{isMacOS && \(/);
  const hook = read("src/hooks/usePermissions.ts");
  assert.equal(count(hook, "if (!needsAccessibility(getPlatform(), dictationEnabled)) return;"), 2);

  // First run binds no dictation key while dictation is off.
  const onboarding = read("src/components/OnboardingFlow.tsx");
  assert.match(onboarding, /if \(dictationEnabled\) \{\s*await tryRegisterHotkey\(\);/);
});
