// Which compute backend a running whisper-server reported it loaded the model on.
//
// whisper.cpp says so once per context while it loads, on stderr:
//
//   whisper_backend_init_gpu: using MTL0 backend      Metal ("Metal" in older builds)
//   whisper_backend_init_gpu: using CUDA0 backend
//   whisper_backend_init_gpu: using Vulkan0 backend
//   whisper_backend_init_gpu: no GPU found            the CPU
//   whisper_backend_init_gpu: failed to initialize MTL0 backend   the CPU
//
// The sidebar's footer shows this, not what Oats asked for: a GPU build that
// could not start its device runs on the CPU, and says CPU. The last line wins,
// because a failure follows the line that chose the device.

const LINE =
  /whisper_backend_init_gpu: (?:using (\S+) backend|no GPU found|failed to initialize \S+ backend)/g;

const DEVICES = [
  [/^(mtl|metal)/i, "Metal"],
  [/^cuda/i, "CUDA"],
  [/^vulkan/i, "Vulkan"],
];

/**
 * @param {string} log whisper-server's stderr so far
 * @returns {"Metal" | "CUDA" | "Vulkan" | "CPU" | string | null} null until the
 *   server has said; an unfamiliar device by the name the server gave it.
 */
function parseWhisperBackend(log) {
  let backend = null;
  for (const match of String(log ?? "").matchAll(LINE)) {
    const device = match[1];
    if (!device) {
      backend = "CPU";
      continue;
    }
    backend = DEVICES.find(([pattern]) => pattern.test(device))?.[1] ?? device;
  }
  return backend;
}

module.exports = { parseWhisperBackend };
