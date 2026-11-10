// The stand-in for the writing model when it names and describes a topic of
// the sample (`src/helpers/topicNaming.mjs`). It reads the words it was sent
// for the topic and answers with the name a model gives the review's topics,
// as the stub for the summary answers with the sample's own summary. The names
// are what gpt-5.6-luna answered for these topics with the app's own prompt,
// so the demo shows names of the length a model writes. The descriptions were
// written from the sample's own lines, with no fact the lines do not state.
//
// It reads only the lines quoted from the topic, not the other topics' names,
// and keeps the current name when it is asked again about a topic it already
// named that way, as the prompt asks a model to. Its description is as many
// of its sentences as fit the length the request gives, so it grows with the
// topic, as a model's does. With no subject it knows, it answers nothing, and
// the topic keeps its on-device name.

const NAMES = [
  {
    name: "Pellwood launch date decision",
    words: /\b(launch date|third|3rd|move the launch|kickoff)\b/gi,
    gist: "Hold Tuesday the 3rd unless SSO slips past Monday's check",
    about:
      "The launch is planned for Tuesday the 3rd, to be locked after this review. Three signed customers have kickoffs that week, and the help articles want a day of buffer. Pushing it a week was proposed and argued against. The decision is to hold the 3rd with a hard check on Monday: if the SSO fix is not merged and reviewed by then, the date moves a week.",
  },
  {
    name: "SAML clock skew fix",
    words: /\b(sso|saml|identity provider|login)\b/gi,
    gist: "Early SAML assertions rejected; twelve-line clock tolerance fix",
    about:
      "SAML login fails with the third identity provider, because its signed assertions arrive a few seconds early and the library rejects them. The fix is twelve lines plus a clock tolerance setting, at most two minutes, logged, with an alert above thirty seconds. It lands by Thursday the 29th and then needs two working days of security review. SSO can ship behind a per-workspace flag, and SCIM is out of scope.",
  },
  {
    name: "SOC 2 audit timeline",
    words: /\b(soc|audit|auditors?|bridge letter)\b/gi,
    gist: "Kestrel fieldwork dates unconfirmed; bridge letter covers until December",
    about:
      "The SOC 2 audit window closes on the 31st, SSO is in scope, and the two gaps from the readiness check are closed. Kestrel has not confirmed the fieldwork dates, and the report will not exist until December. A bridge letter could cover buyers until then, but it is issued only once fieldwork starts, so the auditors are needed on site before the 3rd.",
  },
  {
    name: "Enterprise discount policy",
    words: /\b(discount|pricing|percent|enterprise)\b/gi,
    gist: "Twenty-five percent floor, thirty with a two-year term",
    about:
      "The list price of forty-eight dollars a seat per month, with a fifty-seat minimum billed annually, gets no pushback. Three deals ask for forty percent off, against the twenty-five percent cap agreed in September. The floor is twenty-five percent, thirty with a two-year term, and deeper only deal by deal with a signed case study. Greywater gets thirty percent, Arden's three-year offer needs numbers first, and monthly billing stays out.",
  },
  {
    name: "Data migration risk and rollback",
    words: /\b(migration|migrate|snapshot|workspace)\b/gi,
    gist: "Per-workspace snapshots; the biggest data sets still untested",
    about:
      "The migration moves every workspace to the new permissions model. Two runs on a copy of production took three hours and twenty minutes for 1,140 workspaces, with four failures on orphaned records. Each workspace gets a snapshot that restores in about four minutes, in batches of fifty. The open risk is the three biggest data sets, to be measured by Thursday, and the run is on a Saturday with read-only windows.",
  },
  {
    name: "Launch week support coverage",
    words: /\b(support|queue|evening|cover)\b/gi,
    gist: "Two of four support agents out in launch week",
    about:
      "Two of the four support agents are out in launch week, and tickets tripled in the first two days of the last launch. Engineering is on call for escalations, but cover for the evening queue is still open. Agreed: macros that link to the setup guide, a priority lane for the six SSO accounts, an engineer in the support channel on the first day, and SSO training on Thursday.",
  },
  {
    name: "Beta import bug remediation",
    words: /\b(import|csv|beta)\b/gi,
    gist: "Large CSV imports silently partial; fix in release candidate three",
    about:
      "Fourteen of the 212 beta accounts hit the import bug, most with CSV files over 50,000 rows. The importer dropped the last chunk of a large file, so an import that said it failed had mostly landed. The fix is in release candidate three, with a sixty-thousand-row test. The fourteen imports will be replayed, the error message rewritten, and the progress bar will show the rows imported.",
  },
  {
    name: "News embargo timing",
    words: /\b(embargo|announcement|press|outlets?)\b/gi,
    gist: "Embargo lifts Wednesday the 4th, after the analyst briefing",
    about:
      "The news embargo moves to nine on Wednesday the 4th, after Tuesday's analyst briefing, so customers get access a day before the announcement. Two trade outlets have the story under embargo, and legal approved two quotes. The blog post and the customer email are ready, the news release is with legal until Thursday, and SOC 2 stays out of it.",
  },
];

/** The names it gives, for the harness's topic vectors (`build-topic-vectors.mjs`). */
export const DEMO_TOPIC_NAMES = NAMES.map((entry) => entry.name);

/** The first sentences of `about` that fit in `max` words, and at least the first. */
function describedIn(about, max) {
  const sentences = about.match(/[^.]+\.(?:\s+|$)/g) ?? [about];
  let kept = sentences[0];
  for (const sentence of sentences.slice(1)) {
    const next = kept + sentence;
    if (next.trim().split(/\s+/).length > max) break;
    kept = next;
  }
  return kept.trim();
}

/** The stub's answer to a topic-naming prompt (name and description), or null when it has no name to give. */
export function demoTopicName(prompt) {
  const text = String(prompt ?? "");
  const said = text.split("What was said on this topic:")[1] ?? "";
  const current = /^Current name: (.*?)\.\s/m.exec(text)?.[1] ?? null;
  const length = Number(/^Length of the description: at most (\d+) words\./m.exec(text)?.[1] ?? 80);
  let best = null;
  let most = 0;
  for (const entry of NAMES) {
    const hits = (said.match(entry.words) ?? []).length;
    if (hits > most) {
      best = entry;
      most = hits;
    }
  }
  if (!best) return null;
  const name = current && current.toLowerCase() === best.name.toLowerCase() ? current : best.name;
  return `Name: ${name}\nAbout: ${describedIn(best.about, length)}`;
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
    return answer({ decision: "new", at: index + 1, name: now.name, gist: now.gist });
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
  const subject = subjectOf(said);
  return JSON.stringify({ name: subject?.name ?? "", gist: subject?.gist ?? "" });
}
