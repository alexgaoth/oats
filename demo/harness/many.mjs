// `profile=many`: two hundred synthetic conversations over the past year, in
// three conversation groups, for measuring the Global conversations board at a
// size somebody reaches after a year of use. Dev-only, like the rest of the
// harness.
//
// Generated, not recorded: each conversation carries one or two subjects that
// come back across the record, drawn from its group's, the common ones more
// often, and one to three topics of its own that never return, which is what
// most of a real conversation is. Seeded, so every load draws the same board.
// Titles are in English; the profile is for measuring, not for copy.

const SUBJECTS = [
  // Work: subjects a founder or a team lead keeps coming back to.
  ["Pricing tiers", ["pricing", "tiers", "enterprise", "discount", "annual"]],
  ["SSO rollout", ["sso", "saml", "okta", "login", "rollout"]],
  ["Hiring loop", ["hiring", "candidate", "loop", "offer", "interview"]],
  ["Data migration", ["migration", "import", "schema", "backfill", "csv"]],
  ["Onboarding flow", ["onboarding", "signup", "activation", "checklist", "trial"]],
  ["Q4 roadmap", ["roadmap", "quarter", "priorities", "scope", "milestones"]],
  ["Churn cohort", ["churn", "cohort", "retention", "renewal", "accounts"]],
  ["Security audit", ["soc", "audit", "security", "controls", "evidence"]],
  ["Launch comms", ["launch", "announcement", "press", "embargo", "webinar"]],
  ["Support load", ["support", "tickets", "queue", "agents", "escalation"]],
  ["Design system", ["design", "components", "tokens", "figma", "spacing"]],
  ["Fundraising", ["investors", "round", "deck", "valuation", "runway"]],
  ["Billing bugs", ["billing", "invoice", "stripe", "refund", "proration"]],
  ["API limits", ["api", "rate", "limits", "quota", "throttling"]],
  // Research.
  ["Reading group", ["paper", "reading", "citations", "method", "results"]],
  ["Thesis draft", ["thesis", "chapter", "advisor", "draft", "defense"]],
  ["Lab experiments", ["experiment", "samples", "protocol", "lab", "assay"]],
  ["Grant proposal", ["grant", "proposal", "budget", "aims", "reviewers"]],
  // Personal.
  ["Family plans", ["family", "weekend", "trip", "kids", "dinner"]],
  ["Health", ["doctor", "sleep", "running", "appointment", "diet"]],
  ["Kitchen renovation", ["kitchen", "contractor", "permit", "renovation", "tiles"]],
  ["Personal finance", ["savings", "taxes", "mortgage", "invest", "spending"]],
  ["Moving house", ["moving", "lease", "boxes", "neighborhood", "landlord"]],
  // More work subjects that come back less often.
  ["Partner channel", ["partner", "reseller", "channel", "margin", "referral"]],
  ["Infra costs", ["aws", "costs", "instances", "reserved", "spend"]],
  ["Incident review", ["incident", "outage", "postmortem", "pager", "timeline"]],
  ["Board meeting", ["board", "meeting", "metrics", "update", "agenda"]],
  ["Sales pipeline", ["pipeline", "deals", "forecast", "quota", "stage"]],
  ["Customer advisory", ["advisory", "customers", "feedback", "council", "sessions"]],
  // More research.
  ["Conference talk", ["conference", "talk", "slides", "submission", "deadline"]],
  ["Dataset cleaning", ["dataset", "labels", "cleaning", "noise", "annotation"]],
  // More personal.
  ["Garden", ["garden", "tomatoes", "soil", "watering", "beds"]],
  ["Car repair", ["car", "mechanic", "brakes", "service", "tires"]],
];

// The words a topic of its own is made of: it matches nothing else.
const ONE_OFF = [
  "offsite",
  "visa",
  "printer",
  "parking",
  "badge",
  "laptop",
  "wifi",
  "catering",
  "license",
  "trademark",
  "domain",
  "logo",
  "keyboard",
  "desk",
  "chairs",
  "coffee",
  "plants",
  "lighting",
  "projector",
  "insurance",
  "dentist",
  "passport",
  "wedding",
  "birthday",
  "concert",
  "museum",
  "bakery",
  "bicycle",
  "piano",
  "chess",
  "novel",
  "podcast",
  "camera",
  "hiking",
  "sailing",
];

// The groups: the two a new database is seeded with, and one the person made.
// Which subjects belong to which, by index into SUBJECTS.
const GROUP_SUBJECTS = {
  work: [0, 13, 23, 28],
  research: [14, 17, 29, 30],
  personal: [18, 22, 31, 32],
};

/** A small seeded generator, so the profile is the same on every load. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SQLite's `CURRENT_TIMESTAMP`: UTC, to the second. */
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/**
 * The profile's notes and the questions they left open, ready for the fake
 * main process's in-memory database. `groups` maps work, research and personal
 * to the ids of those groups there.
 */
export function manyConversations({ groups, now = Date.now(), count = 200, firstId = 1000 } = {}) {
  const next = random(2026);
  const pick = (list) => list[Math.floor(next() * list.length)];
  // Earlier subjects of a group come up more often: a few subjects come back
  // a dozen times or more, the tail a few times.
  const subjectFor = (group) => {
    const [from, to, extraFrom, extraTo] = GROUP_SUBJECTS[group];
    const pool = [];
    for (let at = from; at <= to; at += 1) pool.push(at);
    for (let at = extraFrom; at <= extraTo; at += 1) pool.push(at);
    return pool[Math.min(pool.length - 1, Math.floor(pool.length * Math.pow(next(), 1.6)))];
  };
  const year = 365 * 24 * 60 * 60 * 1000;
  const notes = [];
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const group = next() < 0.6 ? "work" : next() < 0.5 ? "research" : "personal";
    const chosen = new Set();
    const recurring = next() < 0.35 ? 2 : 1;
    while (chosen.size < recurring) chosen.add(subjectFor(group));
    const subjects = [...chosen].map((at) => SUBJECTS[at]);
    const ownCount = 1 + Math.floor(next() * 3);
    for (let own = 0; own < ownCount; own += 1) {
      const word = pick(ONE_OFF);
      subjects.push([
        `${word} ${index}`,
        [
          word,
          `${word}${index}`,
          `own${index}x${own}`,
          `item${index}y${own}`,
          `note${index}z${own}`,
        ],
      ]);
    }
    const minutes = 6 + Math.round(next() * 54);
    const createdAt =
      now - year + Math.round((index / count) * (year - 3 * 3600000) + next() * 3600000);
    const nodes = subjects.map(([label, words], at) => ({
      id: at + 1,
      label: label.toLowerCase(),
      words: [...words]
        .sort(() => next() - 0.5)
        .slice(0, 4)
        .concat(pick(["plan", "next", "team", "week"])),
      durationMs: Math.round(((minutes * 60000) / subjects.length) * (0.5 + next())),
      utteranceIds: [],
      firstAt: createdAt,
      lastAt: createdAt + minutes * 60000,
      returns: 0,
      state: "open",
    }));
    const [first, second, third] = subjects.map(([label]) => label);
    const title = third
      ? `${first}: ${second.toLowerCase()} and ${third.toLowerCase()}`
      : `${first}: ${second.toLowerCase()}`;
    const id = firstId + index;
    const open = next() < 0.35 ? 1 + Math.floor(next() * 3) : 0;
    notes.push({
      id,
      title,
      content: "",
      enhanced_content: null,
      enhancement_prompt: null,
      enhanced_at_content_hash: null,
      note_type: "meeting",
      source_file: null,
      audio_duration_seconds: minutes * 60,
      folder_id: 2,
      transcript: null,
      calendar_event_id: null,
      participants: null,
      diarization_enabled: null,
      expected_speaker_count: null,
      open_questions: open,
      conversation_topics: JSON.stringify({ nodes, edges: [] }),
      conversation_marks: null,
      conversation_loudness: null,
      sample_id: null,
      group_id: groups?.[group] ?? null,
      group_source: groups ? "model" : null,
      cloud_id: null,
      created_at: sqlTime(createdAt),
      updated_at: sqlTime(createdAt + minutes * 60000),
      client_note_id: `many-${id}`,
      sync_status: "pending",
      deleted_at: null,
    });
    for (let at = 0; at < open; at += 1) {
      questions.push({
        noteId: id,
        kind: "question",
        segmentIds: [`many-${id}-${at}`],
        text: `What do we do about ${pick(subjects[at % subjects.length][1])}?`,
        metadata: { state: "asked", source: "local" },
        createdAt: createdAt + (at + 1) * 120000,
      });
    }
  }
  return { notes, questions };
}
