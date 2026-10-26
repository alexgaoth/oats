// The stand-in for the writing model when it names a topic of the sample
// (`src/helpers/topicNaming.mjs`). It reads the words it was sent for the
// topic and answers with the name a model gives the review's topics, as the
// stub for the summary answers with the sample's own summary.
//
// It reads only the lines quoted from the topic, not the other topics' names,
// and keeps the current name when it is asked again about a topic it already
// named that way, as the prompt asks a model to. With no subject it knows, it
// answers nothing, and the topic keeps its on-device name.

const NAMES = [
  { name: "Launch date move", words: /\b(launch date|third|3rd|move the launch|kickoff)\b/gi },
  { name: "SSO login with SAML", words: /\b(sso|saml|identity provider|login)\b/gi },
  { name: "SOC 2 audit timing", words: /\b(soc|audit|auditors?|bridge letter)\b/gi },
  { name: "Enterprise discount pricing", words: /\b(discount|pricing|percent|enterprise)\b/gi },
  { name: "Workspace data migration", words: /\b(migration|migrate|snapshot|workspace)\b/gi },
  { name: "Support queue coverage", words: /\b(support|queue|evening|cover)\b/gi },
  { name: "Beta CSV import bug", words: /\b(import|csv|beta)\b/gi },
  { name: "Launch news embargo", words: /\b(embargo|announcement|press|outlets?)\b/gi },
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
