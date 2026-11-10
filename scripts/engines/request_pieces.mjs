// The pieces `WhisperServerManager.transcribe` would cut a whole recording into
// (helpers/whisperRequestCuts.mjs), as segments for `room-replay.js
// --segments-from`: a whole read of a finished conversation through the app's
// own long-recording path, with each piece's place kept.
//
//   node scripts/engines/request_pieces.mjs <stream dir> <out dir>
//
// The stream files are `room-replay.js --dump-stream`'s: the 16 kHz WAV the app
// writes while it records. Times are on the recording's true clock.

import fs from "node:fs";
import path from "node:path";

import { planWhisperRequests, readPcm16Wav } from "../../src/helpers/whisperRequestCuts.mjs";

const [streamDir, outDir] = process.argv.slice(2);
const trueSeconds = (sample) => {
  const chunk = Math.floor(sample / 533);
  return (chunk * 800 + (sample - chunk * 533) * 1.5) / 24000;
};
fs.mkdirSync(outDir, { recursive: true });
for (const name of fs.readdirSync(streamDir).sort()) {
  if (!name.endsWith(".wav")) continue;
  const { samples } = readPcm16Wav(fs.readFileSync(path.join(streamDir, name)));
  const pieces = await planWhisperRequests(samples);
  const meeting = name.replace(".wav", "");
  const segments = pieces.map((p) => ({
    start: trueSeconds(p.startSample),
    end: trueSeconds(p.endSample),
  }));
  fs.writeFileSync(path.join(outDir, `${meeting}.json`), JSON.stringify({ meeting, segments }));
  console.log(meeting, segments.length);
}
