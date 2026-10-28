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
 * How alike (cosine) a topic's stored vector must be to a subject's, when
 * both have one: the vector of what was said on the topic, not of its name.
 * Chosen on AMI (docs/link-eval.md): at 0.78 it links 0.86 precise and finds
 * 0.76 of the scenario links, against 0.80 and 0.81 by names.
 */
export const CONTENT_SIMILARITY = 0.78;

/**
 * A topic's vector as the record keeps it (`node.vector`): one signed byte a
 * dimension, in base64. 384 dimensions are 512 characters; the cosines move
 * by less than 0.01.
 *
 * @param {ArrayLike<number> | null | undefined} values a unit vector
 * @returns {string | null}
 */
export function encodeTopicVector(values) {
  if (!values || !values.length) return null;
  const bytes = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = Math.max(-127, Math.min(127, Math.round(Number(values[index]) * 127)));
    bytes[index] = value < 0 ? value + 256 : value;
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * A stored topic vector as a unit vector, or null when there is none or it
 * cannot be read.
 *
 * @param {unknown} text
 * @returns {Float32Array | null}
 */
export function decodeTopicVector(text) {
  if (typeof text !== "string" || !text) return null;
  let binary;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const values = new Float32Array(binary.length);
  let norm = 0;
  for (let index = 0; index < binary.length; index += 1) {
    const byte = binary.charCodeAt(index);
    values[index] = (byte > 127 ? byte - 256 : byte) / 127;
    norm += values[index] * values[index];
  }
  norm = Math.sqrt(norm);
  if (!(norm > 0)) return null;
  for (let index = 0; index < values.length; index += 1) values[index] /= norm;
  return values;
}

/**
 * The vector of what was said on a topic: the mean of its turns' vectors,
 * each weighted (by its words), made unit length. Null with no weight.
 *
 * @param {Array<{ vector: ArrayLike<number> | null | undefined, weight: number }>} pieces
 * @returns {Float32Array | null}
 */
export function topicContentVector(pieces) {
  let sum = null;
  for (const { vector, weight } of Array.isArray(pieces) ? pieces : []) {
    if (!vector || !vector.length || !(weight > 0)) continue;
    if (!sum) sum = new Float64Array(vector.length);
    if (vector.length !== sum.length) continue;
    for (let index = 0; index < sum.length; index += 1) sum[index] += vector[index] * weight;
  }
  if (!sum) return null;
  let norm = 0;
  for (const value of sum) norm += value * value;
  norm = Math.sqrt(norm);
  return norm > 0 ? Float32Array.from(sum, (value) => value / norm) : null;
}

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
 * in the order the conversations happened: the vector of the name, and the
 * stored vector of what was said when the record has one. A topic with
 * neither is left out.
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
          return {
            label: String(node.label).trim(),
            vector: vector && vector.length ? vector : null,
            content: decodeTopicVector(node.vector),
          };
        })
        .filter((topic) => topic.vector || topic.content),
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
    if (!a.vector) continue;
    for (const b of topicsB) {
      if (!b.vector) continue;
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

/** How many of a topic's leading words the word rule compares (as `lifetimeGraph.mjs`). */
const FINGERPRINT = 5;

/** The word rule's threshold: the share of the smaller fingerprint both hold. */
const WORD_OVERLAP = 0.3;

function fingerprint(node) {
  const words = Array.isArray(node?.words) ? node.words : [];
  return new Set(words.filter((word) => typeof word === "string" && word).slice(0, FINGERPRINT));
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

const topicKey = (conversationId, label) =>
  `${conversationId}\u0000${String(label ?? "")
    .trim()
    .toLowerCase()}`;

/** A conversation's own topic that a checked link names, however exactly it was quoted. */
function namedTopic(topics, name) {
  const wanted = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!topics.length) return null;
  return (
    topics.find((topic) => topic.label.toLowerCase() === wanted) ??
    (wanted &&
      topics.find(
        (topic) =>
          topic.label.toLowerCase().includes(wanted) || wanted.includes(topic.label.toLowerCase())
      )) ??
    topics[0]
  );
}

/**
 * Subjects that came back, and the threads through them.
 *
 * Topics are read in the order the conversations happened. With vectors
 * (`vectorOf`), a topic joins the subject it is most alike, measured against
 * the mean of the subject's topics, when that is at least `threshold`;
 * otherwise it starts a subject of its own. Against the mean, and not against
 * the nearest member, so a subject cannot drift one near neighbour at a time
 * into something else; and not against its first topic only, which on AMI made
 * the subjects jump about as the threshold moved. A subject is named by the
 * member most alike the others. Without vectors, the word rule decides
 * (`subjectThreads`): five leading words, 30% of the smaller set in common.
 *
 * With vectors, what was said decides where both topics have it: a topic
 * recorded since the record kept a vector per topic (`node.vector`) meets the
 * subject's topics that have one by the mean of their stored vectors, at
 * `contentThreshold`, and the subject's other topics (older conversations) by
 * their names, at `threshold`. A topic with no stored vector meets every topic
 * by name, as before.
 *
 * A conversation a cloud model checked (`checks`, `remoteLinks.mjs`) is
 * linked to the earlier conversations the check was asked about (its
 * `candidates`) by the check alone: its topic joins the subject of the
 * earlier topic it was linked to, the subject takes the model's name, and a
 * subject holding a candidate the check did not link is closed to it. To the
 * conversations the check was not asked about (the provider had not read
 * them), it links on this computer like any other.
 *
 * @param {Array<{ id: number, createdAt: number, snapshot: { nodes: any[] } | null }>} conversations
 * @param {{ vectorOf?: ((text: string) => (Float32Array | number[] | null | undefined)) | null,
 *   checks?: Map<unknown, { links: Array<{ id: unknown, subject: string, topic?: string, earlierTopic?: string }> }> | null,
 *   threshold?: number, contentThreshold?: number, minTopicMs?: number,
 *   text?: (node: any) => string }} options
 * @returns {{ subjects: { label: string, conversationIds: number[] }[],
 *   edges: { from: number, to: number, weight: number, kind: string, topics: string[] }[] }}
 */
export function linkThreads(
  conversations,
  {
    vectorOf = null,
    checks = null,
    threshold = LINK_SIMILARITY,
    contentThreshold = CONTENT_SIMILARITY,
    minTopicMs = MIN_LINK_TOPIC_MS,
    text = (node) => topicLinkText(node),
  } = {}
) {
  const meaning = typeof vectorOf === "function";
  const list = (Array.isArray(conversations) ? conversations : [])
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
          const vector = meaning ? vectorOf(text(node)) : null;
          return {
            label: String(node.label).trim(),
            vector: vector && vector.length ? vector : null,
            content: meaning ? decodeTopicVector(node.vector) : null,
            bag: fingerprint(node),
          };
        }),
    }));
  const clusters = [];
  const clusterOf = new Map();
  // A subject keeps three means: of its topics' names, of their stored
  // vectors, and of the names of its topics with no stored vector.
  const newCluster = (topic) => {
    const cluster = {
      name: null,
      content: null,
      unstored: null,
      members: [],
      conversationIds: [],
      seed: topic.bag,
      remoteName: null,
    };
    clusters.push(cluster);
    return cluster;
  };
  const include = (cluster, key, vector) => {
    if (!vector) return;
    if (!cluster[key]) cluster[key] = { sum: new Float64Array(vector.length), norm: 0 };
    if (cluster[key].sum.length === vector.length) add(cluster[key], vector);
  };
  const absorb = (cluster, topic) => {
    include(cluster, "name", topic.vector);
    if (topic.content) include(cluster, "content", topic.content);
    else include(cluster, "unstored", topic.vector);
  };
  // The open subject a topic is most alike by one of those means, at `floor`.
  const nearest = (key, vector, floor, open) => {
    let best = null;
    let bestScore = floor;
    for (const cluster of clusters) {
      const side = cluster[key];
      if (!vector || !side || !(side.norm > 0) || side.sum.length !== vector.length) continue;
      if (!open(cluster)) continue;
      const score = closeness(side, vector);
      if (score >= bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    return best;
  };
  const join = (cluster, topic, conversationId) => {
    absorb(cluster, topic);
    cluster.members.push(topic);
    if (!cluster.conversationIds.includes(conversationId))
      cluster.conversationIds.push(conversationId);
    clusterOf.set(topicKey(conversationId, topic.label), cluster);
  };
  const merge = (into, from) => {
    if (into === from) return into;
    for (const member of from.members) {
      absorb(into, member);
      into.members.push(member);
    }
    for (const id of from.conversationIds)
      if (!into.conversationIds.includes(id)) into.conversationIds.push(id);
    for (const [key, cluster] of clusterOf) if (cluster === from) clusterOf.set(key, into);
    into.remoteName = into.remoteName ?? from.remoteName;
    clusters.splice(clusters.indexOf(from), 1);
    return into;
  };
  const present = new Set(list.map((conversation) => conversation.id));
  for (const conversation of list) {
    const check = checks?.get?.(conversation.id);
    // The earlier conversations its check was asked about and did not link,
    // and its topics the check already placed.
    const refused = new Set();
    const joined = new Set();
    if (check) {
      const linked = new Set(
        (Array.isArray(check.links) ? check.links : []).map((link) => link.id)
      );
      for (const id of Array.isArray(check.candidates) ? check.candidates : []) {
        if (!linked.has(id)) refused.add(id);
      }
      for (const link of Array.isArray(check.links) ? check.links : []) {
        if (!present.has(link.id) || link.id === conversation.id) continue;
        const earlier = list.find((item) => item.id === link.id);
        const earlierTopic = earlier && namedTopic(earlier.topics, link.earlierTopic);
        const target = earlierTopic && clusterOf.get(topicKey(link.id, earlierTopic.label));
        const own = namedTopic(conversation.topics, link.topic);
        if (!target || !own) continue;
        const already = clusterOf.get(topicKey(conversation.id, own.label));
        const cluster = already ? merge(target, already) : target;
        if (!already) join(cluster, own, conversation.id);
        cluster.remoteName = String(link.subject ?? "").trim() || cluster.remoteName;
        joined.add(own);
      }
    }
    const open = (cluster) =>
      !refused.size || !cluster.conversationIds.some((id) => refused.has(id));
    for (const topic of conversation.topics) {
      if (joined.has(topic)) continue;
      let best = null;
      if (meaning) {
        if (!topic.vector && !topic.content) {
          if (check) join(newCluster(topic), topic, conversation.id);
          continue;
        }
        // By what was said where both have it, by name where either has not.
        best = topic.content
          ? (nearest("content", topic.content, contentThreshold, open) ??
            nearest("unstored", topic.vector, threshold, open))
          : nearest("name", topic.vector, threshold, open);
      } else if (topic.bag.size) {
        best =
          clusters.find(
            (cluster) => open(cluster) && overlap(cluster.seed, topic.bag) >= WORD_OVERLAP
          ) ?? null;
      } else {
        if (check) join(newCluster(topic), topic, conversation.id);
        continue;
      }
      join(best ?? newCluster(topic), topic, conversation.id);
    }
  }
  const subjects = clusters
    .filter((cluster) => cluster.conversationIds.length > 1)
    .map((cluster) => ({
      label:
        cluster.remoteName || (meaning ? subjectName(cluster.members) : cluster.members[0].label),
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

/**
 * Subjects and threads by meaning alone: `linkThreads` with vectors and no
 * checks, as the benchmark measures it.
 */
export function meaningThreads(conversations, options) {
  return linkThreads(conversations, { ...options, checks: null });
}

/** The member name most alike the others: what the subject is about, not one detail of it. */
function subjectName(members) {
  let best = members[0];
  let bestScore = -Infinity;
  for (const member of members) {
    if (!member.vector) continue;
    let total = 0;
    for (const other of members) {
      if (other !== member && other.vector) total += cosine(member.vector, other.vector);
    }
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
