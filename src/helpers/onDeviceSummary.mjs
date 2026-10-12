// What the sidebar's footer says, decided from the processing settings and from
// what the main process measured (onDeviceStatus.js). Pure, so every case is
// pinned by test/helpers/onDeviceSummary.test.js.
//
// The footer's first line is a claim, so "On this Mac" is said only when every
// part that can run does run on this machine: a conversation's speech,
// dictation's speech while dictation is on, and the writing model (summaries
// take the cleanup configuration). Any part that does not is named for where it
// goes: the provider, or the host of a server the user set up. The model line
// is what the running speech server reported, never what was asked for, and
// the count is shown only once the main process has sent one.

/**
 * Whether a host is this machine. The same rule as `isLoopbackHost` in
 * networkLedger.js, which counts the requests; networkLedger.test.js holds the
 * two to one table of hosts.
 *
 * @param {string} host
 */
export function isLoopbackHost(host) {
  let text = String(host ?? "").trim();
  if (!text) return false;
  if (text.includes(":") && !text.startsWith("[")) text = `[${text}]`;
  let name;
  try {
    name = new URL(`http://${text}/`).hostname.replace(/\.$/, "");
  } catch {
    return false;
  }
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(name)) return true;
  if (name === "[::1]" || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(name)) return true;
  return name === "0.0.0.0" || name === "[::]";
}

/** A URL's host name without its port, or null when it is not a URL. */
export function hostOf(url) {
  try {
    return new URL(String(url ?? "").trim()).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Where a server at `url` is: here when it is a loopback address, otherwise its
 * host. `name: null` is a server the footer cannot name (no URL yet).
 */
function serverAt(url) {
  const host = hostOf(url);
  if (!host) return { local: false, name: null };
  return isLoopbackHost(host) ? { local: true } : { local: false, name: host };
}

/**
 * Where one part runs, from its inference settings.
 *
 * @param {{ mode: string, provider?: string, providerName?: string,
 *   baseUrl?: string, remoteUrl?: string }} scope `mode` is "local",
 *   "providers" or "self-hosted"; a "custom" provider is named by its URL.
 * @returns {{ local: true } | { local: false, name: string | null }}
 */
export function destinationOf({ mode, provider, providerName, baseUrl, remoteUrl }) {
  if (mode === "local") return { local: true };
  if (mode === "self-hosted") return serverAt(remoteUrl);
  if (provider === "custom") return serverAt(baseUrl);
  return { local: false, name: providerName || provider || null };
}

/** Names in first-seen order, each once; `null` (an unnamed server) included. */
function namesOf(destinations) {
  const names = [];
  for (const destination of destinations) {
    if (!destination || destination.local) continue;
    const name = destination.name ?? null;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

const sameNames = (a, b) =>
  a.length > 0 && a.length === b.length && a.every((name) => b.includes(name));

/**
 * @param {object} input
 * @param {string} input.platform `process.platform`
 * @param {{ local: boolean, name?: string | null, engine?: string }} input.conversation
 *   a conversation's speech; `engine` is the local engine ("whisper" or "nvidia")
 * @param {{ local: boolean, name?: string | null } | null} input.dictation null while
 *   dictation is off: nothing it would send is sent
 * @param {{ local: boolean, name?: string | null }} input.writing
 * @param {{ model: string, backend: string | null } | null} input.server what the
 *   running whisper-server reported
 * @param {number | null | undefined} input.requests counted by the main process
 * @returns {{
 *   place: { kind: "here", device: "mac" | "computer" }
 *     | { kind: "both", names: (string | null)[] }
 *     | { kind: "split", speech: (string | null)[], writing: (string | null)[] },
 *   model: { name: string, backend: string | null } | null,
 *   requests: number | null,
 * }}
 */
export function describeOnDevice({ platform, conversation, dictation, writing, server, requests }) {
  const speech = namesOf([conversation, dictation]);
  const written = namesOf([writing]);

  let place;
  if (!speech.length && !written.length) {
    place = { kind: "here", device: platform === "darwin" ? "mac" : "computer" };
  } else if (sameNames(speech, written)) {
    place = { kind: "both", names: speech };
  } else {
    place = { kind: "split", speech, writing: written };
  }

  // Whisper's own report, and only for the speech a conversation uses. Parakeet
  // reports no backend, so it gets no line rather than a guessed one.
  const model =
    conversation?.local && conversation.engine === "whisper" && server?.model
      ? { name: server.model, backend: server.backend || null }
      : null;

  return {
    place,
    model,
    requests: Number.isInteger(requests) && requests >= 0 ? requests : null,
  };
}
