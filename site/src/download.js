// The download buttons: one click to the right DMG. The release assets keep
// the same names in every version (build-and-notarize.yml, the release job), so
// "latest" always serves the newest published Oats.

const RELEASES = "https://github.com/alexgaoth/oats/releases";
export const DMG = {
  arm64: `${RELEASES}/latest/download/Oats-arm64.dmg`,
  x64: `${RELEASES}/latest/download/Oats-x64.dmg`,
};

function isMac() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  // iPadOS reports a Mac platform; its touch points give it away.
  return /mac/i.test(platform) && !(navigator.maxTouchPoints > 1);
}

/**
 * "arm64", "x64", or null when the browser cannot tell. Chromium says so
 * through client hints. Elsewhere the GPU name helps on Intel Macs (Intel, AMD
 * graphics); Safari names every Mac GPU "Apple GPU", so it cannot tell.
 */
async function macArchitecture() {
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues?.(["architecture"]);
    if (hints?.architecture === "arm") return "arm64";
    if (hints?.architecture === "x86") return "x64";
  } catch {
    // Not offered: fall through.
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    if (/Apple M\d/i.test(renderer)) return "arm64";
    if (/Intel|AMD|Radeon|NVIDIA/i.test(renderer)) return "x64";
  } catch {
    // No WebGL: fall through.
  }
  return null;
}

/**
 * Wires every `[data-download]` link and the notes beside it. The primary
 * button serves Apple Silicon unless the browser says Intel: most Macs in use
 * are Apple Silicon, and the Intel build stays one click away.
 */
export async function wireDownloads() {
  const mac = isMac();
  document.documentElement.dataset.platform = mac ? "mac" : "other";
  const arch = mac ? await macArchitecture() : null;
  const primary = arch === "x64" ? "x64" : "arm64";
  for (const link of document.querySelectorAll("[data-download]")) {
    const which = link.dataset.download === "primary" ? primary : link.dataset.download;
    link.href = DMG[which];
    if (link.dataset.download === "primary") link.dataset.arch = which;
  }
  for (const label of document.querySelectorAll("[data-arch-label]")) {
    label.textContent = primary === "x64" ? "Intel" : "Apple Silicon";
  }
  for (const other of document.querySelectorAll("[data-other-arch]")) {
    const which = primary === "x64" ? "arm64" : "x64";
    other.href = DMG[which];
    other.textContent = which === "x64" ? "Intel Mac? Get the Intel build" : "On Apple Silicon? Get that build";
  }
}
