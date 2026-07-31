#!/usr/bin/env electron
/**
 * Seeds one realistic conversation so the topic graph, the thread list, and the
 * question cards can be looked at without recording anything.
 *
 * It writes exactly what a real recording writes — a `meeting` note with a
 * transcript, a `conversation_topics` snapshot, and `conversation_events` rows —
 * by running the same `ConversationTopicTracker` the live path uses. Nothing here
 * is graph-specific fixture data: if the detector's thresholds are wrong, this
 * script shows you that rather than hiding it.
 *
 *   npm run seed:sample
 *   npm run seed:sample -- --remove
 *
 * Runs under Electron proper (not ELECTRON_RUN_AS_NODE): better-sqlite3 is built
 * against Electron's ABI, and `app.getPath("userData")` — after the same
 * channel isolation main.js applies — is the only honest way to
 * find the same database the app itself opens. No window is ever created.
 */

const path = require("path");
const { app } = require("electron");

// Match main.js's channel isolation *before* anything opens the database.
//
// main.js redirects userData to `Oats-<channel>` for every non-production
// channel. Without the same redirect this script writes a database the app never
// opens — it reports success, and Intelligence stays empty, which reads as a
// broken graph rather than as a seed that went to the wrong file.
// database.js picks the *filename* off NODE_ENV (`transcriptions-dev.db`) while
// main.js picks the *directory* off OATS_CHANNEL. Two different mechanisms
// answering "am I in dev", so a seed script has to satisfy both or it writes a
// file nobody opens. `npm run dev` sets NODE_ENV=development; match it, since
// seeding a production install is not what this script is for.
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

const VALID_CHANNELS = new Set(["development", "staging", "production"]);
const rawChannel = (process.env.OATS_CHANNEL || process.env.VITE_OATS_CHANNEL || "")
  .trim()
  .toLowerCase();
const APP_CHANNEL = VALID_CHANNELS.has(rawChannel) ? rawChannel : "development";
if (APP_CHANNEL !== "production") {
  app.setPath("userData", path.join(app.getPath("appData"), `Oats-${APP_CHANNEL}`));
}

const DatabaseManager = require("../src/helpers/database");

const SAMPLE_PREFIX = "[sample] ";

// Three conversations rather than one, because the lifetime graph (nodes are
// conversations, edges are shared subjects) has nothing to show below three and
// because a single conversation cannot demonstrate a recurring theme. Pricing
// runs through all three; hiring through two; the rest are one-offs.
const SAMPLE_TITLE = `${SAMPLE_PREFIX}Pricing, hiring, and the demo that keeps slipping`;
const SECOND_TITLE = `${SAMPLE_PREFIX}Board prep and the pricing decision`;
const THIRD_TITLE = `${SAMPLE_PREFIX}Hiring loop and onboarding debt`;

const SECOND_UTTERANCES = [
  ["A", "Board prep starts with the enterprise pricing decision."],
  ["B", "Enterprise pricing is the only number the board will ask about."],
  ["A", "We should show enterprise pricing against the churn cohort data."],
  ["B", "The churn cohort analysis is not finished either."],
  ["A", "Churn cohort work needs another analyst week at least."],
  ["B", "Do you know what our net revenue retention actually is?"],
  ["A", "No idea. Nobody has computed net revenue retention this quarter."],
  ["B", "Then the board deck leads with pricing and admits the gap."],
  ["A", "Board deck should be honest about the pricing gap."],
];

const THIRD_UTTERANCES = [
  ["A", "The hiring loop for the research engineer is still broken."],
  ["B", "Research engineer candidates drop out at the take-home stage."],
  ["A", "We should cut the take-home from the research engineer loop."],
  ["B", "Separately, onboarding debt is slowing every new engineer down."],
  ["A", "Onboarding debt means a new engineer waits two weeks for access."],
  ["B", "Onboarding flow work keeps getting deprioritised."],
  ["A", "Back to the hiring loop, we should cut the take-home entirely."],
];

// A founder conversation that wanders and comes back — the shape the graph is
// built to reveal. `speaker` only affects how the transcript reads.
const UTTERANCES = [
  ["A", "So the thing I keep coming back to is the pricing model."],
  ["B", "Our pricing is too low for the enterprise segment, that's the whole problem."],
  ["A", "Right, enterprise pricing is where we're leaving money on the table."],
  ["B", "If we raise enterprise pricing the deals actually get easier, not harder."],
  ["A", "Do you know what the median seat price is for our segment?"],
  ["B", "No, I don't. I've never looked that up."],
  ["A", "Okay. Separately — hiring the research engineer is getting urgent."],
  ["B", "The research engineer role has been open for four months now."],
  ["A", "Every research engineer candidate we like takes a counteroffer."],
  ["B", "Do you think we should raise the research engineer band?"],
  ["A", "Probably, yes. The band is clearly below market."],
  ["B", "Then there's the demo. The customer demo keeps slipping every sprint."],
  ["A", "The demo slipped again because the onboarding flow isn't finished."],
  ["B", "How long does the onboarding flow actually need?"],
  ["A", "Two weeks if nobody touches it, but somebody always touches it."],
  ["B", "Coming back to enterprise pricing though — that's still unresolved."],
  ["A", "Enterprise pricing has to be decided before the demo goes out."],
  ["B", "Have you heard of anyone benchmarking seat price publicly?"],
  ["A", "Not really, I'm not sure that data exists."],
  ["B", "Last thing — the investor update is due Friday."],
  ["A", "The investor update should lead with the pricing decision."],
];

const STEP_MS = 9000;

// Questions the aide would have caught, with the outcome the classifier would
// have produced. Only `denied` — a confirmed "I don't know" — auto-searches.
const QUESTIONS = [
  {
    utteranceIndex: 4,
    text: "What is the median seat price for our segment?",
    responseIndex: 5,
    outcome: "denied",
    reason: "denied_knowledge",
    confidence: 0.93,
    query: "median SaaS seat price by segment",
    searched: true,
  },
  {
    utteranceIndex: 9,
    text: "Should we raise the research engineer band?",
    responseIndex: 10,
    outcome: "answered",
    reason: "answered",
    confidence: 0.88,
    query: "research engineer compensation band",
    searched: false,
  },
  {
    utteranceIndex: 13,
    text: "How long does the onboarding flow need?",
    responseIndex: 14,
    outcome: "answered",
    reason: "answered",
    confidence: 0.81,
    query: "onboarding flow build time",
    searched: false,
  },
  {
    utteranceIndex: 17,
    text: "Has anyone benchmarked seat price publicly?",
    responseIndex: 18,
    outcome: "uncertain",
    reason: "uncertain_response",
    confidence: 0.72,
    query: "public SaaS seat price benchmark",
    searched: false,
  },
];

// Opens through the app's own DatabaseManager rather than a raw handle, so the
// schema (and every future migration) is identical to what the app creates. A
// seed script that hand-rolls its own tables is a seed script that silently
// drifts.
function openDatabase() {
  const manager = new DatabaseManager();
  manager.initDatabase();
  const dbFileName =
    process.env.NODE_ENV === "development" ? "transcriptions-dev.db" : "transcriptions.db";
  return { db: manager.db, dbPath: path.join(app.getPath("userData"), dbFileName) };
}

function removeSample(db) {
  const rows = db.prepare("SELECT id FROM notes WHERE title LIKE ?").all(`${SAMPLE_PREFIX}%`);
  for (const row of rows) {
    db.prepare("DELETE FROM conversation_events WHERE note_id = ?").run(row.id);
    db.prepare("DELETE FROM notes WHERE id = ?").run(row.id);
  }
  return rows.length;
}

async function main() {
  await app.whenReady();
  const remove = process.argv.includes("--remove");
  const { db, dbPath } = openDatabase();

  const removed = removeSample(db);
  if (remove) {
    console.log(`Removed ${removed} sample conversation(s) from ${dbPath}`);
    db.close();
    return;
  }

  const { ConversationTopicTracker } = await import(
    path.join(__dirname, "..", "src", "helpers", "conversationTopics.mjs")
  );

  const start = Date.now() - UTTERANCES.length * STEP_MS;
  const segments = UTTERANCES.map(([speaker, text], index) => ({
    id: `seed-${index}`,
    text,
    source: speaker === "A" ? "mic" : "system",
    timestamp: start + index * STEP_MS,
    speakerName: speaker === "A" ? "You" : "Guest",
  }));

  // Run the real tracker, not a fixture, so the graph shows what the detector
  // would actually have produced from this conversation.
  const tracker = new ConversationTopicTracker();
  for (const segment of segments) {
    tracker.onUtterance({ id: segment.id, text: segment.text, at: segment.timestamp });
  }
  for (const question of QUESTIONS) {
    if (question.outcome === "answered") {
      tracker.resolveTopicForUtterance(`seed-${question.utteranceIndex}`);
    }
  }
  const snapshot = tracker.snapshot(start + UTTERANCES.length * STEP_MS);

  const noteInfo = db
    .prepare(
      `INSERT INTO notes (title, content, note_type, transcript, conversation_topics, enhanced_content)
       VALUES (?, ?, 'meeting', ?, ?, ?)`
    )
    .run(
      SAMPLE_TITLE,
      "",
      JSON.stringify(segments),
      JSON.stringify(snapshot),
      [
        "Three threads ran through this conversation and only one of them closed.",
        "",
        "**Enterprise pricing** is the spine of the discussion. It opened the",
        "conversation, was dropped for hiring, and was deliberately returned to —",
        "the room agrees it is underpriced but nobody knows the market number.",
        "",
        "**Hiring a research engineer** stalled on compensation. The band is below",
        "market and candidates keep taking counteroffers; raising it was agreed.",
        "",
        "**The customer demo** keeps slipping on the unfinished onboarding flow,",
        "and is now blocked on the pricing decision.",
      ].join("\n")
    );
  const noteId = Number(noteInfo.lastInsertRowid);

  const insertEvent = db.prepare(
    `INSERT INTO conversation_events
       (note_id, kind, parent_event_id, segment_ids_json, text, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const question of QUESTIONS) {
    const askedAt = start + question.utteranceIndex * STEP_MS;
    const questionId = Number(
      insertEvent.run(
        noteId,
        "question",
        null,
        JSON.stringify([`seed-${question.utteranceIndex}`]),
        question.text,
        JSON.stringify({
          state: question.outcome,
          confidence: question.confidence,
          occurrence: 1,
        }),
        askedAt
      ).lastInsertRowid
    );

    insertEvent.run(
      noteId,
      "response",
      questionId,
      JSON.stringify([`seed-${question.responseIndex}`]),
      UTTERANCES[question.responseIndex][1],
      JSON.stringify({ reason: question.reason, outcome: question.outcome, trigger: "seed" }),
      askedAt + 1000
    );

    if (question.outcome !== "answered") {
      insertEvent.run(
        noteId,
        "search_suggestion",
        questionId,
        JSON.stringify([`seed-${question.utteranceIndex}`]),
        question.query,
        JSON.stringify({
          query: question.query,
          confidence: question.confidence,
          reason: question.reason,
          state: question.searched ? "opened" : "shown",
          auto: question.searched,
        }),
        askedAt + 2000
      );
    }
  }

  // The two supporting conversations exist so the lifetime graph has edges to
  // draw; they carry no question events, since the question card UI is already
  // demonstrated by the first one.
  const extras = [
    { title: SECOND_TITLE, utterances: SECOND_UTTERANCES, daysAgo: 9 },
    { title: THIRD_TITLE, utterances: THIRD_UTTERANCES, daysAgo: 4 },
  ];
  for (const extra of extras) {
    const extraStart = Date.now() - extra.daysAgo * 86400000;
    const extraTracker = new ConversationTopicTracker();
    const extraSegments = extra.utterances.map(([speaker, text], index) => ({
      id: `seed-${extra.daysAgo}-${index}`,
      text,
      source: speaker === "A" ? "mic" : "system",
      timestamp: extraStart + index * STEP_MS,
      speakerName: speaker === "A" ? "You" : "Guest",
    }));
    for (const segment of extraSegments) {
      extraTracker.onUtterance({ id: segment.id, text: segment.text, at: segment.timestamp });
    }
    const extraSnapshot = extraTracker.snapshot(extraStart + extra.utterances.length * STEP_MS);
    db.prepare(
      `INSERT INTO notes (title, content, note_type, transcript, conversation_topics, created_at)
       VALUES (?, '', 'meeting', ?, ?, ?)`
    ).run(
      extra.title,
      JSON.stringify(extraSegments),
      JSON.stringify(extraSnapshot),
      new Date(extraStart).toISOString()
    );
    console.log(`  also seeded "${extra.title}" — ${extraSnapshot.nodes.length} topics`);
  }

  db.close();

  const returns = snapshot.edges.filter((edge) => edge.kind === "return");
  console.log(`Seeded "${SAMPLE_TITLE}" as note ${noteId} in ${dbPath}`);
  console.log(`  topics: ${snapshot.nodes.length}  edges: ${snapshot.edges.length}`);
  console.log(`  return edges: ${returns.length}`);
  console.log(`  topics: ${snapshot.nodes.map((n) => `${n.label} [${n.state}]`).join(", ")}`);
  console.log(`  questions: ${QUESTIONS.length}`);
  console.log("\nOpen Oats → Intelligence and select the conversation.");
  console.log("Then choose Map to see the lifetime graph across all three.");
  console.log("Remove it again with: npm run seed:sample -- --remove");
}

main()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
