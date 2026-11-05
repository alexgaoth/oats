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
// either way nothing leaves the computer. Two topics link when they reach
// `LINK_SIMILARITY` and each is among the other's `LINK_NEIGHBOURS` nearest. On
// AMI that draws none of 62,304 pairs of unrelated meetings in histories of a
// hundred, and it names each subject with a name somebody can read.
//
// The shapes are those of `subjectThreads`, so the board draws either: subjects
// (a label and the conversations that carry it) and edges (here, the pairs that
// link).
//
// Pure and DOM-free: the vectors are passed in. Unit-tested under node:test.

/**
 * How alike (cosine) two topics' names must be to link. Chosen on the AMI
 * meetings, with the writing model's names and with the tracker's own
 * (docs/link-eval.md).
 */
export const LINK_SIMILARITY = 0.6;

/**
 * How alike (cosine) two subjects a cloud model named must be to be one
 * subject. Chosen on AMI's tuning meetings (docs/link-eval.md, round 2).
 */
export const CHECK_SUBJECT_SIMILARITY = 0.8;

/**
 * A topic shorter than this is not linked: half a minute is a passing mention,
 * and a conversation's greeting or its goodbye would otherwise link it to
 * every other.
 */
export const MIN_LINK_TOPIC_MS = 30_000;

/**
 * How alike (cosine) two topics' stored vectors must be to link, when both
 * have one: the vector of what was said on the topic, not of its name. Chosen
 * on AMI, a topic against a subject's mean then (docs/link-eval.md): at 0.78 it
 * links 0.86 precise and finds 0.76 of the scenario links, against 0.80 and 0.81
 * by names.
 */
export const CONTENT_SIMILARITY = 0.78;

/**
 * How many topics of other conversations a topic may link to on this computer.
 * Two topics link only when each is among the other's nearest this many and
 * they reach the bar. On a history about one thing nearly every topic clears an
 * absolute bar, so the bar alone links everything (docs/link-eval.md, round 2);
 * this keeps the links a person could stand behind, and the board's links grow
 * with the history and not with its square.
 */
export const LINK_NEIGHBOURS = 3;

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
 * Every text the board needs a vector for: the linkable topics' texts and the
 * subjects a check named, once.
 *
 * @param {Array<{ snapshot?: { nodes?: any[] } | null,
 *   linkCheck?: { links?: Array<{ subject?: string }> } | null }>} conversations
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
    for (const link of conversation?.linkCheck?.links ?? []) {
      const subject = String(link?.subject ?? "").trim();
      if (subject) texts.add(subject);
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
 * The pairs of topics that link on this computer: each is among the other's
 * `neighbours` nearest in other conversations, and they reach the bar. By what
 * was said where both have it, by name where either has not; those two scales
 * differ, so a score is its margin over its own bar.
 *
 * @template {{ topic: any, conversation: { id: unknown } }} T
 * @param {T[]} entries In the order they happened.
 * @param {{ blocked: (earlier: T, later: T) => boolean, threshold: number,
 *   contentThreshold: number, neighbours: number }} options
 * @returns {Array<{ earlier: T, later: T }>}
 */
function mutualPairs(entries, { blocked, threshold, contentThreshold, neighbours }) {
  const margin = (a, b) => {
    if (a.content && b.content && a.content.length === b.content.length) {
      return cosine(a.content, b.content) - contentThreshold;
    }
    return a.vector && b.vector ? cosine(a.vector, b.vector) - threshold : -1;
  };
  const nearest = entries.map(() => []);
  // One name said many times ties, and the nearest in time win: a name's newest
  // conversation must not lose its links to the first few.
  const offer = (from, index, score) => {
    const list = nearest[from];
    if (list.length === neighbours && score < list[neighbours - 1].score) return;
    list.push({ index, score });
    list.sort((x, y) => y.score - x.score || Math.abs(x.index - from) - Math.abs(y.index - from));
    if (list.length > neighbours) list.pop();
  };
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (entries[i].conversation === entries[j].conversation) continue;
      // Under its bar a pair cannot link, nor take a place from one that can.
      const score = margin(entries[i].topic, entries[j].topic);
      if (score < 0 || blocked(entries[i], entries[j])) continue;
      offer(i, j, score);
      offer(j, i, score);
    }
  }
  const pairs = [];
  nearest.forEach((list, i) => {
    for (const { index: j } of list) {
      if (i < j && nearest[j].some((other) => other.index === i)) pairs.push([i, j]);
    }
  });
  return pairs
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([i, j]) => ({ earlier: entries[i], later: entries[j] }));
}

/**
 * Subjects that came back, and the threads through them.
 *
 * With vectors (`vectorOf`), two topics link only when each is among the
 * other's `neighbours` nearest in other conversations and they reach the bar:
 * `contentThreshold` by what was said where both have it (`node.vector`), and
 * `threshold` by name where either has not. A subject is a topic and the later
 * topics that link to it, and its edges start at that topic. Links never chain:
 * A linked to B and B to C is two subjects, because chaining them gave back most
 * of the false links this rule removes (docs/link-eval.md, round 2). So a subject
 * holds at most `neighbours` + 1 conversations, unless they share one name:
 * subjects with one name are one, as the reader sees them. A subject whose topics
 * all sit on a bigger one is that one. A subject is named by the member most
 * alike the others. Every pair of topics is read, on each rebuild.
 *
 * Without vectors, the word rule decides (`subjectThreads`): five leading
 * words, 30% of the smaller set in common.
 *
 * A conversation a cloud model checked (`checks`, `remoteLinks.mjs`) is
 * linked by the check alone to every earlier conversation that provider has
 * read: the ones it was asked about (`candidates`), and the others with the
 * same `summaryRoute`, which it could have been asked about and were less
 * alike. A link joins two conversations on the subject the model named, and
 * subjects a check named are one only when their names are alike
 * (`subjectThreshold`). So one topic linked twice sits on two subjects, and the
 * two stay two: joining subjects through a shared topic chained 132 of 139 AMI
 * meetings into one subject, and a false-link rate of 0.25 pair by pair became
 * 0.91 on the board (docs/link-eval.md, round 2). A subject that holds a
 * conversation the check did not link is closed to it. To the conversations
 * that provider has not read, it links on this computer like any other.
 *
 * @param {Array<{ id: number, createdAt: number, snapshot: { nodes: any[] } | null,
 *   summaryRoute?: string | null }>} conversations
 * @param {{ vectorOf?: ((text: string) => (Float32Array | number[] | null | undefined)) | null,
 *   checks?: Map<unknown, { links: Array<{ id: unknown, subject: string, topic?: string, earlierTopic?: string }> }> | null,
 *   threshold?: number, contentThreshold?: number, subjectThreshold?: number,
 *   neighbours?: number, minTopicMs?: number, text?: (node: any) => string }} options
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
    subjectThreshold = CHECK_SUBJECT_SIMILARITY,
    neighbours = LINK_NEIGHBOURS,
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
      route: item.summaryRoute ?? null,
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
  const position = new Map(list.map((conversation, index) => [conversation.id, index]));
  const clusters = [];
  const clusterOf = new Map();
  const newCluster = (topic) => {
    const cluster = {
      members: [],
      conversationIds: [],
      seed: topic.bag,
      // What a check called it: each name once, and the mean of their vectors.
      named: [],
      subject: null,
      // The conversation of a subject drawn on this computer: its edges start here.
      hub: null,
    };
    clusters.push(cluster);
    return cluster;
  };
  const include = (cluster, key, vector) => {
    if (!vector) return;
    if (!cluster[key]) cluster[key] = { sum: new Float64Array(vector.length), norm: 0 };
    if (cluster[key].sum.length === vector.length) add(cluster[key], vector);
  };
  const enter = (cluster, topic, conversationId) => {
    cluster.members.push(topic);
    if (!cluster.conversationIds.includes(conversationId))
      cluster.conversationIds.push(conversationId);
  };
  const join = (cluster, topic, conversationId) => {
    enter(cluster, topic, conversationId);
    clusterOf.set(topicKey(conversationId, topic.label), cluster);
  };
  // The subject a check called `name`: the one with that name, else the one
  // whose names are most alike, else a new one.
  const subjectCalled = (name, topic) => {
    const wanted = name.toLowerCase();
    const found = meaning ? vectorOf(name) : null;
    const vector = found && found.length ? found : null;
    let best = clusters.find((cluster) =>
      cluster.named.some((other) => other.label.toLowerCase() === wanted)
    );
    if (!best && vector) {
      let bestScore = subjectThreshold;
      for (const cluster of clusters) {
        const side = cluster.subject;
        if (!side || !(side.norm > 0) || side.sum.length !== vector.length) continue;
        const score = closeness(side, vector);
        if (score >= bestScore) {
          best = cluster;
          bestScore = score;
        }
      }
    }
    best = best ?? newCluster(topic);
    if (!best.named.some((other) => other.label.toLowerCase() === wanted)) {
      best.named.push({ label: name, vector });
    }
    include(best, "subject", vector);
    return best;
  };
  // A topic goes to a subject a check named. A topic alone where it was moves,
  // so a later conversation meets one subject; a subject it shares stays whole.
  const place = (cluster, topic, conversationId) => {
    if (cluster.members.includes(topic)) return;
    const home = clusterOf.get(topicKey(conversationId, topic.label));
    join(cluster, topic, conversationId);
    if (home && home !== cluster && home.members.length === 1) {
      clusters.splice(clusters.indexOf(home), 1);
    }
  };
  const present = new Set(list.map((conversation) => conversation.id));
  const refusals = new Map();
  const placed = new Set();
  for (const conversation of list) {
    const check = checks?.get?.(conversation.id);
    // The earlier conversations its check was asked about and did not link.
    const refused = new Set();
    if (check) {
      const linked = new Set(
        (Array.isArray(check.links) ? check.links : []).map((link) => link.id)
      );
      for (const id of Array.isArray(check.candidates) ? check.candidates : []) {
        if (!linked.has(id)) refused.add(id);
      }
      // What this provider has read and did not link: it asked about the most
      // alike of these, so the others are further off than what it declined.
      if (conversation.route) {
        for (const other of list) {
          if (other === conversation) break;
          if (other.route === conversation.route && !linked.has(other.id)) refused.add(other.id);
        }
      }
      for (const link of Array.isArray(check.links) ? check.links : []) {
        if (!present.has(link.id) || link.id === conversation.id) continue;
        const earlier = list.find((item) => item.id === link.id);
        const earlierTopic = earlier && namedTopic(earlier.topics, link.earlierTopic);
        const own = namedTopic(conversation.topics, link.topic);
        const name = String(link.subject ?? "").trim();
        if (!earlierTopic || !own || !name) continue;
        const cluster = subjectCalled(name, own);
        place(cluster, earlierTopic, earlier.id);
        place(cluster, own, conversation.id);
        placed.add(own);
      }
    }
    refusals.set(conversation.id, refused);
    // With vectors, every topic must be known first: see below.
    if (meaning) continue;
    const open = (cluster) =>
      !refused.size || !cluster.conversationIds.some((id) => refused.has(id));
    for (const topic of conversation.topics) {
      if (placed.has(topic)) continue;
      if (!topic.bag.size) {
        if (check) join(newCluster(topic), topic, conversation.id);
        continue;
      }
      const best =
        clusters.find(
          (cluster) => open(cluster) && overlap(cluster.seed, topic.bag) >= WORD_OVERLAP
        ) ?? null;
      join(best ?? newCluster(topic), topic, conversation.id);
    }
  }
  if (meaning) {
    const entries = list.flatMap((conversation) =>
      conversation.topics
        .filter((topic) => topic.vector || topic.content)
        .map((topic) => ({ topic, conversation }))
    );
    const pairs = mutualPairs(entries, {
      blocked: (earlier, later) => refusals.get(later.conversation.id).has(earlier.conversation.id),
      threshold,
      contentThreshold,
      neighbours,
    });
    // A subject drawn here is a star: an earlier topic and those that link to it.
    const stars = new Map();
    const starsHolding = new Map();
    const sit = (star, { topic, conversation }) => {
      enter(star, topic, conversation.id);
      starsHolding.set(topic, [...(starsHolding.get(topic) ?? []), star]);
    };
    for (const { earlier, later } of pairs) {
      if (placed.has(later.topic)) continue;
      const named = clusterOf.get(topicKey(earlier.conversation.id, earlier.topic.label));
      // A subject that holds a conversation the check did not link is closed to
      // it, and so is every topic on that subject.
      const refused = refusals.get(later.conversation.id);
      const around = [...(named ? [named] : []), ...(starsHolding.get(earlier.topic) ?? [])];
      if (around.some((cluster) => cluster.conversationIds.some((id) => refused.has(id)))) continue;
      // A subject a check named takes a topic that links to it, from its newest
      // conversation or one after it.
      const notAfter = (id) => position.get(id) <= position.get(later.conversation.id);
      if (named?.conversationIds.every(notAfter)) {
        if (!named.members.includes(later.topic)) {
          enter(named, later.topic, later.conversation.id);
        }
        continue;
      }
      if (!stars.has(earlier.topic)) {
        const star = newCluster(earlier.topic);
        star.hub = earlier.conversation.id;
        stars.set(earlier.topic, star);
        sit(star, earlier);
      }
      sit(stars.get(earlier.topic), later);
    }
  }
  const drawn = clusters
    .filter((cluster) => cluster.conversationIds.length > 1)
    .map((cluster) => ({
      hub: cluster.hub,
      members: cluster.members,
      label: cluster.named.length
        ? subjectName(cluster.named)
        : meaning
          ? subjectName(cluster.members)
          : cluster.members[0].label,
      // In the order they happened: a check can add an earlier conversation last.
      conversationIds: [...cluster.conversationIds].sort(
        (a, b) => position.get(a) - position.get(b)
      ),
    }));
  // A star whose topics all sit on a bigger subject is that subject: topics all
  // alike are one chip, and each of their edges carries its one name.
  const subjectsOf = new Map();
  for (const item of drawn) {
    for (const member of item.members) {
      subjectsOf.set(member, [...(subjectsOf.get(member) ?? []), item]);
    }
  }
  const holderOf = new Map();
  for (const item of drawn) {
    if (item.hub === null) continue;
    const holder = subjectsOf
      .get(item.members[0])
      .filter((other) => other.members.length > item.members.length)
      .filter((other) => item.members.every((member) => other.members.includes(member)))
      .sort((a, b) => b.members.length - a.members.length)[0];
    if (holder) holderOf.set(item, holder);
  }
  const edges = new Map();
  const addEdge = (from, to, label) => {
    const key = `${from}-${to}`;
    const edge = edges.get(key);
    if (edge) {
      if (!edge.topics.includes(label)) edge.topics.push(label);
      edge.weight = edge.topics.length;
    } else {
      edges.set(key, { from, to, weight: 1, kind: "shared", topics: [label] });
    }
  };
  const byName = new Map();
  for (const item of drawn) {
    const ids = item.conversationIds;
    const { label } = holderOf.get(item) ?? item;
    // From the topic that came back to, on this computer; along the thread for a check.
    for (let index = 1; index < ids.length; index += 1) {
      addEdge(item.hub ?? ids[index - 1], ids[index], label);
    }
    if (holderOf.has(item)) continue;
    // Two subjects with one name are one to the reader (`linkedHighlight`).
    const named = byName.get(label);
    if (named) {
      named.conversationIds = [...new Set([...named.conversationIds, ...ids])].sort(
        (a, b) => position.get(a) - position.get(b)
      );
    } else {
      byName.set(label, { label, conversationIds: ids });
    }
  }
  const subjects = [...byName.values()];
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
