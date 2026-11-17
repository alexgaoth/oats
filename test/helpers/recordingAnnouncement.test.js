const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// What a screen reader hears when a recording starts. It says only that the
// recording started: with an API key a conversation streams to the provider,
// so a sentence about where audio stays would be untrue in that mode.

const LOCALES = {
  en: "Recording.",
  es: "Grabando.",
  fr: "Enregistrement en cours.",
  de: "Aufnahme läuft.",
  pt: "Gravando.",
  it: "Registrazione in corso.",
  ru: "Идёт запись.",
  ja: "録音中。",
  "zh-CN": "正在录音。",
  "zh-TW": "正在錄音。",
};

for (const [locale, expected] of Object.entries(LOCALES)) {
  test(`the recording announcement in ${locale} says only that it is recording`, () => {
    const file = path.join(__dirname, "../../src/locales", locale, "translation.json");
    const translation = require(file);
    assert.equal(translation.oats.conversation.statusRecording, expected);
  });
}
