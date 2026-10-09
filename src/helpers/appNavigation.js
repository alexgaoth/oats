// Which navigations the control panel may make inside its own window.
//
// That window carries the preload bridge, so a page it loads gets the app's
// IPC. Only the app itself and the devtools stay inside; everything else is
// cancelled and handed to the browser.
//
// `appUrl` is `DevServerManager.getAppUrl(true)`: the dev server's panel URL in
// development, and null in a packaged build, which loads its page with
// `loadFile()` instead. The `will-navigate` handler once called
// `appUrl.startsWith()` on it unguarded, so in every packaged build it threw a
// TypeError before `preventDefault()`, and a plain link loaded inside the app
// window.

/**
 * @param {string} url The navigation target, from `will-navigate`.
 * @param {string | null | undefined} appUrl `DevServerManager.getAppUrl(true)`.
 * @returns {boolean} true to let the window navigate, false to open `url` in
 *   the browser instead.
 */
function isInternalNavigation(url, appUrl) {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.startsWith("file://") || url.startsWith("devtools://")) return true;
  if (typeof appUrl !== "string" || appUrl.length === 0) return false;

  const controlPanelUrl = appUrl.startsWith("http") ? appUrl : `file://${appUrl}`;
  return url.startsWith(controlPanelUrl);
}

module.exports = { isInternalNavigation };
