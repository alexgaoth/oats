// What else is worth raising, derived from the conversation's own shape.
//
// This is the quietest feature in the product and it has to stay that way: it is
// a short list you can glance at when the room pauses, never a prompt, never a
// notification, never something that interrupts. It runs on data Oats already
// has — the live topic snapshot and the snapshots of past conversations — so it
// costs a few set intersections and makes no model call and no network request.
//
// Three kinds of suggestion, in the order they earn their place:
//
//   `unfinished` — a thread this conversation opened and walked away from. The
//     strongest signal there is, because the room itself raised it.
//   `shallow`    — a topic that got a sentence or two and never developed. Often
//     the most interesting thing nobody had time for.
//   `adjacent`   — a subject that, in past conversations, kept company with what
//     is being discussed now, and has not come up yet. This is the only kind
//     that draws on history rather than the live conversation.
//
// Kept as dependency-free ESM so it unit-tests under node:test like the rest of
// the conversation core.

const DEFAULT_LIMIT = 4;

// A topic is "shallow" when it held less than this fraction of the median topic's
// time. Relative rather than absolute, because a ten-minute chat and a two-hour
// one have very different ideas of brief.
const SHALLOW_RATIO = 0.35;

// Leading words only — see the note in lifetimeGraph.mjs. Topic word lists are
// frequency-ordered, so these are the words the topic is actually about.
const FINGERPRINT = 5;

function toBag(node) {
  const words = Array.isArray(node?.words) ? node.words : [];
  return new Set(words.filter((word) => typeof word === "string" && word).slice(0, FINGERPRINT));
}

// Fraction of the smaller bag that both share. Symmetric and forgiving, which is
// what cross-conversation matching needs — the same subject rarely comes back
// with the same vocabulary.
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * @param {object} input
 * @param {{nodes: any[], edges: any[]}} input.snapshot  the live conversation
 * @param {Array<{nodes: any[], edges: any[]}>} [input.history]  past conversations
 * @param {number} [input.limit]
 * @param {number} [input.matchThreshold]  overlap needed to call two topics the same
 */
function buildSuggestions({
  snapshot,
  history = [],
  limit = DEFAULT_LIMIT,
  matchThreshold = 0.3,
} = {}) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  if (!nodes.length) return [];

  const live = nodes.filter((node) => node.state === "live");
  const present = nodes.map((node) => ({ node, bag: toBag(node) }));
  const suggestions = [];

  // 1. Threads the room opened and left. Ordered by how recently they were
  //    dropped — the one you just walked away from is the easiest to pick up.
  const unfinished = nodes
    .filter((node) => node.state === "open" || node.state === "dropped")
    .sort((a, b) => b.lastAt - a.lastAt);
  for (const node of unfinished) {
    suggestions.push({
      kind: "unfinished",
      topicId: node.id,
      label: node.label,
      score: 3 + (node.state === "open" ? 0.5 : 0),
      at: node.lastAt,
    });
  }

  // 2. Topics that never got going. Measured against this conversation's own
  //    median so the notion of "brief" scales with the conversation.
  const durations = nodes.map((node) => node.durationMs || 0);
  const cutoff = median(durations) * SHALLOW_RATIO;
  if (cutoff > 0) {
    for (const node of nodes) {
      if (node.state === "live" || node.state === "resolved") continue;
      if ((node.durationMs || 0) > cutoff) continue;
      const existing = suggestions.find((item) => item.topicId === node.id);
      if (existing) {
        // Already listed as unfinished; being shallow too makes it a better bet.
        existing.score += 0.75;
        existing.kind = "shallow";
        continue;
      }
      suggestions.push({
        kind: "shallow",
        topicId: node.id,
        label: node.label,
        score: 2,
        at: node.lastAt,
      });
    }
  }

  // 3. Subjects that historically travel with whatever is being discussed now.
  //    Only computed against the live topic: suggesting neighbours of everything
  //    ever said would bury the two kinds above, which are far stronger signals.
  if (live.length && history.length) {
    const liveBags = live.map((node) => toBag(node));
    const candidates = new Map();
    for (const past of history) {
      const pastNodes = Array.isArray(past?.nodes) ? past.nodes : [];
      const pastBags = pastNodes.map((node) => ({ node, bag: toBag(node) }));
      const anchors = pastBags.filter(({ bag }) =>
        liveBags.some((liveBag) => overlap(liveBag, bag) >= matchThreshold)
      );
      if (!anchors.length) continue;
      for (const { node, bag } of pastBags) {
        if (anchors.some((anchor) => anchor.node.id === node.id)) continue;
        // Skip anything this conversation has already covered.
        if (present.some((item) => overlap(item.bag, bag) >= matchThreshold)) continue;
        // Cluster by word overlap, never by label: the same subject comes back
        // under a different name in every conversation, and keying on the label
        // would split one recurring theme into several weak suggestions.
        const existing = [...candidates.values()].find(
          (entry) => overlap(entry.bag, bag) >= matchThreshold
        );
        if (existing) {
          existing.count += 1;
          for (const word of bag) existing.bag.add(word);
        } else {
          candidates.set(node.label, { label: node.label, bag: new Set(bag), count: 1 });
        }
      }
    }
    for (const entry of candidates.values()) {
      suggestions.push({
        kind: "adjacent",
        topicId: null,
        label: entry.label,
        // Bounded so a subject that appears in twenty past conversations cannot
        // outrank a thread this room opened five minutes ago.
        score: 1 + Math.min(entry.count, 3) * 0.25,
        at: 0,
        seenIn: entry.count,
      });
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score || b.at - a.at || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit));
}

export { buildSuggestions, overlap };
