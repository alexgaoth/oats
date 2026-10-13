// The bundled example conversations: placing one in time, and putting it into
// a database and taking it back out.
//
// A sample is stored the way the app stores a finished conversation: the note's
// columns as Finish, the speaker pass and the intelligence pipeline leave them,
// and the question events the aide wrote while it ran. The fixtures are made by
// `demo/build-fixtures.mjs`, which runs the app's own topic tracker, question
// aide, loudness encoder and speaker assignment over a scripted conversation,
// so nothing here is data in a shape the app did not produce itself.
//
// Times in a fixture are absolute, from the moment it was generated. Placing
// one moves every time in it by the same whole number of seconds, so it reads
// as recent whenever it is inserted, and its turns, questions, topics, marks
// and loudness keep their places relative to each other.
//
// `placeSampleConversation` is pure and DOM-free (the demo harness runs it in
// the browser). The other two take a DatabaseManager; the main process loads
// this file with `import()`, as it does the other .mjs helpers.

/** What a fixture file says it is. */
export const SAMPLE_FIXTURE_KIND = "oats-sample-conversation";
export const SAMPLE_FIXTURE_VERSION = 1;

/**
 * The closest to now a sample ever ends. Record continues a conversation that
 * ended within the last half hour (`conversationResume.mjs`), and a sample
 * placed inside that window would have the next real conversation appended to
 * it.
 */
export const SAMPLE_MIN_ENDED_AGO_MS = 45 * 60_000;

/** Where a fixture with no placement of its own is put: ended two hours ago. */
const DEFAULT_ENDED_AGO_MINUTES = 120;

const SECOND = 1000;
const DAY = 24 * 60 * 60_000;

/** An epoch time in SQLite's `CURRENT_TIMESTAMP` form: UTC, to the second. */
function sqlTime(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Throw unless this is a sample fixture this code can place.
 *
 * @param {unknown} fixture
 */
export function assertSampleFixture(fixture) {
  if (!isObject(fixture) || fixture.kind !== SAMPLE_FIXTURE_KIND) {
    throw new Error("Not a sample conversation fixture");
  }
  if (fixture.version !== SAMPLE_FIXTURE_VERSION) {
    throw new Error(`Unsupported sample fixture version: ${fixture.version}`);
  }
  const { meta, note, events } = fixture;
  if (!isObject(meta) || typeof meta.id !== "string" || !meta.id.trim()) {
    throw new Error("Sample fixture has no id");
  }
  if (!Number.isFinite(meta.startedAt) || !Number.isFinite(meta.endedAt)) {
    throw new Error(`Sample fixture ${meta.id} has no times`);
  }
  if (!isObject(note) || !Array.isArray(note.transcript) || !note.transcript.length) {
    throw new Error(`Sample fixture ${meta.id} has no transcript`);
  }
  if (!Array.isArray(events)) throw new Error(`Sample fixture ${meta.id} has no events`);
}

/**
 * When a fixture's conversation starts, placed relative to `now`.
 *
 * `meta.placement` is either `{ endedAgoMinutes }` or `{ daysAgo, at: "HH:MM" }`
 * (local time), with `weekdays: true` moving a day that falls on a weekend
 * back to the Friday before. Either way it ends at least
 * `SAMPLE_MIN_ENDED_AGO_MS` before `now`, and it starts on a whole second, so
 * the stored loudness, kept one value a second, stays on its seconds.
 *
 * @returns {number} epoch ms
 */
export function sampleStart(fixture, { now = Date.now() } = {}) {
  const { meta } = fixture;
  const length = meta.endedAt - meta.startedAt;
  const placement = isObject(meta.placement) ? meta.placement : {};
  let start;
  const time = /^(\d{1,2}):(\d{2})$/.exec(String(placement.at ?? ""));
  if (Number.isFinite(placement.daysAgo) && time) {
    const day = new Date(now - placement.daysAgo * DAY);
    day.setHours(Number(time[1]), Number(time[2]), 0, 0);
    while (placement.weekdays && (day.getDay() === 0 || day.getDay() === 6)) {
      day.setDate(day.getDate() - 1);
    }
    start = day.getTime();
  } else {
    const endedAgo = Number.isFinite(placement.endedAgoMinutes)
      ? placement.endedAgoMinutes * 60_000
      : DEFAULT_ENDED_AGO_MINUTES * 60_000;
    start = now - Math.max(endedAgo, SAMPLE_MIN_ENDED_AGO_MS) - length;
  }
  const latestStart = now - SAMPLE_MIN_ENDED_AGO_MS - length;
  return Math.floor(Math.min(start, latestStart) / SECOND) * SECOND;
}

/**
 * A fixture as the rows to store: every time moved so the conversation starts
 * at `sampleStart`, and the columns the database keeps as JSON text written as
 * text, exactly as the app writes them.
 *
 * @param {object} fixture A sample fixture (see `assertSampleFixture`).
 * @param {{ now?: number }} [options]
 * @returns {{ sampleId: string, startedAt: number, endedAt: number,
 *   note: Record<string, string | number | null>,
 *   events: Array<{ id: number, kind: string, parentEventId: number | null,
 *     segmentIds: string[], text: string, metadata: object, createdAt: number }> }}
 */
export function placeSampleConversation(fixture, { now = Date.now() } = {}) {
  assertSampleFixture(fixture);
  const { meta, note } = fixture;
  const startedAt = sampleStart(fixture, { now });
  const delta = startedAt - meta.startedAt;
  const shift = (value) => (Number.isFinite(value) ? value + delta : value);

  const transcript = note.transcript.map((segment) => ({
    ...segment,
    timestamp: shift(segment.timestamp),
  }));
  const topics = isObject(note.conversation_topics)
    ? {
        ...note.conversation_topics,
        nodes: (note.conversation_topics.nodes ?? []).map((node) => ({
          ...node,
          firstAt: shift(node.firstAt),
          lastAt: shift(node.lastAt),
        })),
      }
    : null;
  // A mark's id is minted from its moment (`conversationMoments.mjs`), so it
  // moves with it.
  const marks = Array.isArray(note.conversation_marks)
    ? note.conversation_marks.map((mark) => ({
        ...mark,
        id: mark.id === `m-${mark.at}` ? `m-${shift(mark.at)}` : mark.id,
        at: shift(mark.at),
      }))
    : null;
  const loudness = isObject(note.conversation_loudness)
    ? {
        ...note.conversation_loudness,
        runs: (note.conversation_loudness.runs ?? []).map((run) => ({ ...run, at: shift(run.at) })),
      }
    : null;
  const summarizedAt = Number.isFinite(meta.summarizedAt) ? meta.summarizedAt : meta.endedAt;

  return {
    sampleId: meta.id,
    startedAt,
    endedAt: shift(meta.endedAt),
    note: {
      title: String(note.title ?? ""),
      content: String(note.content ?? ""),
      note_type: "meeting",
      transcript: JSON.stringify(transcript),
      enhanced_content: note.enhanced_content ?? null,
      enhancement_prompt: note.enhancement_prompt ?? null,
      enhanced_at_content_hash: note.enhanced_at_content_hash ?? null,
      conversation_topics: topics ? JSON.stringify(topics) : null,
      conversation_marks: marks && marks.length ? JSON.stringify(marks) : null,
      conversation_loudness: loudness ? JSON.stringify(loudness) : null,
      open_questions: Number.isInteger(note.open_questions) ? note.open_questions : null,
      created_at: sqlTime(startedAt),
      updated_at: sqlTime(shift(summarizedAt)),
    },
    events: fixture.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      parentEventId: event.parentEventId ?? null,
      segmentIds: Array.isArray(event.segmentIds) ? event.segmentIds.map(String) : [],
      text: String(event.text ?? ""),
      metadata: isObject(event.metadata) ? event.metadata : {},
      createdAt: shift(event.createdAt),
    })),
  };
}

/**
 * Insert sample conversations through the app's own DatabaseManager: the note
 * as `saveNote` and `updateNote` write it, the question events as the aide
 * writes them, and then the sample's id and its place in time
 * (`markSampleNote`). One transaction per conversation, so a failure leaves
 * nothing half-written.
 *
 * A sample that is already there and not deleted is left alone, unless
 * `replace` is set. One the user deleted (a hidden row) does not count, so
 * inserting again brings a fresh copy back.
 *
 * @param {object} databaseManager A `DatabaseManager` (helpers/database.js).
 * @param {object[]} fixtures Sample fixtures, e.g. `require("./sampleConversations/launch-readiness-review.json")`.
 * @param {{ now?: number, replace?: boolean }} [options]
 * @returns {Array<{ sampleId: string, noteId: number, inserted: boolean, note: object | null }>}
 */
export function insertSampleConversations(
  databaseManager,
  fixtures,
  { now = Date.now(), replace = false } = {}
) {
  if (!databaseManager?.db || typeof databaseManager.markSampleNote !== "function") {
    throw new Error("insertSampleConversations needs an initialized DatabaseManager");
  }
  const results = [];
  for (const fixture of Array.isArray(fixtures) ? fixtures : [fixtures]) {
    const placed = placeSampleConversation(fixture, { now });
    const present = databaseManager
      .listSampleNotes()
      .filter((row) => row.sample_id === placed.sampleId);
    if (present.length && !replace) {
      results.push({
        sampleId: placed.sampleId,
        noteId: present[0].id,
        inserted: false,
        note: databaseManager.getNote(present[0].id),
      });
      continue;
    }
    const note = databaseManager.db.transaction(() => {
      if (present.length) databaseManager.removeSampleNotes([placed.sampleId]);
      const saved = databaseManager.saveNote(placed.note.title, placed.note.content, "meeting");
      const noteId = Number(saved.note.id);
      databaseManager.updateNote(noteId, {
        transcript: placed.note.transcript,
        enhanced_content: placed.note.enhanced_content,
        enhancement_prompt: placed.note.enhancement_prompt,
        enhanced_at_content_hash: placed.note.enhanced_at_content_hash,
        conversation_topics: placed.note.conversation_topics,
        conversation_marks: placed.note.conversation_marks,
        conversation_loudness: placed.note.conversation_loudness,
        open_questions: placed.note.open_questions,
      });
      // Parents are written before their children, so each new id is known
      // by the time an event that points at it is inserted.
      const ids = new Map();
      for (const event of placed.events) {
        const stored = databaseManager.insertConversationEvent({
          noteId,
          kind: event.kind,
          parentEventId:
            event.parentEventId == null ? null : (ids.get(event.parentEventId) ?? null),
          segmentIds: event.segmentIds,
          text: event.text,
          metadata: event.metadata,
          createdAt: event.createdAt,
        });
        ids.set(event.id, stored.id);
      }
      return databaseManager.markSampleNote(noteId, {
        sampleId: placed.sampleId,
        createdAt: placed.note.created_at,
        updatedAt: placed.note.updated_at,
      });
    })();
    results.push({ sampleId: placed.sampleId, noteId: note.id, inserted: true, note });
  }
  return results;
}

/**
 * Take sample conversations back out, for good: every sample, or the ones with
 * these ids. The normal Delete only hides a note; this removes the rows and
 * their question events.
 *
 * @param {object} databaseManager
 * @param {{ sampleIds?: string[] | null }} [options]
 * @returns {{ removed: number, ids: number[] }}
 */
export function removeSampleConversations(databaseManager, { sampleIds = null } = {}) {
  return databaseManager.removeSampleNotes(sampleIds);
}
