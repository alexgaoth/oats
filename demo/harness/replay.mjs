// The live replay: the sample conversation recorded again, in real time,
// through the app's own recording path.
//
// Nothing here writes to the recording store's state directly while it plays.
// The replay stands where the main process and the microphone stand:
//
//   - Record is pressed the way the global shortcut presses it
//     (`toggle-conversation`), so the Conversation surface starts a real
//     recording: a note, the recording store, the question aide, the topic
//     tracker, the checkpoints.
//   - Once the store calls `meetingTranscriptionStart`, each turn arrives as
//     main sends it in a room: partial text while it is being said, then the
//     final segment when the segmenter and Whisper would deliver it
//     (`demo/lib/conversation.mjs`, the same timing the fixture was built with).
//   - The fake microphone (`media.mjs`) reports the room's level, so the
//     listening ring and the live contour move with the voices.
//   - Mark is pressed with the M key, at the moments the fixture's marks were.
//   - Stop goes through the shortcut again. Main's half follows: the turn still
//     being said is transcribed before Stop returns, the speaker pass reports
//     who spoke (`conversation-speakers`), and the local model writes the
//     title and summary when the built-in action asks for them.
//   - Afterwards the reader's own edits are made the way the reading view
//     makes them: each voice named, and notes added to two marks.
//
// One exception, during a seek only: the seconds skipped over have their
// microphone levels published the way `MeetingRecordingMount` publishes them
// (`currentMicLevel`), one a second, because the meter samples in real time
// and a jump forward has none.

import {
  ROOM_FLOOR,
  createRoom,
  finalArrivals,
  partialText,
  partialTimes,
  timelineFromTranscript,
} from "../lib/conversation.mjs";
import { getRate, isPaused, pauseClock, resumeClock, setRate, setVirtualTime } from "./clock.mjs";
import { setLevelProvider } from "./media.mjs";

const TICK_MS = 40;
const KIND_ORDER = { final: 0, mark: 1, partial: 2, end: 3 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One frame and one task: long enough for React to commit and the aide's writes to land. */
function settle() {
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === "function") {
      const timer = setTimeout(done, 50);
      requestAnimationFrame(() => {
        clearTimeout(timer);
        done();
      });
    } else {
      done();
    }
  });
}

/** The recording store, as the app loaded it (a second copy would be a second store). */
async function appRecordingStore() {
  const url = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .find((name) => name.includes("/stores/meetingRecordingStore.ts"));
  if (!url) return null;
  const module = await import(/* @vite-ignore */ url);
  return module.useMeetingRecordingStore ?? null;
}

async function appTranscriptSerializer() {
  const module = await import("/utils/transcriptSpeakerState.ts");
  return module.serializeTranscriptSegments;
}

/**
 * @param {{ main: ReturnType<import("./fake-main.mjs").createFakeMain>, fixture: object,
 *   options?: { hold?: boolean, edits?: boolean } }} input
 */
export function createReplay({ main, fixture, options = {} }) {
  const timeline = timelineFromTranscript(fixture.note.transcript, fixture.replay);
  const arrivals = finalArrivals(timeline);
  const room = createRoom(timeline, fixture.replay?.voices ?? {}, fixture.meta.id);
  const stopAtMs = fixture.replay?.stopAtMs ?? timeline[timeline.length - 1].endMs + 2600;
  const marks = (fixture.note.conversation_marks ?? []).map((mark) => ({
    at: mark.at - fixture.meta.startedAt,
    note: mark.note ?? "",
  }));

  // Everything that happens, in ms from the start of the recording.
  const schedule = [];
  timeline.forEach((segment, index) => {
    for (const at of partialTimes(segment)) {
      // The one Whisper server reads a live line only when no final is
      // waiting for it (`partialScheduler.mjs`).
      if (index > 0 && arrivals[index - 1] > at) continue;
      schedule.push({ at, kind: "partial", index });
    }
    schedule.push({ at: arrivals[index], kind: "final", index });
  });
  for (const mark of marks) schedule.push({ at: mark.at, kind: "mark", note: mark.note });
  schedule.push({ at: stopAtMs, kind: "end" });
  schedule.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  let session = null;
  let loop = null;
  let busy = false;
  let pendingSeek = null;
  let pendingRate = null;
  const finishedNotes = [];

  const elapsed = () => (session ? Date.now() - session.startedAt : 0);

  const levelNow = () => {
    if (!session || session.phase !== "recording" || isPaused()) {
      return ROOM_FLOOR * (0.9 + 0.2 * Math.random());
    }
    return room.levelAt(elapsed());
  };
  setLevelProvider(levelNow);

  const sendSegment = (data) => main.emit("onMeetingTranscriptionSegment", data);

  function sendFinal(index, text = timeline[index].text, endMs = timeline[index].endMs) {
    if (!session || session.finalized.has(index)) return;
    session.finalized.add(index);
    const segment = timeline[index];
    sendSegment({
      text,
      source: "mic",
      type: "final",
      timestamp: session.startedAt + segment.startMs,
      startMs: segment.startMs,
      endMs,
    });
  }

  function pressMark() {
    // On the page, not the window: the M handler reads the target's ancestors.
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "m", code: "KeyM", bubbles: true, cancelable: true })
    );
  }

  async function run(event, { seeking = false } = {}) {
    if (event.kind === "partial") {
      if (seeking || session.finalized.has(event.index)) return;
      const text = partialText(timeline[event.index], event.at);
      if (text) sendSegment({ text, source: "mic", type: "partial" });
    } else if (event.kind === "final") {
      sendFinal(event.index);
    } else if (event.kind === "mark") {
      pressMark();
    } else if (event.kind === "end" && !options.hold) {
      session.ended = true;
      setTimeout(() => void finish(), seeking ? 400 : 0);
    }
  }

  async function advance() {
    if (busy || !session || session.phase !== "recording" || isPaused()) return;
    busy = true;
    try {
      const now = elapsed();
      while (session.cursor < schedule.length && schedule[session.cursor].at <= now) {
        const event = schedule[session.cursor];
        session.cursor += 1;
        await run(event);
        if (session.phase !== "recording") break;
      }
    } finally {
      busy = false;
    }
  }

  function startLoop() {
    stopLoop();
    loop = setInterval(() => void advance(), TICK_MS);
  }

  function stopLoop() {
    if (loop) clearInterval(loop);
    loop = null;
  }

  // --- Main's half of a recording.

  // The local model behind the built-in "Generate Notes" action: after Finish
  // it is asked for the notes, then for a title (`actionProcessingStore.ts`,
  // `generateTitle.ts`). It answers with the sample's own, which were written
  // in the format the action asks for, a little slower than instantly. Then it
  // is asked which group the conversation belongs in
  // (`conversationGroupSort.mjs`), here and for the background sort: a stub
  // that reads the words it was given and answers with one name, as a model
  // is asked to.
  main.hooks.reason = ({ text, prompt }) => {
    if (/meeting notes assistant/i.test(prompt)) {
      return { text: fixture.note.enhanced_content, delayMs: 4200 };
    }
    if (/concise 3-8 word title/i.test(prompt)) {
      return { text: fixture.note.title, delayMs: 900 };
    }
    if (/sort conversations into groups/i.test(prompt)) {
      const personal = /\b(weekend|holiday|trip|family|flat|landlord|rent|kids|birthday)\b/i;
      return { text: personal.test(text) ? "Personal" : "Work", delayMs: 700 };
    }
    return null;
  };

  main.hooks.start = async (startOptions = {}) => {
    if (session && (session.phase === "recording" || session.phase === "stopping")) {
      return { success: false, error: "Operation in progress" };
    }
    session = {
      phase: "recording",
      noteId: startOptions.noteId ?? null,
      startedAt: Date.now(),
      cursor: 0,
      finalized: new Set(),
      ended: false,
    };
    if (pendingRate != null) {
      setRate(pendingRate);
      pendingRate = null;
    }
    startLoop();
    if (pendingSeek != null) {
      const seconds = pendingSeek;
      pendingSeek = null;
      // After the recording surface has drawn and subscribed to the level.
      setTimeout(() => void seek(seconds), 500);
    }
    return {
      success: true,
      systemAudioMode: "unsupported",
      systemAudioStrategy: "unsupported",
      oneOnOneAttendee: null,
    };
  };

  main.hooks.stop = async () => {
    if (!session || session.phase !== "recording") return undefined;
    session.phase = "stopping";
    stopLoop();
    const at = elapsed();
    // Main transcribes what it still holds before Stop returns: every turn
    // already said, and the one being said, up to the press.
    await sleep(250);
    timeline.forEach((segment, index) => {
      if (session.finalized.has(index) || segment.startMs >= at) return;
      const text = segment.endMs <= at ? segment.text : partialText(segment, at);
      if (text) sendFinal(index, text, Math.min(segment.endMs, at));
      else session.finalized.add(index);
    });
    sendSegment({ text: "", source: "mic", type: "partial" });
    const spoken = timeline.filter((_, index) => session.finalized.has(index));
    const finished = { noteId: session.noteId, startedAt: session.startedAt, at, spoken };
    session.phase = "finished";
    session.stoppedAtMs = at;
    finishedNotes.push(finished);
    setTimeout(() => void speakerPass(finished), 2200);
    return {
      success: true,
      transcript: spoken.map((segment) => segment.text).join(" "),
      diarizationSessionId: `diar-${Date.now()}`,
    };
  };

  // Who spoke, after Stop, as the in-room speaker pass reports it: turns in
  // seconds from the start of the recording, a label per voice.
  async function speakerPass(finished) {
    if (!finished.noteId) return;
    main.emit("onConversationSpeakers", {
      noteId: finished.noteId,
      startedAt: finished.startedAt,
      turns: finished.spoken.map((segment) => ({
        start: segment.startMs / 1000,
        end: Math.min(segment.endMs, finished.at) / 1000,
        speaker: `voice-${segment.speaker}`,
      })),
    });
    if (options.edits === false) return;
    await sleep(1600);
    await readerEdits(finished);
  }

  // What the reader does afterwards in the transcript: names each voice (the
  // speaker button writes the whole transcript back), and adds a note to the
  // marks that carry one in the fixture (the marked moments card does the same).
  async function readerEdits(finished) {
    const note = main.db.findNote(finished.noteId);
    if (!note?.transcript) return;
    let segments;
    try {
      segments = JSON.parse(note.transcript);
    } catch {
      return;
    }
    const byStart = new Map(timeline.map((segment) => [segment.startMs, segment.name]));
    const names = new Map();
    for (const segment of segments) {
      if (!/^speaker_\d+$/.test(String(segment.speaker ?? "")) || names.has(segment.speaker))
        continue;
      const name = byStart.get(segment.startMs);
      if (name) names.set(segment.speaker, name);
    }
    if (names.size) {
      const serialize = await appTranscriptSerializer();
      const named = segments.map((segment) =>
        names.has(segment.speaker)
          ? {
              ...segment,
              speakerName: names.get(segment.speaker),
              speakerIsPlaceholder: false,
              speakerStatus: "locked",
            }
          : segment
      );
      main.db.updateNote(finished.noteId, { transcript: serialize(named) });
    }
    let stored = [];
    try {
      stored = JSON.parse(main.db.findNote(finished.noteId)?.conversation_marks ?? "[]");
    } catch {}
    if (Array.isArray(stored) && stored.length) {
      const withNotes = stored.map((mark, index) =>
        marks[index]?.note && !mark.note ? { ...mark, note: marks[index].note } : mark
      );
      if (JSON.stringify(withNotes) !== JSON.stringify(stored)) {
        main.db.updateNote(finished.noteId, { conversation_marks: JSON.stringify(withNotes) });
      }
    }
  }

  // --- The controls.

  async function waitFor(check, timeoutMs = 15000) {
    const until = performance.now() + timeoutMs;
    while (!check()) {
      if (performance.now() > until) throw new Error("oatsDemo: the app did not get ready in time");
      await sleep(50);
    }
  }

  /** Start recording (the shortcut's way), or carry on after a pause. */
  async function play() {
    if (session?.phase === "recording") {
      resumeClock();
      return status();
    }
    await waitFor(() => main.listenerCount("onToggleConversation") > 0);
    main.emit("onToggleConversation");
    await waitFor(() => session?.phase === "recording");
    return status();
  }

  function pause() {
    pauseClock();
    return status();
  }

  /**
   * Move forward to `seconds` into the conversation. Everything said on the
   * way arrives in order, as fast as the app takes it, so the transcript, the
   * cards, the topics and the counters are what they would have been.
   */
  async function seek(seconds) {
    if (!session || session.phase !== "recording") {
      pendingSeek = seconds;
      return status();
    }
    const target = Math.max(0, Number(seconds) * 1000);
    if (target <= elapsed()) return status();
    while (busy) await sleep(10);
    busy = true;
    const wasPaused = isPaused();
    if (wasPaused) resumeClock();
    const store = await appRecordingStore();
    const publishLevel = (secondMs) => {
      let sum = 0;
      for (let step = 0; step < 10; step += 1) sum += room.levelAt(secondMs + step * 100) ** 2;
      store?.setState({ currentMicLevel: Math.sqrt(sum / 10) });
    };
    let second = Math.ceil(elapsed() / 1000);
    try {
      while (session.cursor < schedule.length && schedule[session.cursor].at <= target) {
        const event = schedule[session.cursor];
        while (second * 1000 <= event.at) {
          setVirtualTime(session.startedAt + second * 1000);
          publishLevel(second * 1000);
          second += 1;
        }
        setVirtualTime(session.startedAt + event.at);
        session.cursor += 1;
        await run(event, { seeking: true });
        if (event.kind === "final") await settle();
        if (session.phase !== "recording") break;
      }
      if (session.phase === "recording") {
        while (second * 1000 <= target) {
          setVirtualTime(session.startedAt + second * 1000);
          publishLevel(second * 1000);
          second += 1;
        }
        setVirtualTime(session.startedAt + target);
      }
    } finally {
      busy = false;
      if (wasPaused) pauseClock();
    }
    return status();
  }

  /** Stop the recording, the shortcut's way, and let main finish its half. */
  async function finish() {
    if (session?.phase !== "recording") return status();
    if (isPaused()) resumeClock();
    main.emit("onToggleConversation");
    await waitFor(() => session?.phase === "finished");
    return status();
  }

  function speed(rate) {
    if (session?.phase === "recording") setRate(rate);
    else pendingRate = rate;
    return status();
  }

  function status() {
    return {
      phase: session?.phase ?? "idle",
      seconds: session ? Math.round((session.stoppedAtMs ?? elapsed()) / 100) / 10 : 0,
      lengthSeconds: Math.round(stopAtMs / 1000),
      paused: isPaused(),
      speed: pendingRate ?? getRate(),
      noteId: session?.noteId ?? finishedNotes[finishedNotes.length - 1]?.noteId ?? null,
      turnsSent: session ? session.finalized.size : 0,
      turns: timeline.length,
    };
  }

  return { play, pause, seek, finish, speed, status };
}
