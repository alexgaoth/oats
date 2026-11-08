// room-replay's engine protocol (a WAV path) on the helper's protocol (base64 PCM).
import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
const [bin, ...args] = process.argv.slice(2);
const helper = spawn(bin, args, { stdio: ["pipe", "pipe", "inherit"] });
readline
  .createInterface({ input: helper.stdout })
  .on("line", (l) => process.stdout.write(l + "\n"));
const dataOffset = (b) => {
  let at = 12;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "data") return [at + 8, size];
    at += 8 + size + (size & 1);
  }
  throw new Error("no data chunk");
};
readline
  .createInterface({ input: process.stdin })
  .on("line", (l) => {
    const q = JSON.parse(l);
    const b = fs.readFileSync(q.wav);
    const [at, size] = dataOffset(b);
    helper.stdin.write(
      JSON.stringify({
        id: q.id,
        pcm: b.subarray(at, at + size).toString("base64"),
        keepFrom: q.keepFrom,
      }) + "\n"
    );
  })
  .on("close", () => helper.stdin.end());
