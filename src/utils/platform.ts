export type Platform = "darwin" | "win32" | "linux";

/**
 * Detects the current platform using Electron when available,
 * falling back to user agent detection.
 */
export function getPlatform(): Platform {
  // Try Electron API first
  if (typeof window !== "undefined" && window.electronAPI?.getPlatform) {
    const platform = window.electronAPI.getPlatform();
    if (platform === "darwin" || platform === "win32" || platform === "linux") {
      return platform;
    }
  }

  // Fallback to user agent detection
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("win")) return "win32";
    if (ua.includes("linux")) return "linux";
  }

  // Default to darwin
  return "darwin";
}

/**
 * Cached platform value for performance
 */
let cachedPlatform: Platform | null = null;

export function getCachedPlatform(): Platform {
  if (cachedPlatform === null) {
    cachedPlatform = getPlatform();
  }
  return cachedPlatform;
}

/**
 * Publish the platform to CSS as `<html data-platform="…">`.
 *
 * Some differences between platforms are not a component's business — whether
 * macOS should keep its overlay scrollbars is a property of the OS, not of any
 * one scrollable region — and expressing them as a stylesheet rule is both
 * cheaper and less error-prone than threading a prop to every such place.
 *
 * Called once from the renderer entry point, before React mounts, so the first
 * paint already has it. Safe to call again.
 */
export function applyPlatformAttribute(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-platform", getCachedPlatform());
}
