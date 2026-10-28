// The stand-in for the writing model when it names a topic of the sample
// (`src/helpers/topicNaming.mjs`). It reads the words it was sent for the
// topic and answers with the name a model gives the review's topics, as the
// stub for the summary answers with the sample's own summary. The names are
// what gpt-5.6-luna answered for these topics with the app's own prompt, so
// the demo shows names of the length a model writes.
//
// It reads only the lines quoted from the topic, not the other topics' names,
// and keeps the current name when it is asked again about a topic it already
// named that way, as the prompt asks a model to. With no subject it knows, it
// answers nothing, and the topic keeps its on-device name.

const NAMES = [
  {
    name: "Pellwood launch date decision",
    words: /\b(launch date|third|3rd|move the launch|kickoff)\b/gi,
  },
  { name: "SAML clock skew fix", words: /\b(sso|saml|identity provider|login)\b/gi },
  { name: "SOC 2 audit timeline", words: /\b(soc|audit|auditors?|bridge letter)\b/gi },
  { name: "Enterprise discount policy", words: /\b(discount|pricing|percent|enterprise)\b/gi },
  {
    name: "Data migration risk and rollback",
    words: /\b(migration|migrate|snapshot|workspace)\b/gi,
  },
  { name: "Launch week support coverage", words: /\b(support|queue|evening|cover)\b/gi },
  { name: "Beta import bug remediation", words: /\b(import|csv|beta)\b/gi },
  { name: "News embargo timing", words: /\b(embargo|announcement|press|outlets?)\b/gi },
];

/** The stub's answer to a topic-naming prompt, or null when it has no name to give. */
export function demoTopicName(prompt) {
  const text = String(prompt ?? "");
  const said = text.split("What was said on this topic:")[1] ?? "";
  const current = /^Current name: (.*?)\.\s/m.exec(text)?.[1] ?? null;
  let best = null;
  let most = 0;
  for (const entry of NAMES) {
    const hits = (said.match(entry.words) ?? []).length;
    if (hits > most) {
      best = entry.name;
      most = hits;
    }
  }
  if (!best) return null;
  return current && current.toLowerCase() === best.toLowerCase() ? current : best;
}

// --- The live topic check (`loop=1`, fastModel.mjs).
//
// The stand-in for the check model that confirms the changes of subject
// the on-device tracker proposes (`src/helpers/topicLoop.mjs`). It answers as
// the model is asked to, in the asked JSON, from the same subjects as above:
// a change where the lines after it turn to another subject, a return when
// that subject already has a topic, and "same" otherwise. It decides from the
// words alone, so a run of the demo draws the same topics every time.

const hitsOf = (text, entry) => (String(text).match(entry.words) ?? []).length;

/** The subject the lines are most on, or null. */
function subjectOf(lines) {
  const text = lines.join(" ");
  let best = null;
  let most = 0;
  for (const entry of NAMES) {
    const hits = hitsOf(text, entry);
    if (hits > most) {
      best = entry;
      most = hits;
    }
  }
  return best;
}

const numbered = (text, letter) =>
  text
    .split("\n")
    .map((line) => new RegExp(`^${letter}\\d+\\. (.*)$`).exec(line)?.[1])
    .filter((line) => line !== undefined);

/** The stub's answer to a check of the live topics (`CHECK_SYSTEM`), as JSON text. */
export function demoTopicCheck(user) {
  const text = String(user ?? "");
  const answer = (fields) =>
    JSON.stringify({
      decision: "same",
      at: 1,
      topic: null,
      name: null,
      gist: null,
      rename: null,
      ...fields,
    });
  const topics = [];
  for (const line of (text.split("TOPICS:")[1] ?? "").split("\n\n")[0].split("\n")) {
    const [id, name] = line.split(" | ");
    if (id && name) topics.push({ id: id.trim(), name: name.trim() });
  }
  const before = numbered(text, "B");
  const after = numbered(text, "A");
  const current = /^CURRENT: \S+ \| (.*?), for /m.exec(text)?.[1] ?? "";
  const was = subjectOf(before) ?? NAMES.find((entry) => entry.name === current) ?? null;
  for (let index = 0; index < after.length; index += 1) {
    const now = subjectOf([after[index]]);
    if (!now || now === was) continue;
    // The talk from here on is more on the new subject than on the old one.
    const rest = after.slice(index).join(" ");
    if (was && hitsOf(rest, now) <= hitsOf(rest, was)) continue;
    const earlier = topics.find((topic) => topic.name.toLowerCase() === now.name.toLowerCase());
    if (earlier) return answer({ decision: "return", at: index + 1, topic: earlier.id });
    return answer({ decision: "new", at: index + 1, name: now.name });
  }
  return answer({});
}

/** The stub's answer when the live check names the first topic (`FIRST_NAME_SYSTEM`). */
export function demoTopicFirstName(user) {
  const said = String(user ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  // No subject it knows: a name the app refuses, so the on-device name stays.
  return JSON.stringify({ name: subjectOf(said)?.name ?? "", gist: "" });
}
