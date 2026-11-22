const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { inflateSync } = require("node:zlib");

const root = path.join(__dirname, "../..");
const assets = path.join(root, "src/assets/tray-recording");
let TrayManager, motion, maxHop, reduced, displayOptionsChanged;
const app = new EventEmitter();

class FakeTray extends EventEmitter {
  constructor(image) {
    super();
    this.images = [image];
  }
  isDestroyed() {
    return false;
  }
  setImage(image) {
    this.images.push(image);
  }
  setToolTip(tooltip) {
    this.tooltip = tooltip;
  }
  setContextMenu(menu) {
    this.menu = menu;
  }
  setIgnoreDoubleClickEvents() {}
}

test.before(async () => {
  require.cache[require.resolve("electron")] = {
    exports: {
      app,
      Tray: FakeTray,
      Menu: { buildFromTemplate: (template) => template },
      systemPreferences: {
        getAnimationSettings: () => ({ prefersReducedMotion: reduced }),
        subscribeWorkspaceNotification(event, callback) {
          assert.equal(event, "NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification");
          displayOptionsChanged = callback;
          return 0;
        },
        unsubscribeWorkspaceNotification() {
          displayOptionsChanged = undefined;
        },
      },
      nativeImage: {
        createEmpty() {
          return {
            scales: [],
            addRepresentation({ scaleFactor }) {
              this.scales.push(scaleFactor);
            },
            getScaleFactors() {
              return this.scales;
            },
            setTemplateImage(template) {
              this.template = template;
            },
          };
        },
      },
    },
  };
  ({ HOP: maxHop } = await import("../../src/helpers/oatsMarkMotion.mjs"));
  motion = await import("../../src/helpers/recordingToss.mjs");
  TrayManager = require("../../src/helpers/tray.js");
});

const idle = { isEmpty: () => false };

async function makeTray(t, { platform = "darwin", reduce = false, recording = false } = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { ...descriptor, value: platform });
  t.after(() => {
    app.emit("will-quit");
    Object.defineProperty(process, "platform", descriptor);
  });
  reduced = reduce;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const setTimer = t.mock.method(global, "setTimeout");
  const manager = new TrayManager();
  manager.loadTrayIcon = async () => idle;
  if (recording) manager.setConversationState({ recording });
  await manager.createTray();
  return { manager, tray: manager.tray, setTimer };
}

test("macOS plays a toss, rests, loops, and restores the exact idle image on Stop", async (t) => {
  const { manager, tray, setTimer } = await makeTray(t);
  const { RECORDING_TOSS_STEP_MS: step, RECORDING_TOSS_FRAMES: count } = motion;
  assert.equal(setTimer.mock.callCount(), 0);
  manager.setConversationState({ recording: true });
  manager.setConversationState({ recording: true });
  assert.equal(setTimer.mock.callCount(), 1);
  for (let i = 0; i < count; i++) t.mock.timers.tick(step);
  assert.deepEqual(tray.images, [idle, ...manager.recordingIcons, manager.recordingIcons[0]]);
  t.mock.timers.tick(motion.RECORDING_TOSS_REST_MS);
  assert.equal(tray.images.length, count + 2);
  t.mock.timers.tick(step);
  assert.equal(tray.images.at(-1), manager.recordingIcons[1]);
  assert.ok(manager.recordingIcons.every((image) => image.template));
  assert.deepEqual(manager.recordingIcons[0].scales, [1, 2]);

  manager.setConversationState({ recording: false });
  assert.equal(tray.images.at(-1), idle);
  const writes = tray.images.length;
  const timers = setTimer.mock.callCount();
  t.mock.timers.tick(10_000);
  assert.equal(tray.images.length, writes);
  assert.equal(setTimer.mock.callCount(), timers);
});

test("reduced motion uses the mid-hop template and schedules no timers", async (t) => {
  const { manager, tray, setTimer } = await makeTray(t, { reduce: true, recording: true });
  assert.deepEqual(tray.images, [idle, manager.recordingIcons[motion.RECORDING_TOSS_PEAK]]);
  assert.ok(motion.recordingTossPose(motion.RECORDING_TOSS_PEAK).hop > maxHop * 0.99);
  assert.equal(setTimer.mock.callCount(), 0);
  manager.setConversationState({ recording: false });
  assert.equal(tray.images.at(-1), idle);
  assert.equal(setTimer.mock.callCount(), 0);
});

test("a missing frame falls back to the mid-hop template without timers", async (t) => {
  const { manager, tray, setTimer } = await makeTray(t);
  manager.recordingIcons[2] = null;
  manager.setConversationState({ recording: true });
  assert.deepEqual(tray.images, [idle, manager.recordingIcons[motion.RECORDING_TOSS_PEAK]]);
  assert.equal(setTimer.mock.callCount(), 0);
});

test("changing Reduce Motion during recording cancels or restarts motion", async (t) => {
  const { manager, tray, setTimer } = await makeTray(t, { recording: true });
  reduced = true;
  displayOptionsChanged();
  assert.equal(tray.images.at(-1), manager.recordingIcons[motion.RECORDING_TOSS_PEAK]);
  t.mock.timers.tick(10_000);
  assert.equal(setTimer.mock.callCount(), 1);
  reduced = false;
  displayOptionsChanged();
  t.mock.timers.tick(motion.RECORDING_TOSS_STEP_MS);
  assert.equal(tray.images.at(-1), manager.recordingIcons[1]);
});

test("quit cancels the timer even if recording is active", async (t) => {
  const { tray, setTimer } = await makeTray(t, { recording: true });
  assert.equal(setTimer.mock.callCount(), 1);
  app.emit("will-quit");
  assert.equal(displayOptionsChanged, undefined);
  t.mock.timers.tick(10_000);
  assert.equal(tray.images.length, 2);
  assert.equal(setTimer.mock.callCount(), 1);
});

for (const platform of ["linux", "win32"]) {
  test(`${platform} keeps its idle image and a recording menu, with no timer`, async (t) => {
    const { manager, tray, setTimer } = await makeTray(t, { platform });
    const tooltip = tray.tooltip;
    const label = tray.menu[0].label;
    manager.setConversationState({ recording: true });
    assert.deepEqual(tray.images, [idle]);
    assert.notEqual(tray.tooltip, tooltip);
    assert.notEqual(tray.menu[0].label, label);
    assert.equal(setTimer.mock.callCount(), 0);
  });
}

test("each tray pose is a black and alpha PNG at 16 px and 32 px", () => {
  assert.equal(readdirSync(assets).length, motion.RECORDING_TOSS_FRAMES * 2);
  for (const size of [16, 32]) {
    const distinct = new Set();
    for (let index = 0; index < motion.RECORDING_TOSS_FRAMES; index++) {
      const name = `recording-${String(index).padStart(2, "0")}Template${size === 32 ? "@2x" : ""}.png`;
      const png = readFileSync(path.join(assets, name));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
      assert.deepEqual([...png.subarray(24, 29)], [8, 6, 0, 0, 0], `${name}: 8-bit RGBA`);
      const chunks = [];
      for (let offset = 8; offset + 12 <= png.length;) {
        const length = png.readUInt32BE(offset);
        if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
          chunks.push(png.subarray(offset + 8, offset + 8 + length));
        }
        offset += length + 12;
      }
      const bytes = inflateSync(Buffer.concat(chunks));
      const stride = 4 * size + 1;
      assert.equal(bytes.length, stride * size);
      assert.equal(bytes[4], 0, `${name}: transparent top-left pixel`);
      let hasInk = false;
      for (let start = 1; start < bytes.length; start += stride) {
        for (let p = start; p < start + stride - 1; p += 4) {
          // PNG predicts each channel from that channel's neighbors. All-zero
          // filtered RGB reconstructs all-zero RGB with any PNG filter.
          assert.equal(bytes[p] | bytes[p + 1] | bytes[p + 2], 0, `${name}: black ink`);
          hasInk ||= bytes[p + 3] !== 0;
        }
      }
      assert.ok(hasInk, `${name}: contains ink`);
      distinct.add(bytes.toString("base64"));
    }
    assert.ok(distinct.size > 10, `${size}px: frames show different poses`);
  }
});
