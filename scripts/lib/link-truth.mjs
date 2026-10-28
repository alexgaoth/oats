// Which AMI meetings talk about the same thing: the ground truth for the link
// benchmark (`scripts/link-eval.mjs`), from the AMI meeting corpus' human topic
// annotations (manual annotations 1.6.2, CC BY 4.0).
//
// Two meetings are linked when they share a specific topic label, and each of
// them spends at least `minWords` words on it. A label is the annotators': the
// corpus' topic type ("costing", "look and usability"), or the free text they
// wrote when no type fitted ("marketing strategy"). Each word counts for its
// innermost topic and every topic above it, so a sub-topic inside a
// presentation counts.
//
// Generic labels never link: they say what kind of talk it was (an opening, a
// presentation by the marketing expert, a discussion), not what it was about.
//
// Free text is written differently by different annotators, so the same
// subject has several spellings ("trend watching", "trendwatching",
// "mushroom and trendwatch"). `SAME_AS` maps each to one subject. It was
// written from the label list alone, before any method was scored, and is
// printed in docs/link-eval.md. The four non-scenario meetings have only free
// text: two are about who gets which office in a new building (IB4003,
// IB4005) and two about which film a movie club shows (IB4010, IB4011).

import { loadAmiWords } from "./topic-corpus.mjs";

/** Labels that say what kind of talk it was, not what it was about. */
export const GENERIC = new Set([
  "opening",
  "closing",
  "agenda/equipment issues",
  "agenda",
  "equipment issues",
  "euqipment issues",
  "chitchat",
  "discussion",
  "other",
  "participant names",
  "particpant names",
  // Who presents, not what: in one meeting the marketing expert presents what
  // users want, in the next the trends; what they present is a sub-topic.
  "marketing expert presentation",
  "interface specialist presentation",
  "industrial designer presentation",
  "industrial design presentation",
  "marketing presentation",
  "user interface presentation",
  "marketing expert ideas",
  "interface specialist ideas",
  "industrial designer ideas",
  // How the meeting is run.
  "how to take decisions",
  "decisions",
  "time of next meeting",
  "what to do for the next meeting",
]);

/** One subject, however the annotators spelled it. */
export const SAME_AS = {
  // Scenario meetings: free text that restates a type of the corpus' list.
  "trend watching": "trendwatching",
  "mushroom and trendwatch": "trendwatching",
  components: "components, materials and energy sources",
  "components, materials and power source": "components, materials and energy sources",
  "energy source": "components, materials and energy sources",
  batteries: "components, materials and energy sources",
  "evaluation of prototype": "evaluation of prototype(s)",
  "giving marks to prototype properties": "evaluation of prototype(s)",
  "presentation of prototype": "presentation of prototype(s)",
  "presentation of rc prototype": "presentation of prototype(s)",
  "evaluation of project": "evaluation of project process",
  "target group": "user target group",
  "look and feel": "look and usability",
  "how it looks": "look and usability",
  "ease of use": "look and usability",
  "drawing animals on the whiteboard": "drawing exercise",
  "tool training introduction exercise": "drawing exercise",
  "introduction to tools and equipment": "drawing exercise",
  "introduction of participants and their roles": "project specs and roles of participants",
  "introduction and definition of participants' roles": "project specs and roles of participants",
  "project goals and design process": "project specs and roles of participants",
  "project goal and design process": "project specs and roles of participants",
  "project aim and goals": "project specs and roles of participants",
  "project goals and workplan": "project specs and roles of participants",
  "how to find when it is misplaced": "how to find when misplaced",
  "costing and re-design of prototype": "costing",
  "cost estimate": "costing",
  "financial evaluation": "costing",
  "adapting design to budget restrictions": "costing",
  "adapting design to budget constraints": "costing",
  "evaluation of existing products": "existing products",
  "discussion of proposed features": "proposed features",
  // Non-scenario: who sits in which office (IB4003, IB4005).
  "office allocation criteria": "office allocation",
  "project-related office allocation": "office allocation",
  "professors' offices": "office allocation",
  "individual preferences": "office allocation",
  "arrangement of people in space": "office allocation",
  "professional rank/status": "office allocation",
  "sharing with assistants": "office allocation",
  "cubicles/splitting rooms": "office allocation",
  admin: "admin space",
  "reading room: necessary or not?": "what each room is for",
  "types/purposes of rooms": "what each room is for",
  "room designation presentation": "what each room is for",
  // Non-scenario: which film the movie club shows (IB4010, IB4011).
  "movie selection presentation": "movie selection",
  "movie selection evaluation/decisions": "movie selection",
  "first movie presentation": "movie selection",
  "second movie presentation": "movie selection",
  "movie plot": "the candidate films",
  genre: "the candidate films",
  "actors/cast": "the candidate films",
  "director(s)": "the candidate films",
  "reviews/awards/rankings": "the candidate films",
  ratings: "the candidate films",
  soundtrack: "the candidate films",
  "length of movie": "the candidate films",
  "mainstream/popularity of movie": "the candidate films",
  "experience of movie-goers": "the candidate films",
  "the usual suspects specs": "the candidate films",
  "the sixth sense specs": "the candidate films",
  "shawshank redemption specs": "the candidate films",
  "schindler's list specs": "the candidate films",
  "pulp fiction specs": "the candidate films",
  "goodfellas specs": "the candidate films",
  "silence of the lambs specs": "the candidate films",
  "american beauty specs": "the candidate films",
};

/** A topic's label as the annotators gave it: its type, or their free text. */
export function rawLabel(topic) {
  const type = String(topic?.type ?? "").trim();
  const text = type && type !== "other" ? type : String(topic?.description ?? "").trim() || "other";
  return text.toLowerCase().replace(/\s+/g, " ");
}

/** The subject a label names, or null for a generic one. */
export function subjectOf(label) {
  const subject = SAME_AS[label] ?? label;
  return GENERIC.has(subject) || GENERIC.has(label) ? null : subject;
}

/** Scenario meetings design a remote control; the rest are other real meetings. */
export function groupOf(meeting) {
  return /^(ES|IS|TS)\d/.test(meeting) ? "scenario" : "non-scenario";
}

/**
 * A meeting's series: the four meetings one team held (ES2002a to ES2002d). The
 * non-scenario meetings by their subject and number: IB4001 to IB4005 are the
 * office move, IB4010 and IB4011 the movie club (the same four people).
 */
export function seriesOf(meeting) {
  if (groupOf(meeting) === "scenario") return meeting.replace(/[a-z]$/, "");
  const number = Number(meeting.slice(2));
  if (meeting.startsWith("IB") && number >= 4001 && number <= 4005) return "IB-office";
  if (meeting.startsWith("IB") && number >= 4010 && number <= 4011) return "IB-movies";
  return meeting;
}

/**
 * Words spent on each subject in one meeting, from its word-level topics.
 *
 * @returns {{ subjects: Map<string, number>, labels: Map<string, number>, words: number }}
 */
export function meetingSubjects(dir, meeting, names) {
  const { words, topics } = loadAmiWords(dir, meeting, names);
  const subjects = new Map();
  const labels = new Map();
  for (const word of words) {
    const seenSubjects = new Set();
    const seenLabels = new Set();
    for (let topic = topics.get(word.fine); topic; topic = topic.parent) {
      const label = rawLabel(topic);
      if (!seenLabels.has(label)) {
        seenLabels.add(label);
        labels.set(label, (labels.get(label) ?? 0) + 1);
      }
      const subject = subjectOf(label);
      if (subject && !seenSubjects.has(subject)) {
        seenSubjects.add(subject);
        subjects.set(subject, (subjects.get(subject) ?? 0) + 1);
      }
    }
  }
  return { subjects, labels, words: words.length };
}

/** Where a pair of meetings sits: its group, and whether it is one series. */
export function categoryOf(a, b) {
  const groupA = groupOf(a);
  const groupB = groupOf(b);
  if (groupA !== groupB) return "mixed";
  const within = seriesOf(a) === seriesOf(b);
  return `${groupA}-${within ? "within" : "across"}`;
}

export const CATEGORIES = [
  "scenario-within",
  "scenario-across",
  "non-scenario-within",
  "non-scenario-across",
  "mixed",
];

/**
 * Every pair of meetings, with whether they are linked and the subjects they
 * share (each held for at least `minWords` words in both).
 *
 * @param {string[]} meetings
 * @param {Map<string, { subjects: Map<string, number> }>} byMeeting
 */
export function truthPairs(meetings, byMeeting, { minWords = 100 } = {}) {
  const ids = [...meetings].sort();
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = byMeeting.get(ids[i]).subjects;
      const b = byMeeting.get(ids[j]).subjects;
      const shared = [];
      for (const [subject, count] of a) {
        if (count >= minWords && (b.get(subject) ?? 0) >= minWords) shared.push(subject);
      }
      shared.sort();
      pairs.push({
        a: ids[i],
        b: ids[j],
        key: `${ids[i]}|${ids[j]}`,
        linked: shared.length > 0,
        shared,
        category: categoryOf(ids[i], ids[j]),
      });
    }
  }
  return pairs;
}
