// The lifetime graph: one node per conversation, edges where two conversations
// talked about the same thing.
//
// The topic graph answers "how did this conversation move?". This answers the
// larger question — "what do I keep coming back to?" — which is only visible
// across months of conversations and is invisible inside any one of them.
//
// It is built entirely from topic snapshots already stored on each note, so it
// costs one pass over the notes and no model call. Matching is the same forgiving
// word-bag overlap used elsewhere: the same subject rarely returns with the same
// vocabulary, so exact label matching would find almost nothing.
//
// Kept as dependency-free ESM so it unit-tests under node:test like the rest of
// the conversation core.

// How many of a topic's leading words identify it. Topic word lists are ordered
// by how often each word was used, so the first few are what the topic is about
// and the tail is incidental vocabulary. Comparing whole bags dilutes the signal:
// two conversations that both centre on enterprise pricing share those two words
// and then diverge into board decks and demo slippage, and a full-bag comparison
// scores that as unrelated.
const FINGERPRINT = 5;

function toBag(node) {
  const words = Array.isArray(node?.words) ? node.words : [];
  return new Set(words.filter((word) => typeof word === "string" && word).slice(0, FINGERPRINT));
}

// Fraction of the smaller fingerprint that both share. The threshold is
// deliberately lower than the within-conversation one: two conversations months
// apart discuss the same subject with barely overlapping vocabulary, so demanding
// a tight match here finds nothing at all and the map stays empty.
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * @param {Array<{id:number,title:string,createdAt:number,snapshot:{nodes:any[]}}>} conversations
 * @param {object} [options]
 * @param {number} [options.matchThreshold]  overlap needed to call two topics the same
 * @returns {{nodes:any[], edges:any[]}}
 */
function buildLifetimeGraph(conversations, { matchThreshold = 0.3 } = {}) {
  const list = (Array.isArray(conversations) ? conversations : [])
    .filter((item) => item && Array.isArray(item.snapshot?.nodes) && item.snapshot.nodes.length)
    .map((item) => ({
      id: item.id,
      title: item.title || "Untitled conversation",
      createdAt: Number(item.createdAt) || 0,
      topics: item.snapshot.nodes.map((node) => ({
        label: node.label,
        bag: toBag(node),
        durationMs: Number(node.durationMs) || 0,
      })),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);

  const nodes = list.map((conversation) => ({
    id: conversation.id,
    label: conversation.title,
    createdAt: conversation.createdAt,
    topicCount: conversation.topics.length,
    // Node size follows how much was actually discussed, matching the topic
    // graph's convention so the two views read the same way.
    durationMs: conversation.topics.reduce((total, topic) => total + topic.durationMs, 0),
    topics: conversation.topics.map((topic) => topic.label),
    state: "resolved",
    words: [...new Set(conversation.topics.flatMap((topic) => [...topic.bag]))].slice(0, 12),
  }));

  const edges = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const shared = [];
      for (const topicA of list[i].topics) {
        const match = list[j].topics.find(
          (topicB) => overlap(topicA.bag, topicB.bag) >= matchThreshold
        );
        if (!match) continue;
        // Name the link by the words the two topics actually have in common, not
        // by either side's label. A conversation may file "enterprise pricing"
        // under a topic it called "churn cohort", and reporting that label would
        // tell the reader the wrong thing about why the two are connected.
        const common = [...topicA.bag].filter((word) => match.bag.has(word)).slice(0, 2);
        const label = common.length ? common.join(" ") : topicA.label;
        if (!shared.includes(label)) shared.push(label);
      }
      if (!shared.length) continue;
      // Always earlier → later, so the graph reads chronologically the way the
      // topic graph reads in speaking order.
      edges.push({
        from: list[i].id,
        to: list[j].id,
        weight: shared.length,
        kind: "shared",
        topics: shared,
      });
    }
  }

  // A subject that keeps returning is the whole point of this view, so it is
  // surfaced on the node rather than left for the reader to count edges.
  for (const node of nodes) {
    node.returns = edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
    // A conversation connected to nothing else is a one-off; one that keeps
    // reconnecting is a running thread of your work.
    node.state = node.returns === 0 ? "dropped" : node.returns >= 3 ? "live" : "open";
  }

  return { nodes, edges };
}

// The subjects that recur across the most conversations. Used to caption the
// lifetime view, which is otherwise a shape without a summary.
function recurringTopics(conversations, { matchThreshold = 0.3, limit = 5 } = {}) {
  const list = (Array.isArray(conversations) ? conversations : []).filter((item) =>
    Array.isArray(item?.snapshot?.nodes)
  );
  const clusters = [];
  for (const conversation of list) {
    for (const node of conversation.snapshot.nodes) {
      const bag = toBag(node);
      if (!bag.size) continue;
      const cluster = clusters.find((item) => overlap(item.bag, bag) >= matchThreshold);
      if (cluster) {
        // The cluster keeps its first member's fingerprint rather than absorbing
        // every variant: a bag that grows with each match drifts until unrelated
        // subjects start joining it.
        cluster.conversations.add(conversation.id);
      } else {
        clusters.push({
          label: node.label,
          bag: new Set(bag),
          conversations: new Set([conversation.id]),
        });
      }
    }
  }
  return clusters
    .map((cluster) => ({ label: cluster.label, conversations: cluster.conversations.size }))
    .filter((cluster) => cluster.conversations > 1)
    .sort((a, b) => b.conversations - a.conversations || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export { buildLifetimeGraph, recurringTopics };
