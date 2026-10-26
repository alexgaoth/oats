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
