// Links between conversations by meaning: which conversations talked about the
// same thing, for the Global conversations board.
//
// The board used to decide it by words (`subjectThreads` in lifetimeGraph.mjs):
// two topics were one subject when their five leading words overlapped by 30%.
// Measured on the AMI meetings (scripts/link-eval.mjs, docs/link-eval.md), that
// linked a meeting about who gets which office to a meeting about a remote
// control because both said "meeting" and "room": 19 of 540 such pairs.
//
// Here each topic is read by its name as a sentence vector, embedded by the
// bundled all-MiniLM-L6-v2 on this computer (`embed-texts`). The name is the
// writing model's when it named the topic, else the phrase the tracker chose;
// either way nothing leaves the computer. A topic joins a subject when its
// vector is at least `LINK_SIMILARITY` alike the subject's mean. On AMI this
// links none of those 540 pairs, finds as many of the links the annotators
// draw, and names each subject with a name somebody can read.
//
// The shapes are those of `subjectThreads`, so the board draws either: subjects
// (a label and the conversations that carry it) and edges (each conversation on
// a subject joined to the one on it before).
//
// Pure and DOM-free: the vectors are passed in. Unit-tested under node:test.

/**
 * How alike (cosine) a topic's name must be to a subject's to join it. Chosen
 * on the AMI meetings, with the writing model's names and with the tracker's
 * own (docs/link-eval.md).
 */
export const LINK_SIMILARITY = 0.6;

/**
 * A topic shorter than this is not linked: half a minute is a passing mention,
 * and a conversation's greeting or its goodbye would otherwise link it to
 * every other.
 */
export const MIN_LINK_TOPIC_MS = 30_000;

/**
 * The text a topic is read by: its name, and when `words` is more than 0, that
 * many of its telling words that the name does not already hold ("Remote
 * control design" with "button" and "battery" reads "Remote control design
 * button battery"). The board reads the name alone; the benchmark measures
 * both.
 *
 * @param {{ label?: string, words?: string[] } | null | undefined} node
 * @param {{ words?: number, label?: string }} [options] `label` reads another name
 *   for the node (the benchmark reads the tracker's own with it).
 */
export function topicLinkText(node, { words = 0, label } = {}) {
  const name = String(label ?? node?.label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!(words > 0)) return name;
  const said = new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
  const extra = (Array.isArray(node?.words) ? node.words : [])
    .filter((word) => typeof word === "string" && word && !said.has(word.toLowerCase()))
    .slice(0, words);
  return [name, ...extra].filter(Boolean).join(" ");
}

/** Cosine of two unit vectors. */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index] * b[index];
  return total;
}

/** A topic that can carry a link: named, and held long enough. */
export function isLinkableTopic(node, minTopicMs = MIN_LINK_TOPIC_MS) {
  return Boolean(
    node && String(node.label ?? "").trim() && (Number(node.durationMs) || 0) >= minTopicMs
  );
}

/**
 * Every text the board needs a vector for: the linkable topics' texts, once.
 *
 * @param {Array<{ snapshot?: { nodes?: any[] } | null }>} conversations
 */
export function linkTexts(
  conversations,
  { minTopicMs = MIN_LINK_TOPIC_MS, text = (node) => topicLinkText(node) } = {}
) {
  const texts = new Set();
  for (const conversation of Array.isArray(conversations) ? conversations : []) {
    for (const node of conversation?.snapshot?.nodes ?? []) {
      if (isLinkableTopic(node, minTopicMs)) texts.add(text(node));
    }
  }
  return [...texts];
}

/**
 * The topics of each conversation that can carry a link, with their vectors,
 * in the order the conversations happened. A topic whose vector is not known
 * is left out.
 */
function linkable(conversations, { vectorOf, minTopicMs, text }) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter((item) => item && Array.isArray(item.snapshot?.nodes) && item.snapshot.nodes.length)
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (Number(a.item.createdAt) || 0) - (Number(b.item.createdAt) || 0) ||
        Number(a.item.id) - Number(b.item.id) ||
        a.index - b.index
    )
    .map(({ item }) => ({
      id: item.id,
      topics: item.snapshot.nodes
        .filter((node) => isLinkableTopic(node, minTopicMs))
        .map((node) => {
          const value = text(node);
          const vector = vectorOf(value);
          return { label: String(node.label).trim(), vector };
        })
        .filter((topic) => topic.vector && topic.vector.length),
    }));
}

/**
 * How alike two conversations are: their two most alike topics.
 *
 * @returns {{ score: number, a: string | null, b: string | null }}
 */
export function conversationMatch(topicsA, topicsB) {
  let best = { score: -1, a: null, b: null };
  for (const a of topicsA) {
    for (const b of topicsB) {
      const score = cosine(a.vector, b.vector);
      if (score > best.score) best = { score, a: a.label, b: b.label };
    }
  }
  return best;
}

/** A subject's mean direction, kept as a running sum. */
function closeness(subject, vector) {
  let dot = 0;
  for (let index = 0; index < vector.length; index += 1) dot += subject.sum[index] * vector[index];
  return subject.norm > 0 ? dot / subject.norm : 0;
}

function add(subject, vector) {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) {
    subject.sum[index] += vector[index];
    norm += subject.sum[index] * subject.sum[index];
  }
  subject.norm = Math.sqrt(norm);
}

/**
 * Subjects that came back, by meaning, and the threads through them.
 *
 * Topics are read in the order the conversations happened. A topic joins the
 * subject it is most alike, measured against the mean of the subject's topics,
 * when that is at least `threshold`; otherwise it starts a subject of its own.
 * Against the mean, and not against the nearest member, so a subject cannot
 * drift one near neighbour at a time into something else; and not against
 * its first topic only, which on AMI made the subjects jump about as the
 * threshold moved. A subject is named by the member most alike the others.
 *
 * @param {Array<{ id: number, createdAt: number, snapshot: { nodes: any[] } | null }>} conversations
 * @param {{ vectorOf: (text: string) => (Float32Array | number[] | null | undefined),
 *   threshold?: number, minTopicMs?: number, text?: (node: any) => string }} options
 * @returns {{ subjects: { label: string, conversationIds: number[] }[],
 *   edges: { from: number, to: number, weight: number, kind: string, topics: string[] }[] }}
 */
export function meaningThreads(
  conversations,
  {
    vectorOf,
    threshold = LINK_SIMILARITY,
    minTopicMs = MIN_LINK_TOPIC_MS,
    text = (node) => topicLinkText(node),
  }
) {
  const list = linkable(conversations, { vectorOf, minTopicMs, text });
  const clusters = [];
  for (const conversation of list) {
    for (const topic of conversation.topics) {
      let best = null;
      let bestScore = threshold;
      for (const cluster of clusters) {
        if (cluster.sum.length !== topic.vector.length) continue;
        const score = closeness(cluster, topic.vector);
        if (score >= bestScore) {
          best = cluster;
          bestScore = score;
        }
      }
      if (!best) {
        best = {
          sum: new Float64Array(topic.vector.length),
          norm: 0,
          members: [],
          conversationIds: [],
        };
        clusters.push(best);
      }
      add(best, topic.vector);
      best.members.push(topic);
      if (!best.conversationIds.includes(conversation.id))
        best.conversationIds.push(conversation.id);
    }
  }
  const subjects = clusters
    .filter((cluster) => cluster.conversationIds.length > 1)
    .map((cluster) => ({
      label: subjectName(cluster.members),
      conversationIds: cluster.conversationIds,
    }));
  const edges = new Map();
  for (const subject of subjects) {
    const ids = subject.conversationIds;
    for (let index = 1; index < ids.length; index += 1) {
      const key = `${ids[index - 1]}-${ids[index]}`;
      const edge = edges.get(key);
      if (edge) {
        if (!edge.topics.includes(subject.label)) edge.topics.push(subject.label);
        edge.weight = edge.topics.length;
      } else {
        edges.set(key, {
          from: ids[index - 1],
          to: ids[index],
          weight: 1,
          kind: "shared",
          topics: [subject.label],
        });
      }
    }
  }
  subjects.sort(
    (a, b) => b.conversationIds.length - a.conversationIds.length || a.label.localeCompare(b.label)
  );
  return { subjects, edges: [...edges.values()] };
}

/** The member name most alike the others: what the subject is about, not one detail of it. */
function subjectName(members) {
  let best = members[0];
  let bestScore = -Infinity;
  for (const member of members) {
    let total = 0;
    for (const other of members) if (other !== member) total += cosine(member.vector, other.vector);
    if (total > bestScore + 1e-9) {
      best = member;
      bestScore = total;
    }
  }
  return best.label;
}

/**
 * Every pair of conversations, scored by their two most alike topics, with
 * whether that reaches `threshold` and the name of the earlier one's topic.
 * The board draws subjects, not pairs; this is for the benchmark and for
 * choosing which conversations a cloud model is asked about.
 */
export function meaningPairs(
  conversations,
  {
    vectorOf,
    threshold = LINK_SIMILARITY,
    minTopicMs = MIN_LINK_TOPIC_MS,
    text = (node) => topicLinkText(node),
  }
) {
  const list = linkable(conversations, { vectorOf, minTopicMs, text });
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const match = conversationMatch(list[i].topics, list[j].topics);
      pairs.push({
        from: list[i].id,
        to: list[j].id,
        score: match.score,
        linked: match.score >= threshold,
        label: match.a,
      });
    }
  }
  return pairs;
}
