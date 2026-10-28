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
 *   threshold?: number, minTopicMs?: number, text?: (node: any) => string }} options
 * @returns {{ subjects: { label: string, conversationIds: number[] }[],
 *   edges: { from: number, to: number, weight: number, kind: string, topics: string[] }[] }}
 */
export function linkThreads(
  conversations,
  {
    vectorOf = null,
    checks = null,
    threshold = LINK_SIMILARITY,
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
            bag: fingerprint(node),
          };
        }),
    }));
  const clusters = [];
  const clusterOf = new Map();
  const newCluster = (topic) => {
    const cluster = {
      sum: null,
      norm: 0,
      members: [],
      conversationIds: [],
      seed: topic.bag,
      remoteName: null,
    };
    clusters.push(cluster);
    return cluster;
  };
  const join = (cluster, topic, conversationId) => {
    if (topic.vector) {
      if (!cluster.sum) cluster.sum = new Float64Array(topic.vector.length);
      if (cluster.sum.length === topic.vector.length) add(cluster, topic.vector);
    }
    cluster.members.push(topic);
    if (!cluster.conversationIds.includes(conversationId))
      cluster.conversationIds.push(conversationId);
    clusterOf.set(topicKey(conversationId, topic.label), cluster);
  };
  const merge = (into, from) => {
    if (into === from) return into;
    for (const member of from.members) {
      if (member.vector) {
        if (!into.sum) into.sum = new Float64Array(member.vector.length);
        if (into.sum.length === member.vector.length) add(into, member.vector);
      }
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
        if (!topic.vector) {
          if (check) join(newCluster(topic), topic, conversation.id);
          continue;
        }
        let bestScore = threshold;
        for (const cluster of clusters) {
          if (!open(cluster)) continue;
          if (!cluster.sum || cluster.sum.length !== topic.vector.length) continue;
          const score = closeness(cluster, topic.vector);
          if (score >= bestScore) {
            best = cluster;
            bestScore = score;
          }
        }
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
