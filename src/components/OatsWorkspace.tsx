import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Brain, ChevronLeft, ChevronRight, Mic, Search, Settings, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { Button } from "./ui/button";
import { Toggle } from "./ui/toggle";
import { useNotes, initializeNotes, setActiveNoteId } from "../stores/noteStore";
import {
  useMeetingRecordingStore,
  startRecording,
  stopRecording,
  getConversationTopicSnapshot,
  markMoment,
  applyConversationSpeakers,
} from "../stores/meetingRecordingStore";
import { useSettingsStore } from "../stores/settingsStore";
import {
  selectIsCloudNoteFormattingMode,
  selectResolvedNoteFormatting,
} from "../stores/settingsStore";
import { useConversationEvents } from "../hooks/useConversationEvents";
import ConversationGraph from "./notes/ConversationGraph";
import TopicGraph from "./notes/TopicGraph";
import LifetimeGraph from "./notes/LifetimeGraph";
import ListeningPulse from "./conversation/ListeningPulse";
import FieldBackdrop from "./field/FieldBackdrop";
import WheatPerch from "./field/WheatPerch";
import LiveThreadMap from "./conversation/LiveThreadMap";
import OpenThreadStack from "./conversation/OpenThreadStack";
import ConversationSignalRail, { StateMark } from "./conversation/ConversationSignalRail";
import ConversationContour from "./conversation/ConversationContour";
import ConversationDialogue from "./conversation/ConversationDialogue";
import { ScrollFade, useScrollFade } from "./conversation/useScrollFade";
import { toggleConversationDetail } from "../helpers/conversationDetail.mjs";
import { findExcerpt, mergeRecall } from "../helpers/conversationRecall.mjs";
import { findMatches, foldText } from "../helpers/searchFold.mjs";
import { speakerText } from "../utils/speakerLabel";
import { buildReview, questionTurns } from "../helpers/conversationReview.mjs";
import {
  momentSegment,
  parseMoments,
  removeMoment,
  setMomentNote,
} from "../helpers/conversationMoments.mjs";
import {
  conversationSpanMs,
  formatSpan,
  ledgerDate,
  ledgerDateLong,
} from "../helpers/ledgerDate.mjs";
import { checkpointRisk, transcriptionStalled } from "../helpers/recordingHealth.mjs";
import type { ContourData } from "./conversation/ConversationContour";
import {
  NO_EVENTS,
  useContourStrip,
  useLiveContour,
  useStoredContour,
} from "./conversation/useContour";
import HotkeyInput from "./ui/HotkeyInput";
import { MarkdownRenderer } from "./ui/MarkdownRenderer";
import MeetingRecordingMount from "./MeetingRecordingMount";
import BackgroundActionToastListener from "./notes/BackgroundActionToastListener";
import PostMigrationOnboarding from "./PostMigrationOnboarding";
import { useAppBootstrap } from "../hooks/useAppBootstrap";
import { useConversationPreflight } from "../hooks/useConversationPreflight";
import { getCachedPlatform } from "../utils/platform";
import { formatHotkey } from "../utils/hotkeyLabel";
import { initializeActions } from "../stores/actionStore";
import { runBackgroundAction } from "../stores/actionProcessingStore";
import { serializeTranscriptSegments } from "../utils/transcriptSpeakerState";
import { matchTarget, splitOnMatches } from "../utils/conversationSearch";
import { consumePendingNote, parkPendingNote } from "../utils/pendingNote";
import type { TranscriptSegment } from "../stores/meetingRecordingStore";
import type {
  ConversationEvent,
  ConversationTopicNode,
  ConversationTopicSnapshot,
  QuestionOutcome,
} from "../types/conversationEvents";
import type { NoteItem } from "../types/electron";
import type { TFunction } from "i18next";

// Advanced Settings is the inherited OpenWhispr settings application: every
// provider, every model picker, every diagnostic. It is behind a deliberate,
// non-default path (DESIGN.md §13), and a static import pulled all of it — and
// everything it imports — into the chunk that has to render before the first
// conversation. Splitting it means the Oats path never pays for a room it does
// not walk into.
const AdvancedSettings = React.lazy(() => import("./SettingsPage"));

type Surface = "conversation" | "intelligence" | "settings";
type DetailTab = "summary" | "transcript" | "connections";

// Three destinations, named. No icons — see the nav comment in OatsWorkspace.
const nav = [
  { id: "conversation" as const },
  { id: "intelligence" as const },
  { id: "settings" as const },
];

// Rendering order for the stacked, always-mounted surfaces. Declared once rather
// than branched at the call site so the three panes are unambiguously siblings
// with stable keys — a conditional would let React reconcile one surface's
// subtree onto another's and carry state across.
const SURFACES: { id: Surface; render: () => React.ReactNode }[] = [
  { id: "conversation", render: () => <ConversationSurface /> },
  { id: "intelligence", render: () => <IntelligenceSurface /> },
  { id: "settings", render: () => <SettingsSurface /> },
];

// The summary is markdown. A two-line preview is no place for "## Threads" or
// stray asterisks, so the syntax is stripped rather than rendered — the list is
// scanning, not reading.
//
// A heading goes whole, not just its hashes. Stripping only the marker left the
// heading's words in the run of prose — "only one of them closed. Threads
// Enterprise pricing is…" — a sentence nobody wrote.
function plainPreview(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s.*$/gm, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A stored transcript as readable text.
 *
 * The speaker labels take a `t` because they are user-facing copy, and they
 * reach further than the screen: this feeds the reading view, the list preview,
 * `copy`, and the saved `.txt`. Hard-coded, they put English into every
 * transcript and every export in all ten locales.
 */
function transcriptText(raw: string | null, t: TFunction): string {
  if (!raw) return "";
  try {
    const segments = JSON.parse(raw);
    if (Array.isArray(segments)) {
      return segments
        .map((s) => {
          const label = speakerText(s, t);
          return label ? `${label}: ${s.text}` : s.text;
        })
        .join("\n\n");
    }
  } catch {}
  return raw;
}

// A conversation is offered as a continuation only if it ended recently enough
// that resuming is plausible. Longer than this and it is a new conversation that
// happens to be about the same thing — which the lifetime graph already links.
const RESUME_WINDOW_MS = 30 * 60 * 1000;

function parseSegments(raw: string | null): TranscriptSegment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Transcripts saved before ids were kept get stable positional ones, so a
    // list of turns has keys and a resumed conversation saves them from then
    // on. Questions asked in those recordings point at ids that were never
    // saved, and stay unlinked — nothing can recover those.
    return (parsed as TranscriptSegment[]).map((segment, index) =>
      segment && segment.id != null ? segment : { ...segment, id: `legacy-${index}` }
    );
  } catch {
    return [];
  }
}

function findResumableConversation(notes: NoteItem[]): NoteItem | null {
  const now = Date.now();
  for (const note of notes) {
    if (!note.transcript) continue;
    const endedAt = new Date(note.updated_at || note.created_at).getTime();
    if (!Number.isFinite(endedAt)) continue;
    if (now - endedAt > RESUME_WINDOW_MS) return null;
    return note;
  }
  return null;
}

// Same forgiving fingerprint comparison the lifetime graph uses; kept local here
// rather than imported so this stays a pure view concern.
const CARRY_OVER_THRESHOLD = 0.3;

function topicOverlap(a: string[] = [], b: string[] = []): number {
  const left = new Set(a.slice(0, 5));
  const right = new Set(b.slice(0, 5));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

// The most recent conversation, at the foot of the idle Conversation surface:
// its name, when it was, and its contour. One row, no chrome, and it opens the
// conversation in Intelligence.
//
// It is not a list. A list here would be the Intelligence surface drawn twice,
// and the whole architecture rests on there being exactly three surfaces.
function LastEntry() {
  const { t, i18n } = useTranslation();
  const notes = useNotes();
  const last = notes[0] ?? null;
  const segments = useMemo(() => parseSegments(last?.transcript ?? null), [last?.transcript]);
  const strip = useContourStrip(segments, NO_EVENTS);
  const span = formatSpan(conversationSpanMs(segments), { locale: i18n.language });

  if (!last) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("oats-open-note", { detail: last.id }))}
      className={cn(
        "mt-14 w-full max-w-md rounded-sm border-t border-border/50 pt-4 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-[13px] text-foreground">
          {last.title || t("oats.untitled")}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {ledgerDate(last.created_at, { locale: i18n.language })}
        </span>
      </div>
      {!strip.empty && (
        <StripWithSpan className="mt-2.5" span={span}>
          <ConversationContour contour={strip} height={20} showMarks={false} />
        </StripWithSpan>
      )}
    </button>
  );
}

/**
 * What the contour says, in words.
 *
 * A canvas is a rectangle to a screen reader, and the fixed string it used to
 * carry ("The shape of this conversation so far") described the frame rather
 * than the picture. This is the same information the drawing carries — how many
 * questions were asked, how many are still unanswered, how many times the
 * subject turned, how many threads the room came back to — so the element the
 * code itself calls "the one part of this document that is not words" is not
 * simply absent for anyone who cannot see it.
 */
function contourLabel(contour: ContourData, t: TFunction): string {
  if (contour.empty) return t("oats.conversation.contourEmpty");
  const unresolved = contour.marks.filter(
    (mark) => mark.state === "asked" || mark.state === "silence" || mark.state === "denied"
  ).length;
  return t("oats.conversation.contourSummary", {
    minutes: Math.max(1, Math.round(contour.span / 60000)),
    questions: contour.marks.length,
    unresolved,
    shifts: contour.shifts.length,
    returns: contour.returns.length,
  });
}

/** mm:ss, or h:mm:ss once a conversation has run past the hour. */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  return `${minutes}:${seconds}`;
}

/**
 * How long this sitting has run.
 *
 * The origin comes from the store (`recordingStartedAt`, stamped when record is
 * pressed), so the clock and the contour cannot disagree about what "this
 * conversation" is — and so neither restarts if this surface ever remounts.
 * They did disagree: continuing a recent conversation seeds up to half an hour
 * of older segments into the store, and a contour that took its origin from the
 * transcript drew an hour-wide window, two thirds of it dead air, beside a
 * clock reading 1:30.
 *
 * Ticks once a second, and only while a conversation is running.
 */
function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

function ConversationSurface() {
  const recording = useMeetingRecordingStore((s) => s.isRecording);
  // Still true for a moment after Finish, while the last words since the final
  // pause are transcribed. The save below waits for them.
  const transcribing = useMeetingRecordingStore((s) => s.isTranscribing);
  const recordingNoteId = useMeetingRecordingStore((s) => s.recordingNoteId);
  const transcript = useMeetingRecordingStore((s) => s.transcript);
  const openThreads = useMeetingRecordingStore((s) => s.openThreads);
  const suggestions = useMeetingRecordingStore((s) => s.suggestions);
  // A live partial is the earliest signal that somebody is talking again, which
  // is when the stack has to get out of the way.
  const speaking = useMeetingRecordingStore((s) => Boolean(s.micPartial || s.systemPartial));
  const { t } = useTranslation();
  const notes = useNotes();
  const [starting, setStarting] = useState(false);
  // A conversation that resumes a recent one usually *is* the same conversation —
  // a coffee refill, a person joining, a laptop dying. Oats resumes it silently
  // and names it here, rather than blocking on a question whose answer is
  // almost always yes and whose asking costs the opening sentences.
  const [continuingFrom, setContinuingFrom] = useState<string | null>(null);
  const [nothingHeard, setNothingHeard] = useState(false);
  const startingRef = useRef(false);
  // Shown on the idle screen so the window teaches the shortcut that replaces it.
  const conversationKey = useSettingsStore((state) => state.conversationKey);
  const shortcut = useMemo(
    () => formatHotkey(conversationKey, getCachedPlatform()),
    [conversationKey]
  );
  const micSilentSince = useMeetingRecordingStore((s) => s.micSilentSince);
  const checkpointFailedSince = useMeetingRecordingStore((s) => s.checkpointFailedSince);
  const checkpointedSegments = useMeetingRecordingStore((s) => s.checkpointedSegments);
  const lastCheckpointAt = useMeetingRecordingStore((s) => s.lastCheckpointAt);
  const segmentCount = useMeetingRecordingStore((s) => s.segments.length);
  const lastSoundAt = useMeetingRecordingStore((s) => s.lastSoundAt);
  const lastSegmentAt = useMeetingRecordingStore((s) => s.lastSegmentAt);
  const sessionStartedAt = useMeetingRecordingStore((s) => s.recordingStartedAt);
  const elapsed = useElapsed(sessionStartedAt);
  const contour = useLiveContour(sessionStartedAt);
  // Which composition to draw. `clean` is the default and the quiet one; see
  // `helpers/conversationDetail.mjs` for what the two mean and why the default
  // is not a preference so much as a promise.
  const detail = useSettingsStore((s) => s.conversationDetail);
  const setDetail = useSettingsStore((s) => s.setConversationDetail);
  const detailed = detail === "detailed";

  // Which question annotation is being read, so its mark on the trace can rise.
  // Re-evaluated on the same tick the elapsed clock already ticks on, so a
  // failing write becomes visible within a second of crossing the grace period
  // rather than at the next utterance — which, if transcription is what broke,
  // may never come.
  // Deliberately not memoised: it must be recomputed on the clock's own tick, so
  // a failing write becomes visible within a second of crossing the grace period
  // rather than at the next utterance — which, if transcription is what broke,
  // may never come. A `useMemo` keyed on `elapsed` says the same thing while
  // pretending `elapsed` is an input, and lint is right to call that out.
  // The failure the dead-microphone warning cannot see: level healthy, backend
  // producing nothing. Same tick, same reason.
  const stalled = transcriptionStalled({
    lastSoundAt,
    lastSegmentAt,
    startedAt: sessionStartedAt,
    micSilent: micSilentSince !== null,
    now: Date.now(),
  });

  const atRisk = checkpointRisk({
    failingSince: checkpointFailedSince,
    unsavedTurns: Math.max(0, segmentCount - checkpointedSegments),
    lastSavedAt: lastCheckpointAt,
    now: Date.now(),
  });

  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  // The fade says "more below", so it must be measured rather than remembered.
  //
  // It used to be an `atEnd` flag starting `false` and updated only by
  // `onScroll` — so a band that never scrolls never fired the event and the
  // fade stayed on forever. Measured with a single question card: band
  // `clientHeight 68 === scrollHeight 68`, the card's outcome line at **1.58:1**
  // against paper and its Search control's focus ring at 1.00:1 along the
  // bottom. The ordinary one-question case, permanently half-erased.
  const bandRef = useRef<HTMLDivElement | null>(null);
  const cardCount = useMeetingRecordingStore((s) => s.questionCards.length);
  const { faded: bandFaded, measure: measureBand } = useScrollFade(bandRef, cardCount);
  const wasRecording = useRef(false);
  // Announced once when a recording ends, then cleared, so an idle screen the
  // user merely navigated to says nothing.
  const [justStopped, setJustStopped] = useState(false);
  useEffect(() => {
    if (recording) {
      setJustStopped(false);
      return undefined;
    }
    if (!wasRecording.current) return undefined;
    setJustStopped(true);
    const timer = window.setTimeout(() => setJustStopped(false), 8000);
    return () => window.clearTimeout(timer);
  }, [recording]);
  // Checked before the first word rather than discovered after the last one.
  const preflight = useConversationPreflight();

  useEffect(() => {
    if (!wasRecording.current || recording || transcribing) {
      wasRecording.current = recording || transcribing;
      return;
    }
    wasRecording.current = false;
    const state = useMeetingRecordingStore.getState();
    const finalTranscript = state.segments.length
      ? serializeTranscriptSegments(state.segments)
      : state.transcript || transcript;
    if (!recordingNoteId) return;
    // A conversation that captured nothing is not a conversation. Leaving an
    // empty note behind means the Intelligence list slowly fills with blanks the
    // user has to clean up, and it hides the actual problem: the mic heard
    // nothing. Say so, and delete the note.
    if (!finalTranscript.trim()) {
      setNothingHeard(true);
      void window.electronAPI?.deleteNote?.(recordingNoteId);
      return;
    }
    setNothingHeard(false);
    // Snapshot the topics before anything else awaits: the tracker is live
    // renderer state, and the graph in Intelligence reads only what is persisted.
    const topics = getConversationTopicSnapshot();
    const moments = state.moments;
    void (async () => {
      await window.electronAPI?.updateNote(recordingNoteId, {
        transcript: finalTranscript,
        ...(topics ? { conversation_topics: JSON.stringify(topics) } : {}),
        // Written on every press already; once more here so a press whose
        // write was refused still lands with the transcript it belongs to.
        ...(moments.length ? { conversation_marks: JSON.stringify(moments) } : {}),
      });
      const action = (await initializeActions()).find((item) => item.is_builtin);
      if (!action) return;
      const settings = useSettingsStore.getState();
      const config = selectResolvedNoteFormatting(settings);
      const formatted = transcriptText(finalTranscript, t);
      runBackgroundAction(
        recordingNoteId,
        `## Conversation Transcript\n${formatted}`,
        `${finalTranscript.length}-${finalTranscript.slice(0, 50)}`,
        action,
        {
          isCloudMode: selectIsCloudNoteFormattingMode(settings),
          modelId: config.model,
          isMeetingNote: true,
          allowTitleGeneration: true,
        },
        {
          noModel: t("oats.errors.noModel"),
          noEndpoint: t("oats.errors.noEndpoint"),
          actionFailed: t("oats.errors.actionFailed"),
        }
      );
    })();
    // `t` is a dependency only because the failure messages are translated. A
    // language change re-runs this, but the `wasRecording` guard above makes that
    // an immediate no-op rather than a second intelligence run.
  }, [recording, transcribing, recordingNoteId, transcript, t]);

  const startFresh = async () => {
    setStarting(true);
    startingRef.current = true;
    setContinuingFrom(null);
    setNothingHeard(false);
    try {
      const result = await window.electronAPI?.saveNote(t("oats.untitled"), "", "meeting");
      if (!result?.success || !result.note) return;
      setActiveNoteId(result.note.id);
      await startRecording({
        noteId: result.note.id,
        noteTitle: result.note.title,
        folderId: null,
        mode: "in_room",
      });
    } finally {
      setStarting(false);
      startingRef.current = false;
    }
  };

  // Appends to the previous conversation: the same note keeps recording, so the
  // transcript, the topics, and the summary stay one thing.
  const resume = async (note: NoteItem) => {
    setStarting(true);
    startingRef.current = true;
    setNothingHeard(false);
    try {
      setActiveNoteId(note.id);
      await startRecording({
        noteId: note.id,
        noteTitle: note.title,
        folderId: note.folder_id ?? null,
        mode: "in_room",
        seedSegments: parseSegments(note.transcript),
        seedMoments: note.conversation_marks,
      });
    } finally {
      setStarting(false);
      startingRef.current = false;
    }
  };

  // Recording starts on the first press, always. Asking "is this the same
  // conversation?" before capturing costs the opening sentences — which are
  // the ones worth catching — so a recent conversation is resumed silently and
  // the interface simply says that it did. A merged note can be split later; a
  // lost opening cannot be recovered.
  const begin = async () => {
    // Re-checked on the press, not just on mount: a microphone can be plugged in
    // while this window sits open, and a stale "no microphone" that refuses to
    // record would be worse than the problem it reports.
    const problem = await preflight.check();
    if (problem === "no-microphone") return;
    const recent = findResumableConversation(notes);
    if (recent) {
      setContinuingFrom(recent.title || t("oats.untitled"));
      await resume(recent);
      return;
    }
    setContinuingFrom(null);
    await startFresh();
  };

  // `begin` closes over the notes list, so it is held in a ref: the IPC
  // subscription below stays mounted for the life of the surface while still
  // running the current implementation on each press.
  const beginRef = useRef(begin);
  beginRef.current = begin;

  // Marking the moment. One press, nothing to type while somebody is talking;
  // a note can be added afterwards in the record. `markedAt` drives the brief
  // "Marked" on the control and the announcement — the caret on the trace is
  // the lasting answer.
  const [markedAt, setMarkedAt] = useState<number | null>(null);
  const mark = useCallback(async () => {
    const moment = await markMoment();
    if (moment) setMarkedAt(moment.at);
  }, []);
  useEffect(() => {
    if (markedAt === null) return undefined;
    const timer = window.setTimeout(() => setMarkedAt(null), 1600);
    return () => window.clearTimeout(timer);
  }, [markedAt]);
  // And from the floating oat's clock, which is all there is on screen when a
  // conversation is recorded with this window hidden.
  useEffect(() => {
    const cleanup = window.electronAPI?.onMarkMoment?.(() => void mark());
    return () => cleanup?.();
  }, [mark]);
  // `M`, while a conversation is running and nothing is being typed into.
  useEffect(() => {
    if (!recording) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      void mark();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, mark]);

  // The global hotkey lands here. The window may be hidden, unfocused, or on
  // another workspace; nothing about this path surfaces it.
  useEffect(() => {
    const cleanup = window.electronAPI?.onToggleConversation?.(() => {
      if (useMeetingRecordingStore.getState().isRecording) {
        void stopRecording();
      } else if (!startingRef.current) {
        void beginRef.current();
      }
    });
    return () => cleanup?.();
  }, []);

  return (
    <>
      <section
        className={cn(
          // `min-h-0` is load-bearing, not tidiness: a flex child's default
          // `min-height: auto` lets it grow past its parent, so without it the
          // recording branch's own `flex-1 overflow-y-auto` band never becomes
          // a scroller and the pinned foot is pushed off a window that cannot
          // scroll. Measured: the dead-microphone warning's bottom edge at
          // y=836 in an 800px viewport.
          "oats-surface relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-8",
          // Two different compositions, not one composition with things hidden.
          //
          // Idle is an invitation, so it is centred and quiet. Recording is a
          // ledger being written, so it is left-aligned on a spine and sits high
          // — the contour needs room beneath it to grow into, and a centred
          // column that reflows every time an utterance lands is exactly the
          // layout shift §8 forbids while somebody is being helped.
          recording
            ? cn(
                // Clean is centred; Detailed sits high on a spine.
                //
                // The reflow argument that put recording at the top belongs to
                // Detailed alone: it is the *annotations and the transcript*
                // that grow, and a centred column carrying them would move every
                // time somebody spoke. Nothing in Clean grows — the contour is a
                // fixed height and the clock is tabular — so Clean was paying a
                // cost it does not incur, and paying it as 58% of the window in
                // dead space below the mark. Three reviews called it a
                // subtraction rather than a composition, and they were right:
                // it was Detailed's layout with things removed.
                //
                // Centred, it is its own composition and it rhymes with the
                // idle surface it comes from, so pressing record no longer
                // throws the page upward. Switching compositions re-lays out,
                // which is a deliberate act by the reader and not the unbidden
                // §8 shift.
                //
                // Detailed's margin above the clock is small because everything
                // below it is bidding for the same height, and the detected
                // dialogue — the composition's reason to exist (§9.9) — gets
                // only what is left. At 10vh it was handed 93px at the shipped
                // 1200x800: two lines, under a band of blank paper.
                detailed ? "justify-start pt-[4vh]" : "justify-center",
                // Below this height the three bands do not fit, and squeezing
                // them is worse than scrolling. Measured at 600x400 (200% zoom
                // of the shipped default) the head and foot alone took 312 of
                // 364px and the band was 12px — one partial turn of forty, and
                // zero once the dead-microphone warning appeared, with no way
                // to reach any of it. WCAG 1.4.10 asks for no *two-dimensional*
                // scrolling and no lost content, not for no scrolling: so at
                // small heights the surface becomes an ordinary vertical column
                // and everything stays reachable.
                "[@media(max-height:640px)]:overflow-y-auto"
              )
            : "items-center justify-center overflow-y-auto pb-[18vh]"
        )}
      >
        {recording ? (
          // Three bands, and the middle one is the only one that grows.
          //
          // When the annotations were simply next in the flow they pushed the
          // dead-microphone warning off the bottom of a window that does not
          // scroll: measured at the shipped 1200x800 default with four
          // questions, three of them asked twice, the warning's last line sat
          // at y=812 and the open-thread stack was gone entirely. A surface
          // whose whole reliability promise is "a dead microphone surfaces
          // while it can still be fixed" cannot let a busy conversation hide
          // that warning. The head and the foot are pinned; the annotations
          // take what is left and scroll inside it.
          <>
            {/* `my-auto` in Clean is what actually centres it. `justify-center`
                on the section had no effect while the band below claimed
                `flex-1`: there was no free space left to distribute, and the
                block still sat at the top with 464px of dead paper under it
                (measured balance 0.02). Auto margins take the free space
                symmetrically, and the foot stays pinned because it comes after
                them. */}
            <div className={cn("shrink-0", !detailed && "my-auto")}>
              {/* The Conversation surface's one status channel.
            
                Nothing here announced anything: the record control unmounts on
                press so focus falls to the body, and the dead-microphone
                warning was a plain paragraph. A screen-reader user pressed
                record, heard silence, and — twelve minutes later, when the
                microphone went flat — heard silence again, losing the
                conversation. That is precisely the "fails quietly at the end"
                this surface exists to prevent. */}
              {/* A mark is announced on its own: the status region above says
                  whether the recording is healthy, and a mark replacing that
                  sentence would hide a warning that was about to be read. */}
              <p aria-live="polite" className="sr-only">
                {markedAt !== null && sessionStartedAt !== null
                  ? t("oats.conversation.markAnnounced", {
                      time: clock(markedAt - sessionStartedAt),
                    })
                  : ""}
              </p>
              <p aria-live="polite" role="status" className="sr-only">
                {atRisk.atRisk
                  ? t("oats.conversation.notSaving", { count: atRisk.unsavedTurns })
                  : stalled.stalled
                    ? t("oats.conversation.notTranscribing")
                    : micSilentSince !== null
                      ? t("oats.conversation.micSilent")
                      : t("oats.conversation.statusRecording")}
              </p>

              {/* The clock is the heading here. What a person glances at mid-
                conversation is how long they have been recording, and it is the
                one thing on this screen that is unambiguously true. */}
              {/* The switch between the two compositions.

                    On the surface rather than in Settings, and visible in both
                    states, because that is what keeps this from being a mode
                    you have to remember being in: the screen shows which one
                    you are in, and the way out is on the same screen. It is
                    also the moment you want it — "wait, what did it just
                    hear?" happens during a conversation, not before one.

                    A text link, not a control in a box (§1), and it says what
                    it will do rather than what is currently true, because a
                    switch labelled with its own state is ambiguous about
                    which.

                    It rides the clock line, not the column beneath it.
                  Sitting under the contour it put a chrome control between the
                  trace and the annotations that annotate it — §9.2's "docked
                  directly under the contour" was measurably false (contour
                  bottom 332, switch 352–372, first annotation 397) and §1 calls
                  a control inside the evidence column a cost. Up here it is
                  beside the one other control on the surface. */}
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-4">
                  <button
                    type="button"
                    onClick={() => void stopRecording()}
                    aria-label={t("oats.conversation.finish")}
                    className={cn(
                      "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                      "transition-transform [transition-duration:var(--motion-base)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    <ListeningPulse state="live" size="sm" />
                    <WheatPerch />
                  </button>
                  {/* An actual heading, not a paragraph a comment calls one.
                    Every other view has an `h1`; a screen-reader user
                    navigating the live surface by heading found nothing on the
                    one surface the product exists for. The visible text is the
                    clock; the name of the screen is for the a11y tree. */}
                  <h1 className="font-mono text-2xl font-normal tabular-nums tracking-[-0.02em] text-muted-foreground">
                    <span className="sr-only">{t("oats.conversation.listening")} </span>
                    {clock(elapsed)}
                  </h1>
                  {/* Beside the clock, because a mark is a time: "this one".
                      It carries the same ink caret it leaves under the trace,
                      so what it did is visible where it did it. In both
                      compositions — it is the reader's hand, not evidence to
                      hide. */}
                  <button
                    type="button"
                    onClick={() => void mark()}
                    aria-label={t("oats.conversation.markLabel")}
                    aria-keyshortcuts="M"
                    title={`${t("oats.conversation.markLabel")} (M)`}
                    className={cn(
                      "inline-flex min-h-6 items-center gap-1.5 self-center rounded-sm text-sm",
                      "transition-colors [transition-duration:var(--motion-instant)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      markedAt !== null
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <svg aria-hidden="true" width="8" height="7" viewBox="0 0 8 7">
                      <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
                    </svg>
                    {markedAt !== null
                      ? t("oats.conversation.marked")
                      : t("oats.conversation.mark")}
                  </button>
                </div>
                {/* No `aria-pressed`.

                    It was there alongside a label that states the *action*, and
                    the two encodings contradicted each other: in detailed a
                    screen reader said "Hide what was said, toggle button,
                    pressed" — asserting that hiding was engaged at the moment the
                    words were on screen. A control may say what it will do or say
                    what is true, not both in opposite directions. The name states
                    it: "Show what was said" is only ever offered when they are
                    hidden, so the current value is unambiguous from the name
                    alone, and the name is what a screen reader reads first.

                    The underline is the only affordance saying this is a control
                    rather than a sentence, so it is drawn in `muted-foreground`
                    (5.19:1 on paper, 6.33:1 on charcoal). At `border` it measured
                    1.24:1, under the 3:1 this project holds control indicators
                    to. */}
                <button
                  type="button"
                  onClick={() => setDetail(toggleConversationDetail(detail))}
                  className={cn(
                    // `text-sm`, the §5 step for secondary UI labels. At
                    // `text-xs` this was 12px sans — not a step in the scale at
                    // all (12/16 is the mono caption step) and the smallest text
                    // on a surface where it is the only control label.
                    "mt-5 self-start rounded-sm text-sm text-muted-foreground",
                    "underline decoration-muted-foreground underline-offset-[5px]",
                    "transition-colors [transition-duration:var(--motion-instant)]",
                    "hover:text-foreground hover:decoration-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  {detailed
                    ? t("oats.conversation.showClean")
                    : t("oats.conversation.showDetailed")}
                </button>
              </div>

              {/* The echo line is gone. It existed to prove something had been
                  heard, one line at a time — and the detected dialogue proves
                  the same thing with the paragraph, verbatim. Measured with one
                  live segment, the echo and the newest turn carried identical
                  text on the same screen. Clean forbids it (it rewrites itself
                  whenever anyone speaks) and Detailed no longer needs it, so it
                  has no composition left to live in. */}
              {/* Said plainly rather than asked. Oats resumed a recent conversation
                instead of stopping to check, because the check would have cost
                the first thing anybody said. */}
              {/* And a way out of it. Resuming without asking is the right
                  default — the question would cost the first thing anybody says
                  — but it was silently merging into a conversation that ended up
                  to half an hour ago with no way to say "this is a different
                  one". The notice is the place to put that. */}
              {continuingFrom && (
                <p className="mt-1.5 flex items-baseline gap-3 font-mono text-xs text-muted-foreground">
                  <span>{t("oats.conversation.continuing", { title: continuingFrom })}</span>
                  <QuietAction
                    label={t("oats.conversation.notAContinuation")}
                    onClick={() => {
                      void (async () => {
                        await stopRecording();
                        await startFresh();
                      })();
                    }}
                  />
                </p>
              )}

              {/* The contour — the record being written (DESIGN.md §9.8). Every
                part of it is a measurement of this conversation, which is the
                whole reason it replaced a landscape. */}
              {/* Viewport-relative, because the head was fixed and the band
                  was the only thing that could give. Measured at 600x400 (200%
                  zoom of the shipped default) the band collapsed to 14px, and
                  to 0px once the dead-microphone warning appeared, with the
                  page unable to scroll to recover it — so at 200% the detected
                  dialogue and the annotations did not exist. The contour is the
                  largest thing in the head and the one that degrades
                  gracefully: it is a shape, and a shorter shape is still the
                  shape. Clean gets more of it because there it is the whole of
                  the evidence. */}
              <ConversationContour
                contour={contour}
                className={detailed ? "mt-8" : "mt-10"}
                height={detailed ? "clamp(46px, 13vh, 104px)" : "clamp(56px, 17vh, 136px)"}
                focusedGroup={focusedGroup}
                label={contourLabel(contour, t)}
              />
            </div>

            {/* The questions, written against the trace above them. No legend
                here: a permanent key beside a live conversation is a tip that
                never goes away, on the one surface whose whole test is that
                nothing competes with the person in the room. The vocabulary is
                explained once, in the reading view, where there is time.

                `min-h-0` is what makes `overflow-y-auto` a scroller rather than
                a suggestion inside a flex column. */}
            {/* The fade is the scroll cue: the band clips, and a hard edge made
                a sliced annotation look like a short one. `mask-image` costs no
                element and no paint of its own. */}
            {/* The band, and it holds two regions rather than one scroller.

                Round 1 stacked an unbounded transcript above the annotations in
                a single scroller, which un-docked the question card from the
                contour: measured at 40 turns the first annotation's top was at
                y=2667 and receded ~57px with every finalized segment, so §9.2's
                "directly under the contour" — the surface the product is judged
                on — was unreachable during a live conversation. The annotations
                keep their place under the trace; the dialogue takes what is left
                and scrolls inside itself.

                The rail is mounted here unconditionally and in the same position
                in both compositions. Rendering it from two branches put it at
                two different child indices, so React unmounted and remounted it
                on every switch, its `spoken` set came back empty, and a blind
                user pressing the switch once was told three already-heard
                questions had just arrived. */}
            <div
              className={cn(
                "flex min-h-0 flex-col",
                // Only Detailed has anything to put here, and only Detailed
                // needs the space. In Clean the band holds the announcing rail
                // and nothing else, so claiming `flex-1` there was what kept
                // the composition pinned to the top.
                detailed && "flex-1 [@media(max-height:640px)]:min-h-[13rem]"
              )}
            >
              {/* The ceiling belongs on the wrapper, which is the flex child of
                  the band. On the inner scroller it resolved against a wrapper
                  of its own auto height, so "half the band" became half of
                  itself and one card measured 35px of a 68px list. */}
              <div
                className={cn(
                  "group relative flex min-h-0 shrink-0 flex-col",
                  detailed ? "max-h-[52%]" : "max-h-0"
                )}
              >
                <div
                  ref={bandRef}
                  onScroll={measureBand}
                  className={cn(
                    // `shrink-0` with a ceiling, never a shrinkable box.
                    //
                    // Flex distributes shrink in proportion to each child's
                    // *content* size, and the transcript's content is thousands
                    // of pixels — so a shrinkable annotations band lost the whole
                    // negotiation as the conversation ran. Measured before this
                    // fix at 1200x800 with two cards: band 122px at 2 turns, 39px
                    // at 20, 21px at 40, 7px at 120 — and **zero visible pixels**
                    // of the first card past 40 turns, its rect sitting entirely
                    // below a wrapper that had collapsed above it. Three minutes
                    // into a conversation the surface silently stopped showing the
                    // questions it had caught. The dialogue takes the *remainder*
                    // (`flex-1 basis-0`) instead of bidding with its content.
                    // Half the band at most (the ceiling is on the wrapper):
                    // past that the annotations start eating the dialogue they
                    // are supposed to sit beside.
                    "min-h-0",
                    // A zero-height scroller is keyboard-focusable in Chromium, so
                    // the closed band became a tab stop in the *default*
                    // composition — no focus ring anywhere on screen, and an AX
                    // name read from the stale announcement text. Closed, it has
                    // nothing to scroll, so it does not get to be a scroller.
                    detailed ? "overflow-y-auto" : "overflow-hidden"
                  )}
                >
                  <ConversationSignalRail onFocus={setFocusedGroup} announceOnly={!detailed} />
                </div>
                {/* Beside the scroller, never a mask on it: a mask clips the
                  focus ring of whatever it is applied to. */}
                <ScrollFade edges={detailed ? bandFaded : { top: false, bottom: false }} />
              </div>

              {detailed && (
                <ConversationDialogue
                  className={cn(
                    "min-h-[4.5rem] flex-1 basis-0",
                    // The rule separates the annotations from the transcript.
                    // With no question asked yet there is nothing above it, and
                    // a full-width line over 45px of blank paper separates
                    // nothing (§1).
                    cardCount > 0 ? "mt-5 border-t border-border/40 pt-4" : "mt-2"
                  )}
                />
              )}
            </div>

            {/* The foot is pinned, but it is not allowed to eat the band.
            
                It was `shrink-0` with no bound, so a long conversation's open
                threads squeezed the annotations to zero — measured: twelve
                expanded threads left the band at 0px with every question card
                gone, and fourteen pushed the foot's own contents to y=1007 in a
                window that does not scroll. A third of the surface is the most
                the reminder may take, and it scrolls inside that. */}
            <div className="flex max-h-[34%] shrink-0 flex-col overflow-y-auto pb-6">
              {/* The microphone went flat for long enough that the room being
                  quiet is the less likely explanation. Said once, quietly,
                  while there is still time to fix it — not discovered at the
                  end when the recording is already gone. It is pinned here so
                  a busy conversation can never push it out of sight. */}
              {micSilentSince !== null && (
                <p className="mb-4 max-w-sm text-xs leading-5 text-foreground">
                  {t("oats.conversation.micSilent")}
                </p>
              )}
              {/* The recording is not reaching disk.
              
                  Same weight and same place as the dead microphone, because it
                  is the same class of problem: something that will cost you the
                  conversation, said while there is still time to do something
                  about it. It says how much is at risk, because "saving failed"
                  is a status and "the last nine minutes are not saved" is
                  something a person can act on. */}
              {atRisk.atRisk && (
                <p className="mb-4 max-w-sm text-xs leading-5 text-foreground">
                  {t("oats.conversation.notSaving", { count: atRisk.unsavedTurns })}
                </p>
              )}
              {/* Sound is arriving and nothing is being transcribed. The pulse
                  breathes and the clock runs either way, so without this the
                  first sign is an empty transcript at the end. */}
              {stalled.stalled && (
                <p className="mb-4 max-w-sm text-xs leading-5 text-foreground">
                  {t("oats.conversation.notTranscribing")}
                </p>
              )}
              {/* Detailed only. The stack is a standing list of unfinished
                  business, and reading it is thinking about the conversation
                  rather than having it. The warning above is not optional in
                  either composition: it is the reliability promise. */}
              {detailed && (
                <>
                  {/* Beside the stack, never instead of it. The list is the
                      readable version of the same data and the one that works
                      under four subjects; the map is for pointing at something
                      raised twenty minutes ago. */}
                  <LiveThreadMap />
                  <OpenThreadStack
                    threads={openThreads}
                    suggestions={suggestions}
                    speaking={speaking}
                  />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Said once, when a recording has just finished. `wasRecording`
                keeps it from announcing on every visit to an idle screen. */}
            <p aria-live="polite" role="status" className="sr-only">
              {justStopped ? t("oats.conversation.statusStopped") : ""}
            </p>

            {/* The seed is the button, and the button becomes the pulse. One
                object in two states rather than a control and an unrelated
                indicator: press the husked oat and it starts breathing
                (DESIGN.md §9.1, §9.2). */}
            <button
              type="button"
              disabled={starting}
              onClick={begin}
              aria-label={t("oats.conversation.record")}
              className={cn(
                "group relative flex h-28 w-28 items-center justify-center rounded-full",
                "transition-transform [transition-duration:var(--motion-base)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "hover:scale-[1.04] active:scale-[0.98]"
              )}
            >
              <ListeningPulse state="idle" size="lg" />
              {/* Sits on the seed until you press it. Field mode only; renders
                  null otherwise, and never intercepts the press. */}
              <WheatPerch />
            </button>

            <h1
              className={cn(
                "mt-9 max-w-lg text-center text-foreground",
                "text-[2.5rem] font-medium leading-[1.1] tracking-[-0.03em]"
              )}
            >
              {t("oats.conversation.title")}
            </h1>
            <p className="relative mt-4 max-w-md text-center text-sm leading-6 text-muted-foreground">
              {starting ? t("oats.conversation.preparing") : t("oats.conversation.subtitle")}
            </p>
            {/* The app teaches its own shortcut. This is the highest-value line on
              the screen for somebody who has not learned it yet, because after
              they have, they will never open this window to record again. */}
            {shortcut && (
              <p className="relative mt-7 text-center font-mono text-xs text-muted-foreground">
                {shortcut}
              </p>
            )}

            {/* The last entry in the ledger.
            
                Without it this screen is a centred hero on cream — the field
                used to be its whole identity, and deleting the field without
                replacing it would leave a blank page pretending to be a
                product. What belongs here is not decoration but the most recent
                true thing Oats knows: what you last recorded, and its shape.
                It is also the answer to "did that actually save?", which is the
                question somebody actually has when they open this window. */}
            <LastEntry />
          </>
        )}

        {!recording && nothingHeard && (
          <p className="relative mt-6 max-w-sm text-center text-xs leading-5 text-muted-foreground">
            {t("oats.conversation.nothingHeard")}
          </p>
        )}

        {/* Said before the conversation, in the place the eye already is. One line,
          and only the first problem: a list of three is a configuration report,
          and somebody about to sit down with another person will read one line.
          Ink rather than husk when it blocks — this is the app failing loudly at
          the start, which is the whole point of checking here. */}
        {!recording && !nothingHeard && preflight.problem && (
          <p
            className={cn(
              "relative mt-6 max-w-sm text-center text-xs leading-5",
              preflight.blocking ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {t(`oats.preflight.${preflight.problem}`)}
          </p>
        )}
      </section>
    </>
  );
}

/**
 * Tells the main process when a conversation is running.
 *
 * Headless, and mounted beside the other two headless mounts in the workspace
 * shell rather than inside the Conversation surface: the report must keep
 * flowing while the user is reading Intelligence or changing Settings, and the
 * recording it describes outlives every one of those views.
 */
function ConversationStateBridge() {
  const recording = useMeetingRecordingStore((s) => s.isRecording);
  // Stamped here rather than in the store: the store sets `isRecording: false`
  // from five different places, and a start time that four of them cleared would
  // be a timer that occasionally lied. This component sees every transition.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (recording && startedAt.current === null) startedAt.current = Date.now();
    if (!recording) startedAt.current = null;
    window.electronAPI?.reportConversationState?.({
      recording,
      startedAt: startedAt.current,
    });
  }, [recording]);
  return null;
}

// Under four topics there is no graph worth drawing — a three-node graph looks
// broken, not minimal — so the linear thread list stands in. It is also the
// keyboard-and-screen-reader equivalent view, not a degraded one (DESIGN.md §9.4).
const MIN_GRAPH_TOPICS = 4;

function readTopicSnapshot(raw: unknown): ConversationTopicSnapshot | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    // Records stored before `snapshot({ final: true })` carry the topic that was
    // current at stop as `live`, which the graph draws gold. Nothing in a record
    // is being spoken; unresolved is the most that is known about it.
    for (const node of parsed.nodes) if (node?.state === "live") node.state = "open";
    return parsed as ConversationTopicSnapshot;
  } catch {
    return null;
  }
}

// The secondary lens, deliberately.
//
// A force-directed graph is a good answer to "how did this conversation move?"
// and a bad default payoff for opening a record — it is the shape of the tool
// rather than the shape of what was said. The contour at the head of the
// document carries the everyday reading; this is here for the question that
// genuinely needs a graph.
function ConnectionsView({
  note,
  events,
  onReload,
}: {
  note: NoteItem;
  events: ConversationEvent[];
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [selectedTopic, setSelectedTopic] = useState<ConversationTopicNode | null>(null);
  const searchBaseUrl = useSettingsStore((s) => s.conversationAideSearchBaseUrl);
  const snapshot = useMemo(() => readTopicSnapshot(note.conversation_topics), [note]);
  const graphBox = useRef<HTMLDivElement | null>(null);
  const graphHeight = useRoomBelow(graphBox);

  if (!snapshot || snapshot.nodes.length < MIN_GRAPH_TOPICS) {
    return (
      <ConversationGraph
        events={events}
        searchBaseUrl="https://www.google.com/search?q="
        onReload={onReload}
      />
    );
  }

  const topicQuestions = selectedTopic
    ? events.filter(
        (event) =>
          event.kind === "question" &&
          event.segmentIds.some((id) => selectedTopic.utteranceIds.includes(id))
      )
    : [];

  // Re-searching from a node goes through the same host-validated main-process
  // path as the live card — there is exactly one way out to the network.
  const research = (query: string) =>
    void window.electronAPI?.openConversationSearch?.({ eventId: null, query, searchBaseUrl });

  return (
    <div className="mt-7">
      {/* No box. The graph is the content, not a widget inside a panel, and a
          rounded border around it is exactly the chrome §1 rules out. Full
          column width so labels have somewhere to sit.

          Sized to the room left rather than to a constant. A fixed 26rem put the
          graph at 452–868 in an 800px window: 68px of it below the fold, on the
          one tab whose entire payload is a picture, and it is a picture you drag
          nodes around in — so the fix for "I cannot see the bottom" was to
          scroll the page out from under your own cursor.

          The room is measured, not estimated. `calc(100vh - 29rem)` assumed a
          head of one known height, and a title that wraps to two lines or a
          "left open last time" line made it taller: measured at 1200x800 the
          graph ended 16px below the window and cut its lowest label in half.
          The bounds keep it usable in a short window and stop it becoming a
          field in a tall one. */}
      <div ref={graphBox} className="w-full" style={{ height: graphHeight }}>
        <TopicGraph
          snapshot={snapshot}
          selectedId={selectedTopic?.id ?? null}
          onSelect={setSelectedTopic}
          layoutKey={`oats:topic-layout:${note.id}`}
        />
      </div>
      {/* The panel's *space* is permanent even though its content is not.
          
          Rendering it only on selection meant the first click inserted a block
          and pushed the graph up, and every click after that resized it —
          a topic with three questions is much taller than one with none — so
          moving between bubbles made the whole page jump under the cursor. The
          band is a fixed height that scrolls inside itself, so selecting
          anything moves nothing. Still no "select a topic to see…" placeholder:
          empty space is not an instruction. */}
      <div className="mt-6 h-44 overflow-y-auto border-t border-border/40 pt-5">
        {selectedTopic && (
          <aside>
            <>
              <p className="font-mono text-sm text-foreground">{selectedTopic.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("topicGraph.seconds", {
                  count: Math.max(1, Math.round(selectedTopic.durationMs / 1000)),
                })}
                {selectedTopic.returns > 0 &&
                  ` · ${t("topicGraph.returned", { count: selectedTopic.returns })}`}
              </p>
              <ul className="mt-4 space-y-3">
                {topicQuestions.map((question) => (
                  <li key={question.id}>
                    <p className="font-mono text-xs leading-snug text-foreground/70">
                      {question.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => research(question.text)}
                      // Ink. §9.4's "gold appears exactly twice" is one selected node and one
                      // re-search action — but this list renders a link per question, so on a
                      // topic with three questions the accent multiplied. The selected node
                      // keeps the gold; the links are reading text (§3).
                      className="mt-1 inline-flex items-center gap-1 rounded-sm text-[11px] text-muted-foreground underline underline-offset-2 transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Search size={10} />
                      {t("topicGraph.search")}
                    </button>
                  </li>
                ))}
                {!topicQuestions.length && (
                  <li className="text-xs text-muted-foreground">{t("topicGraph.noQuestions")}</li>
                )}
              </ul>
            </>
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * How much of the window is left below an element, in px, within bounds.
 *
 * Measured against the element's position in its scrolling column rather than
 * on screen, so it does not change as the reader scrolls. Re-measured when the
 * window is resized and never otherwise — nothing here runs per frame.
 */
function useRoomBelow(
  ref: React.RefObject<HTMLElement | null>,
  { min = 256, max = 544, clearance = 24 } = {}
): number {
  const [room, setRoom] = useState(min);
  useLayoutEffect(() => {
    const measure = () => {
      const element = ref.current;
      if (!element) return;
      let scroller: HTMLElement | null = element.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
        scroller = scroller.parentElement;
      }
      const top = element.getBoundingClientRect().top + (scroller?.scrollTop ?? 0);
      const next = Math.round(Math.min(max, Math.max(min, window.innerHeight - top - clearance)));
      setRoom((previous) => (previous === next ? previous : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, min, max, clearance]);
  return room;
}

// Which of the three Intelligence views is showing. Drives the cross-fade key.
type IntelligenceView = "list" | "reading" | "map";

function IntelligenceViews({
  view,
  setView,
  reading,
  setReading,
}: {
  view: "list" | "map";
  setView: (view: "list" | "map") => void;
  reading: boolean;
  setReading: (reading: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const notes = useNotes();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<DetailTab>("summary");
  // The lifetime graph is a lens on the same list, not a fourth surface — the
  // product has exactly three, and "what do I keep coming back to?" is a question
  // about your conversations, so it belongs in Intelligence.
  const [query, setQuery] = useState("");
  // The auto-generated title is usually right and occasionally wrong. Editing it
  // in place beats making the user hunt for where a title can be changed.
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const selected = notes.find((note) => note.id === selectedId) ?? notes[0] ?? null;
  const { events, reload } = useConversationEvents(selected?.id ?? null);

  // Sent by the Conversation surface's last-entry row (see the shell). Both
  // halves are needed: the listener covers a mounted Intelligence, and the
  // consume call covers the cold first visit, where the press is what mounted
  // this component and the pushed event predates the listener.
  useEffect(() => {
    const open = (noteId: number) => {
      setSelectedId(noteId);
      setTab("summary");
      setReading(true);
    };
    const onSelect = (event: Event) => {
      const noteId = (event as CustomEvent<number>).detail;
      if (Number.isFinite(noteId)) open(noteId);
    };
    window.addEventListener("oats-select-note", onSelect);
    const pending = consumePendingNote();
    if (pending !== null) open(pending);
    return () => window.removeEventListener("oats-select-note", onSelect);
  }, [setReading]);

  useEffect(() => {
    void initializeNotes("meeting", 100);
  }, []);

  // The recall hotkey's landing: the list, with recall focused. The input is
  // unconditional — see the comment at its markup for why the old
  // four-conversation gate was removed.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const focusSearch = () => {
      setReading(false);
      setView("list");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    };
    window.addEventListener("oats-focus-search", focusSearch);
    return () => window.removeEventListener("oats-focus-search", focusSearch);
  }, [setReading, setView]);

  // Find in this conversation. `null` is closed; a string is the find line,
  // open, with what is typed in it. "Search what you are looking at": in the
  // list `/` searches conversations, in a record it finds inside that record —
  // the global recall hotkey keeps its own event and always means the list.
  const [finding, setFinding] = useState<string | null>(null);
  const [findAt, setFindAt] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setFinding(null);
    setFindAt(0);
  }, [selectedId, reading]);
  useEffect(() => setFindAt(0), [finding]);

  // Escape: one step back towards the list, which is where every path in here
  // starts — and an open find line is the nearest step. Read from refs so the
  // listeners are registered once.
  const backState = useRef({ reading, view, finding });
  backState.current = { reading, view, finding };
  useEffect(() => {
    const back = () => {
      if (backState.current.finding !== null) setFinding(null);
      else if (backState.current.reading) setReading(false);
      else if (backState.current.view === "map") setView("list");
    };
    const find = () => {
      if (!backState.current.reading) {
        window.dispatchEvent(new Event("oats-focus-search"));
        return;
      }
      setTab("transcript");
      setFinding((current) => current ?? "");
      requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    };
    window.addEventListener("oats-intelligence-back", back);
    window.addEventListener("oats-find", find);
    return () => {
      window.removeEventListener("oats-intelligence-back", back);
      window.removeEventListener("oats-find", find);
    };
  }, [setReading, setView]);
  useEffect(() => {
    if (notes.length && selectedId == null) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  // Local filter over title, summary, and transcript. Everything is already in
  // memory, so this needs no index and no IPC — and it is the only way to find a
  // conversation by what was said in it rather than by scrolling.
  const literalNotes = useMemo(() => {
    const needle = foldText(query.trim());
    if (!needle) return notes;
    return notes.filter((note) => foldedNote(note).includes(needle));
  }, [notes, query]);

  // What the local vector index thinks the question is about.
  //
  // Substring matching answers "where did somebody say this word"; it cannot
  // answer "what did we decide about pricing", which is the question people
  // actually have about their own conversations. The index is already in the
  // product — Qdrant plus a local MiniLM, with a keyword fallback in the main
  // process — and Intelligence was the one surface not using it.
  //
  // It runs *behind* the literal filter, never instead of it: literal results
  // keep their order and their place at the top, and these are appended as
  // `related`. It is also entirely optional — no index, no network, no model,
  // and the search still works exactly as it did.
  const [semanticNotes, setSemanticNotes] = useState<NoteItem[]>([]);
  const [landedOnSegment, setLandedOnSegment] = useState<string | null>(null);
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 3) {
      setSemanticNotes([]);
      return undefined;
    }
    let cancelled = false;
    // Debounced: this crosses IPC and embeds the query, so firing it per
    // keystroke would queue a model call behind every letter.
    const timer = window.setTimeout(() => {
      void Promise.resolve(window.electronAPI?.semanticSearchNotes?.(needle, 8))
        .then((found) => {
          if (!cancelled && Array.isArray(found)) setSemanticNotes(found);
        })
        .catch(() => {
          if (!cancelled) setSemanticNotes([]);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const recalled = useMemo(
    () =>
      query.trim()
        ? mergeRecall(literalNotes, semanticNotes)
        : literalNotes.map((note) => ({ note, related: false })),
    [literalNotes, semanticNotes, query]
  );
  const visibleNotes = useMemo(() => recalled.map((entry) => entry.note), [recalled]);

  // What the previous conversation on this subject left open. The lifetime graph
  // already knows which conversations share a subject; this puts that knowledge
  // where it is actually useful — at the top of the one you are reading.
  const carriedOver = useMemo(() => {
    if (!selected) return null;
    const current = readTopicSnapshot(selected.conversation_topics);
    if (!current) return null;
    const earlier = notes
      .filter((note) => note.id !== selected.id && note.conversation_topics)
      .filter((note) => new Date(note.created_at) < new Date(selected.created_at))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    for (const note of earlier) {
      const past = readTopicSnapshot(note.conversation_topics);
      if (!past) continue;
      const shared = past.nodes.filter((pastNode) =>
        current.nodes.some(
          (node) => topicOverlap(node.words, pastNode.words) >= CARRY_OVER_THRESHOLD
        )
      );
      if (!shared.length) continue;
      const left = past.nodes.filter((node) => node.state === "open" || node.state === "dropped");
      if (!left.length) continue;
      return { note, open: left.slice(0, 3) };
    }
    return null;
  }, [selected, notes]);

  const commitRename = async () => {
    setRenaming(false);
    const title = draftTitle.trim();
    if (!selected || !title || title === selected.title) return;
    await window.electronAPI?.updateNote?.(selected.id, { title });
    await initializeNotes("meeting", 100);
  };

  const summary = selected?.enhanced_content || t("oats.intelligence.preparing");

  // The opened conversation's own contour: its speech, its questions with the
  // verdicts they actually reached, and its topics — all from the record rather
  // than from the live session, which does not outlive the recording.
  const selectedSegments = useMemo(
    () => parseSegments(selected?.transcript ?? null),
    [selected?.transcript]
  );
  const selectedTopics = useMemo(
    () => readTopicSnapshot(selected?.conversation_topics ?? null)?.nodes ?? [],
    [selected?.conversation_topics]
  );
  const selectedMoments = useMemo(
    () => parseMoments(selected?.conversation_marks ?? null),
    [selected?.conversation_marks]
  );
  const findQuery = finding?.trim() ?? "";
  const findCount = useMemo(() => {
    if (!findQuery) return 0;
    if (!selectedSegments.length) {
      return findMatches(transcriptText(selected?.transcript ?? null, t), findQuery).length;
    }
    return selectedSegments.reduce(
      (total, segment) => total + findMatches(String(segment.text ?? ""), findQuery).length,
      0
    );
  }, [findQuery, selectedSegments, selected?.transcript, t]);
  const storedContour = useStoredContour(selectedSegments, events, selectedTopics, selectedMoments);
  const selectedSpan = formatSpan(conversationSpanMs(selectedSegments), { locale: i18n.language });

  // Three regions — rail, list, detail — is a mail client, and DESIGN.md §1 is
  // explicit that a surface needing a third region is really two screens. So the
  // list *is* the screen until you open something, and then the reading view
  // replaces it. Nothing is ever half-visible in a column you are not using.
  if (view === "map") {
    return (
      <section key="map" className="oats-surface oats-enter relative flex min-h-0 flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-3xl shrink-0 items-baseline justify-between px-8 pt-4">
          <h1 className="text-2xl font-medium tracking-[-0.03em]">{t("lifetime.title")}</h1>
          <BackLink onClick={() => setView("list")} label={t("lifetime.backToList")} />
        </header>
        {/* Full-bleed: the graph is the content, not a panel inside it. */}
        <div className="relative mt-6 min-h-0 flex-1">
          <LifetimeGraph
            notes={notes}
            onOpen={(noteId) => {
              setSelectedId(noteId);
              setTab("summary");
              setView("list");
              setReading(true);
            }}
          />
        </div>
      </section>
    );
  }

  if (reading && selected) {
    return (
      <section
        key="reading"
        className="oats-surface oats-enter relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-[68ch] px-8 pb-16 pt-4">
          <BackLink onClick={() => setReading(false)} label={t("oats.intelligence.backToList")} />

          {/* When, in full, and for how long — the bearings a record is
              found again by. */}
          <p className="mt-8 font-mono text-xs text-muted-foreground">
            {ledgerDateLong(selected.created_at, { locale: i18n.language })}
            {selectedSpan && ` · ${selectedSpan}`}
          </p>
          {renaming ? (
            <input
              autoFocus
              aria-label={t("oats.intelligence.renameHint")}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitRename();
                if (event.key === "Escape") setRenaming(false);
              }}
              className="mt-2 w-full rounded-sm border-b border-border bg-transparent pb-1 text-3xl font-medium tracking-[-0.03em] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          ) : (
            // A heading you can rename is still a heading; the control that
            // makes it operable goes inside it. A click handler on the <h1>
            // itself was mouse-only — no focus ring, no Enter, and nothing a
            // screen reader would announce as actionable.
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em]">
              <button
                type="button"
                title={t("oats.intelligence.renameHint")}
                onClick={() => {
                  setDraftTitle(selected.title || "");
                  setRenaming(true);
                }}
                className="cursor-text rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {selected.title || t("oats.untitled")}
              </button>
            </h1>
          )}

          {/* What the last conversation on this subject left unfinished. Shown
              once, at the top, because that is the moment it is useful. */}
          {carriedOver && (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {t("oats.intelligence.carriedOver")}{" "}
              {carriedOver.open.map((node, index) => (
                <span key={node.id}>
                  {index > 0 && ", "}
                  <span className="font-mono text-foreground/70">{node.label}</span>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSelectedId(carriedOver.note.id);
                  setTab("summary");
                }}
                className="ml-2 underline underline-offset-2 transition-opacity [transition-duration:var(--motion-instant)] hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("oats.intelligence.openPrevious")}
              </button>
            </p>
          )}

          {/* The conversation's own shape, at the head of its record: how the
              talking was distributed, where the subject turned, what was asked
              and how settled it came out, and where the room went back to
              something. It is the one part of this document that is not words,
              and it is derived entirely from the words. */}
          {/* And it is the way into the record: a click on the trace opens
              the transcript at that moment, and the hairline under the
              pointer says when that was before you press. */}
          <ConversationContour
            contour={storedContour}
            className="mt-8"
            height={92}
            label={contourLabel(storedContour, t)}
            onPick={(time) => {
              const segment = momentSegment({ at: time }, selectedSegments);
              setLandedOnSegment(segment?.id != null ? String(segment.id) : null);
              setTab("transcript");
            }}
            pickLabel={(time) => clock(Math.max(0, time - (storedContour.start ?? time)))}
          />
          {/* The key lives here and only here: the reading view is where a
              contour is studied rather than glanced at, and where there is time
              to learn what the marks mean. */}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t("oats.conversation.contourLegend")}
          </p>

          {/* Text links, not tabs. A tab bar is a box drawn around a choice that
              needs no box (DESIGN.md §1). The three actions sit on the same line,
              pushed to the far side: they belong to what is being read, and a
              second row for them would be a third region (§1). */}
          <div className="mt-7 flex items-baseline justify-between gap-6">
            <div className="flex gap-5">
              {(["summary", "transcript", "connections"] as DetailTab[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  aria-current={tab === item ? "true" : undefined}
                  className={cn(
                    "rounded-sm text-sm transition-colors",
                    "[transition-duration:var(--motion-instant)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tab === item
                      ? "text-foreground underline decoration-foreground underline-offset-[6px]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`oats.intelligence.tabs.${item}`)}
                </button>
              ))}
            </div>
            <ConversationActions
              note={selected}
              tab={tab}
              onDeleted={async () => {
                setReading(false);
                setSelectedId(null);
                await initializeNotes("meeting", 100);
              }}
            />
          </div>

          {/* The summary is markdown — the intelligence pipeline emits headings
              and bold. Rendering it as preformatted text put literal ** around
              every thread name, on the one payload Intelligence exists to show. */}
          {tab === "summary" && (
            <>
              {/* What the reader marked, first: it is the one part of the
                  record that is theirs rather than the room's or the model's. */}
              <MarkedMoments
                note={selected}
                moments={selectedMoments}
                segments={selectedSegments}
                onOpenTurn={(segmentId) => {
                  setLandedOnSegment(segmentId);
                  setTab("transcript");
                }}
              />
              {/* Certain first, inferred second. */}
              <ConversationReview
                events={events}
                topics={selectedTopics}
                onOpenTurn={(segmentId) => {
                  setLandedOnSegment(segmentId);
                  setTab("transcript");
                }}
              />
              <MarkdownRenderer
                content={summary}
                className="mt-7 text-[15px] leading-7 text-foreground"
              />
            </>
          )}
          {tab === "transcript" && finding !== null && (
            // The find line: a line, like every field on these surfaces, with
            // where you are among the matches beside it.
            <div className="mt-7 flex items-baseline gap-4 border-b border-border-control pb-1.5">
              <input
                ref={findInputRef}
                // Mounting is the first open, and the frame callback in the
                // `oats-find` handler runs before this commits; it only covers a
                // second `/` while the line is already open.
                autoFocus
                type="text"
                value={finding}
                onChange={(event) => setFinding(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setFinding(null);
                  } else if (event.key === "Enter" && findCount > 0) {
                    event.preventDefault();
                    setFindAt((at) => (at + (event.shiftKey ? findCount - 1 : 1)) % findCount);
                  }
                }}
                aria-label={t("oats.find.label")}
                placeholder={t("oats.find.label")}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-sm bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <span
                aria-live="polite"
                className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
              >
                {findQuery
                  ? findCount
                    ? t("oats.find.count", { current: findAt + 1, total: findCount })
                    : t("oats.find.none")
                  : ""}
              </span>
              <QuietAction label={t("oats.find.close")} onClick={() => setFinding(null)} />
            </div>
          )}
          {tab === "transcript" && (
            <TranscriptView
              note={selected}
              query={findQuery || query}
              scrollToId={landedOnSegment}
              events={events}
              moments={selectedMoments}
              currentMatch={findQuery && findCount ? findAt : null}
            />
          )}
          {tab === "connections" && (
            <ConnectionsView key={selected.id} note={selected} events={events} onReload={reload} />
          )}
        </div>
      </section>
    );
  }

  return (
    <section key="list" className="oats-surface oats-enter relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[68ch] px-8 pb-16 pt-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-medium tracking-[-0.03em]">
            {t("oats.intelligence.listTitle")}
          </h1>
          {notes.length > 0 && (
            <BackLink onClick={() => setView("map")} label={t("lifetime.viewMap")} />
          )}
        </div>

        {/* Recall is the first action on this surface, and it is here from the
            first conversation.
            
            It used to appear only above four conversations, on the theory that
            a short list needs no filter. That is true of a *filter* and false
            of the thing this actually is: the answer to "what did that
            candidate say about equity?", which is the reason to keep a record
            at all. Hiding it until the fifth conversation taught every new user
            that Oats cannot do the one thing it is for.
            
            A line rather than a box — a bordered input is form furniture, and
            this is the page's opening move. */}
        <input
          ref={searchInputRef}
          type="search"
          aria-label={t("oats.intelligence.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("oats.intelligence.searchPlaceholder")}
          className="mt-6 w-full rounded-sm border-b border-border bg-transparent pb-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />

        {/* Recall is the surface's first action, and filtering it said nothing:
            a screen-reader user typed and had to tab into the list to find out
            whether anything matched. */}
        <p aria-live="polite" role="status" className="sr-only">
          {/* The same three-way split the markup below computes.
          
              It used to fall to `onlyRelated` whenever the literal filter was
              empty — including when there were no results at all — so a
              screen-reader user searching for something Oats has never heard was
              told "these conversations are about the same subject" while the
              screen said "Nothing matches that". §9.0 binds assistive output to
              be the same surface, not a lesser one. */}
          {!query.trim()
            ? ""
            : literalNotes.length
              ? // The count is the *literal* matches, not the row count.
                //
                // It announced `visibleNotes.length` — literal plus related — so
                // a query with one real hit and two index guesses told a
                // screen-reader user "3 conversations match", and opening the
                // second found nothing containing the word. Same over-claim as
                // the zero-result branch, surviving in the mixed case because
                // the corpus I measured against returned no guesses at all.
                // Two sentences, not a middot.
                //
                // This region is `sr-only`: it has no visual reader at all, so a
                // purely visual separator is doing the work of a sentence
                // boundary. A reader that omits U+00B7 says "one conversation
                // matches one more may be related", which garden-paths into a
                // wrong count — the exact ambiguity this branch was rewritten to
                // remove — and one that speaks it injects "middle dot" into a
                // status line. The middot stays where it is read by eye.
                `${t("oats.intelligence.searchResults", { count: literalNotes.length })}.${
                  recalled.length > literalNotes.length
                    ? ` ${t("oats.intelligence.plusRelated", {
                        count: recalled.length - literalNotes.length,
                      })}.`
                    : ""
                }`
              : recalled.length
                ? t("oats.intelligence.onlyRelated")
                : t("oats.intelligence.noMatches")}
        </p>

        {/* Nothing was said in those words.
        
            `related` results are kept when the literal search finds nothing —
            that is the case semantic recall exists for, and suppressing it
            exactly when it is the only thing that could help would defeat the
            feature. But the page must not imply a match it does not have: with
            no literal hit, every row below is the index's guess, and the line
            says so before the reader reads them as findings. */}
        {query.trim() && !literalNotes.length && recalled.length > 0 && (
          <p className="mt-8 text-[13px] leading-6 text-muted-foreground">
            {t("oats.intelligence.onlyRelated")}
          </p>
        )}

        {visibleNotes.length ? (
          <div className="mt-8">
            {recalled.map(({ note, related }) => (
              <button
                key={note.id}
                onClick={() => {
                  setSelectedId(note.id);
                  // Land where the match is. Opening every result on the summary
                  // meant that finding a conversation by something said in it
                  // dropped you at the top of a different document, with the
                  // sentence you searched for still to be hunted for by eye.
                  setTab(matchedTab(note, query, t));
                  // Which turn this result was about. A literal transcript match
                  // has one; a semantic suggestion does not, and gets null
                  // rather than a guess — landing somebody on a turn the search
                  // did not actually find is worse than landing them at the top.
                  setLandedOnSegment(findExcerpt(note, query)?.segmentId ?? null);
                  setReading(true);
                }}
                className={cn(
                  "group w-full border-b border-border/40 py-5 text-left",
                  "transition-colors [transition-duration:var(--motion-instant)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <div className="flex items-baseline justify-between gap-6">
                  <p className="truncate text-[15px] font-medium text-foreground">
                    {note.title || t("oats.untitled")}
                  </p>
                  <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {ledgerDate(note.created_at, { locale: i18n.language })}
                  </p>
                </div>
                {/* The passage that matched, and where it came from.
                
                    The row used to show the same first-160-characters preview
                    whether you had searched for a word somebody said, a word
                    Oats wrote, or nothing at all — so a search answered with a
                    summary of a different part of the conversation. An evidence
                    tool has to show you the thing you searched for, and say
                    whether it was *said* or *inferred*. */}
                {/* The chip stays on every guessed row, including when they
                    are all guesses.
                
                    Suppressing it read cleaner and measured worse: the line
                    that replaced it scrolls away — 595px above the viewport with
                    eight results — leaving the only search state whose rows
                    carry no provenance at all. A label that travels with the row
                    beats a heading that does not, and `RecallExcerpt`'s contract
                    is that an evidence tool says whether a passage was said or
                    inferred. */}
                <RecallExcerpt note={note} query={query} related={related} />
                {/* Its own shape, in the margin of the list. Two conversations
                    of the same length and the same title still look different
                    here, because this is drawn from what was said in them. */}
                <NoteContourStrip note={note} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            // `.trim()`, like the announcement beside it: a first-run user who
            // types a space should see the empty state that tells them what to
            // do, not "Nothing matches that" for a search that never ran.
            line={query.trim() ? t("oats.intelligence.noMatches") : t("oats.intelligence.empty")}
            hint={query ? null : t("oats.intelligence.emptyHint")}
          />
        )}
      </div>
    </section>
  );
}

/**
 * A note's searchable text, folded once per note object.
 *
 * The filter runs on every keystroke over every conversation, and folding —
 * NFD, drop the marks, lowercase — over a hundred transcripts each time would
 * be the same work repeated for an answer that has not changed. A note object
 * is replaced whenever the note is, so a stale fold cannot outlive its text.
 */
const foldedNotes = new WeakMap<NoteItem, string>();
function foldedNote(note: NoteItem): string {
  let folded = foldedNotes.get(note);
  if (folded === undefined) {
    folded = [
      note.title,
      note.enhanced_content,
      note.transcript,
      // The reader's own notes on what they marked — the words they are most
      // likely to remember having written.
      ...parseMoments(note.conversation_marks ?? null).map((moment) => moment.note),
    ]
      .filter(Boolean)
      .map((field) => foldText(field))
      .join("\n");
    foldedNotes.set(note, folded);
  }
  return folded;
}

/** Which tab to open a search result on. The rule itself is in `conversationSearch`. */
function matchedTab(note: NoteItem, query: string, t: TFunction): DetailTab {
  return matchTarget(
    {
      title: note.title,
      summary: note.enhanced_content,
      transcript: transcriptText(note.transcript, t),
    },
    query
  );
}

/**
 * The moments the reader marked, quoted.
 *
 * Each is the words being said when "Mark" was pressed — a place in the
 * record, so pressing it opens the transcript there — with the time, and a note
 * that can be added here, afterwards, where there is time to write one. Nothing
 * to type during the conversation was the whole point of the mark.
 */
function MarkedMoments({
  note,
  moments,
  segments,
  onOpenTurn,
}: {
  note: NoteItem;
  moments: { id: string; at: number; note: string }[];
  segments: TranscriptSegment[];
  onOpenTurn: (segmentId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => setEditing(null), [note.id]);
  if (!moments.length) return null;
  const startedAt =
    segments.find((segment) => Number.isFinite(segment.timestamp))?.timestamp ?? moments[0].at;

  const write = async (next: { id: string; at: number; note: string }[]) => {
    if (JSON.stringify(next) === JSON.stringify(moments)) return;
    await window.electronAPI?.updateNote?.(note.id, { conversation_marks: JSON.stringify(next) });
    await initializeNotes("meeting", 100);
  };
  const save = async (id: string, text: string) => {
    setEditing(null);
    await write(setMomentNote(moments, id, text));
  };

  return (
    <section className="mt-7 border-l-2 border-border/60 pl-4">
      <h2 className="font-mono text-[11px] text-muted-foreground">{t("oats.review.marked")}</h2>
      <ul className="mt-3 space-y-3">
        {moments.map((moment) => {
          const segment = momentSegment(moment, segments);
          const time = clock(Math.max(0, moment.at - (startedAt as number)));
          return (
            <li key={moment.id}>
              <button
                type="button"
                onClick={() => onOpenTurn(segment?.id != null ? String(segment.id) : null)}
                disabled={!segment}
                className={cn(
                  "line-clamp-2 w-full rounded-sm text-left font-mono text-[13px] leading-6 text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  segment
                    ? "underline decoration-border underline-offset-[5px] hover:decoration-foreground"
                    : "cursor-default"
                )}
              >
                {segment ? String(segment.text ?? "").trim() : time}
              </button>
              <div className="mt-0.5 flex min-w-0 items-baseline gap-3 font-mono text-[11px] leading-5 text-muted-foreground">
                <span className="shrink-0 tabular-nums">{time}</span>
                {editing === moment.id ? (
                  <input
                    autoFocus
                    defaultValue={moment.note}
                    maxLength={280}
                    aria-label={t("oats.review.noteLabel", { time })}
                    spellCheck
                    onBlur={(event) => void save(moment.id, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditing(null);
                    }}
                    className="min-w-0 flex-1 rounded-sm border-b border-border bg-transparent font-sans text-[13px] text-foreground focus-visible:border-primary focus-visible:outline-none"
                  />
                ) : moment.note ? (
                  // The reader's own words, in the reader's voice — sans, not the
                  // machine's mono. Pressing them edits them.
                  <button
                    type="button"
                    onClick={() => setEditing(moment.id)}
                    aria-label={t("oats.review.noteLabel", { time })}
                    className="min-w-0 truncate rounded-sm text-left font-sans text-[13px] text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {moment.note}
                  </button>
                ) : (
                  <QuietAction
                    label={t("oats.review.addNote")}
                    ariaLabel={t("oats.review.noteLabel", { time })}
                    onClick={() => setEditing(moment.id)}
                  />
                )}
                {/* A press made by mistake is the reader's to take back. Not
                    evidence — a highlight — so no second press to confirm. */}
                {editing !== moment.id && (
                  <QuietAction
                    label={t("oats.review.removeMark")}
                    ariaLabel={t("oats.review.removeMarkLabel", { time })}
                    onClick={() => void write(removeMoment(moments, moment.id))}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * What the conversation certainly contained, above what a model wrote about it.
 *
 * The reading view opened on the summary — prose from a local 1.5B model that
 * CLAUDE.md is explicit "frequently does not" succeed — and that was the first
 * and only thing you saw. Underneath, Oats was already holding facts it knows
 * exactly: which questions were asked, how each came out, which it went and
 * searched, and which threads were left open. It showed none of them.
 *
 * So the certain part goes first and the inferred part follows. Ordering is the
 * argument: an evidence tool that leads with a summary is asking you to trust
 * the weakest thing on the page.
 *
 * It is a review, not a task manager (§1): no checkboxes, no owners, no due
 * dates, and nothing Oats had to guess. Each unresolved question is a *place* —
 * pressing it opens the transcript at the turn it was asked in.
 */
function ConversationReview({
  events,
  topics,
  onOpenTurn,
}: {
  events: ConversationEvent[];
  topics: ConversationTopicNode[];
  onOpenTurn: (segmentId: string | null) => void;
}) {
  const { t } = useTranslation();
  const review = useMemo(() => buildReview({ events, topics }), [events, topics]);
  // The answered half, on request. What was left open is the reason to come
  // back; what was answered is the record of the exchange — worth having one
  // press away, not worth the page's length by default.
  const [showAnswers, setShowAnswers] = useState(false);
  useEffect(() => setShowAnswers(false), [events]);

  // Nothing observed means nothing to review. A panel saying "0 questions" is a
  // panel that has to be read to learn it says nothing.
  if (review.empty) return null;

  return (
    <section className="mt-7 border-l-2 border-border/60 pl-4">
      <h2 className="font-mono text-[11px] text-muted-foreground">{t("oats.review.title")}</h2>

      {review.unresolved.length > 0 && (
        <ul className="mt-3 space-y-2">
          {review.unresolved.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onOpenTurn(item.segmentId)}
                disabled={!item.segmentId}
                className={cn(
                  "w-full rounded-sm text-left text-[13px] leading-6 text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.segmentId
                    ? "underline decoration-border underline-offset-[5px] hover:decoration-foreground"
                    : "cursor-default"
                )}
              >
                {item.question}
              </button>
              {/* Its own line, flush with the question. The button above is
                  full-width, so this always wrapped — and the inline margin
                  meant for sitting beside the question indented it instead. */}
              <span className="block font-mono text-[11px] leading-5 text-muted-foreground">
                {t(`questionCard.state.${item.outcome === "open" ? "asked" : item.outcome}`)}
                {item.searched && ` · ${t("questionCard.searched")}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* One line of arithmetic, not a dashboard. It exists so "three questions
          went unanswered" has a denominator. */}
      <p className="mt-3 font-mono text-[11px] leading-5 text-muted-foreground">
        {t("oats.review.tally", { asked: review.asked, answered: review.answered })}
        {/* The labels go through the string, not beside it: appended as markup
            they read as part of the count ("2 threads still open pricing
            enterprise"), and the colon that separates them is spaced
            differently in French and full-width in Chinese and Japanese. */}
        {review.openThreads.length > 0 &&
          ` · ${t("oats.review.openThreads", {
            count: review.openThreads.length,
            threads: review.openThreads.map((thread) => thread.label).join(", "),
          })}`}
        {review.answers.length > 0 && (
          <>
            {" "}
            <QuietAction
              label={showAnswers ? t("oats.review.hideAnswers") : t("oats.review.showAnswers")}
              ariaExpanded={showAnswers}
              onClick={() => setShowAnswers((open) => !open)}
            />
          </>
        )}
      </p>

      {showAnswers && (
        <ul className="mt-3 space-y-3">
          {review.answers.map((item) => (
            <li key={item.key}>
              <p className="text-[13px] leading-6 text-foreground">{item.question}</p>
              {/* The words that answered it, in the machine's verbatim voice,
                  and a place: pressing them opens the transcript there. */}
              {item.reply ? (
                <button
                  type="button"
                  onClick={() => onOpenTurn(item.segmentId)}
                  disabled={!item.segmentId}
                  className="line-clamp-2 w-full rounded-sm text-left font-mono text-[12px] leading-5 text-muted-foreground underline decoration-transparent underline-offset-4 hover:text-foreground hover:decoration-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.reply}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The transcript as the timed record it is, rather than as one wall of text.
 *
 * The reading view used to render `transcriptText()` — the same flat string the
 * clipboard and the `.txt` export get — so an hour of conversation arrived with
 * no bearings at all. The whole product draws time as its signature, and the one
 * surface where you go to *read* what was said showed none of it: a search
 * result landed you somewhere in a wall with nothing to say how far in you were,
 * or how long the room had been on the subject.
 *
 * Each turn now carries its offset from the first thing said. The gutter is mono
 * and quiet — it is a coordinate, not content — and it is `aria-hidden`, because
 * a screen reader working through a transcript does not want a timestamp read
 * before every line. The time is on the paragraph as a `title` for anyone who
 * wants it.
 *
 * `transcriptText` is untouched: copy and export still produce the plain text
 * they always did.
 */
function TranscriptView({
  note,
  query,
  scrollToId,
  events,
  moments,
  currentMatch = null,
}: {
  note: NoteItem;
  query: string;
  /** The segment a search matched, so arriving from a result lands on it. */
  scrollToId?: string | null;
  events: ConversationEvent[];
  moments: { id: string; at: number; note: string }[];
  /** Which highlighted match the find line is on, or null when it is not open. */
  currentMatch?: number | null;
}) {
  const { t } = useTranslation();
  const segments = useMemo(() => parseSegments(note.transcript), [note.transcript]);
  const target = useRef<HTMLLIElement | null>(null);
  // The match the find line is on: marked, and brought to the middle of the
  // screen. Children's effects run first, so this lands after `Highlighted`
  // has scrolled to the first match on a new query.
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const marks = transcriptRef.current?.querySelectorAll("mark") ?? [];
    marks.forEach((mark, index) => {
      if (index === currentMatch) mark.setAttribute("data-current", "");
      else mark.removeAttribute("data-current");
    });
    if (currentMatch == null) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    marks[currentMatch]?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [currentMatch, query]);
  // The margin: which turns asked a question (and how it came out), and which
  // ones the reader marked. Scanning an hour of transcript for "where were the
  // questions" is what a margin is for.
  const asked = useMemo(() => questionTurns(events), [events]);
  const marked = useMemo(() => {
    const ids = new Set<string>();
    for (const moment of moments) {
      const segment = momentSegment(moment, segments);
      if (segment?.id != null) ids.add(String(segment.id));
    }
    return ids;
  }, [moments, segments]);

  useEffect(() => {
    if (!target.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [scrollToId, segments]);

  // No segments means no timings — an imported or legacy transcript. Fall back
  // to what the reading view has always shown rather than to an empty page.
  if (!segments.length) {
    return (
      <div ref={transcriptRef}>
        <article className="mt-7 whitespace-pre-wrap font-mono text-[13px] leading-6 text-muted-foreground">
          <Highlighted
            text={transcriptText(note.transcript, t) || t("oats.intelligence.noTranscript")}
            query={query}
          />
        </article>
      </div>
    );
  }

  const startedAt = segments.find((segment) => Number.isFinite(segment.timestamp))?.timestamp;

  return (
    <div ref={transcriptRef}>
      <ol className="mt-7 space-y-4">
        {segments.map((segment) => {
          const at =
            Number.isFinite(segment.timestamp) && Number.isFinite(startedAt)
              ? clock(Math.max(0, (segment.timestamp as number) - (startedAt as number)))
              : null;
          const matched = scrollToId != null && String(segment.id) === scrollToId;
          const outcome = asked.get(String(segment.id));
          const isMarked = marked.has(String(segment.id));
          return (
            <li
              key={segment.id}
              ref={matched ? target : undefined}
              className="flex gap-4 font-mono text-[13px] leading-6"
            >
              <span
                aria-hidden="true"
                className="flex w-16 shrink-0 items-center justify-end gap-1.5 self-start pt-px text-[11px] tabular-nums text-muted-foreground/70"
              >
                {isMarked && (
                  <svg width="8" height="7" viewBox="0 0 8 7" className="text-foreground/80">
                    <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
                  </svg>
                )}
                {outcome && (
                  <StateMark
                    state={(outcome === "open" ? "asked" : outcome) as QuestionOutcome}
                    className=""
                  />
                )}
                {at ?? ""}
              </span>
              <p
                title={at ?? undefined}
                className={cn(
                  "min-w-0 flex-1 text-muted-foreground",
                  // The turn a search landed on is ink rather than husk. It is not
                  // a highlight — a semantic match has no span to highlight — it
                  // is "this is the one".
                  matched && "text-foreground"
                )}
              >
                {isMarked && <span className="sr-only">{t("oats.review.markedTurn")} </span>}
                <SpeakerName note={note} segments={segments} segment={segment} />
                <Highlighted text={String(segment.text ?? "")} query={query} />
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A turn's speaker, and the way to name them.
 *
 * Oats tells voices apart after a conversation stops and numbers them by who
 * spoke first; it cannot know names, and guessing one would put words in a
 * stranger's mouth. Pressing "Speaker 2" names them — once, for every turn
 * that voice said in this conversation.
 */
function SpeakerName({
  note,
  segments,
  segment,
}: {
  note: NoteItem;
  segments: TranscriptSegment[];
  segment: TranscriptSegment;
}) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const label = speakerText(segment, t);
  if (!label) return null;
  const nameable = Boolean(segment.speaker && /^speaker_\d+$/.test(segment.speaker));

  const save = async (value: string) => {
    setNaming(false);
    const name = value.replace(/\s+/g, " ").trim().slice(0, 60);
    const next = segments.map((s) =>
      s.speaker === segment.speaker
        ? name
          ? {
              ...s,
              speakerName: name,
              speakerIsPlaceholder: false,
              speakerStatus: "locked" as const,
            }
          : { ...s, speakerName: undefined, speakerIsPlaceholder: true }
        : s
    );
    await window.electronAPI?.updateNote?.(note.id, {
      transcript: serializeTranscriptSegments(next),
    });
    await initializeNotes("meeting", 100);
  };

  if (naming) {
    return (
      <input
        autoFocus
        defaultValue={segment.speakerIsPlaceholder ? "" : (segment.speakerName ?? "")}
        placeholder={label}
        aria-label={t("oats.intelligence.nameSpeaker", { speaker: label })}
        maxLength={60}
        spellCheck={false}
        onBlur={(event) => void save(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setNaming(false);
        }}
        className="mr-2 w-32 rounded-sm border-b border-border bg-transparent font-mono text-[13px] text-foreground focus-visible:border-primary focus-visible:outline-none"
      />
    );
  }

  return (
    <span className="mr-2 select-none text-muted-foreground/70">
      {nameable ? (
        <button
          type="button"
          onClick={() => setNaming(true)}
          aria-label={t("oats.intelligence.nameSpeaker", { speaker: label })}
          className="rounded-sm underline decoration-transparent underline-offset-4 hover:text-foreground hover:decoration-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </button>
      ) : (
        label
      )}
      <span className="sr-only">: </span>
    </span>
  );
}

/** Plain text with the search term marked, scrolled so the first hit is on screen. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const first = useRef<HTMLElement | null>(null);
  const parts = useMemo(() => splitOnMatches(text, query), [text, query]);

  useEffect(() => {
    if (!first.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    first.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [parts]);

  let seen = false;
  return (
    <>
      {parts.map((part, index) => {
        if (!part.match) return <span key={index}>{part.text}</span>;
        const isFirst = !seen;
        seen = true;
        return (
          <mark
            key={index}
            ref={
              isFirst
                ? (node) => {
                    first.current = node;
                  }
                : undefined
            }
            // Gold, used here as a mark colour rather than a reading colour
            // (DESIGN.md §3) — which is precisely what a search hit is. The text
            // itself stays ink so the highlight never costs legibility.
            // The one the find line is on is the stronger mark of the two.
            className="rounded-sm bg-primary/25 px-0.5 text-foreground data-[current]:bg-primary/60"
          >
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

/**
 * Copy it, save it, file it, or delete it.
 *
 * Until now a conversation could be recorded and read and nothing else: there
 * was no way to get the text out of Oats and no way to remove one at all, which
 * for a tool holding unannounced work is the more serious of the two.
 *
 * The vault action appears only when a vault folder has been chosen. A disabled
 * control that exists to advertise a setting is a thing to learn and dismiss;
 * for everybody who does not keep a vault, the row is simply three words.
 */
function ConversationActions({
  note,
  tab,
  onDeleted,
}: {
  note: NoteItem;
  tab: DetailTab;
  onDeleted: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const vaultPath = useSettingsStore((state) => state.obsidianVaultPath);
  // null when idle, true once it landed, false when the write was refused.
  const [filed, setFiled] = useState<boolean | null>(null);

  // Whatever is being read is what leaves — no menu of formats, no dialog asking
  // which part. The transcript tab copies the transcript, the other two copy the
  // summary, because that is what is on the screen.
  const payload = () =>
    tab === "transcript"
      ? transcriptText(note.transcript, t)
      : note.enhanced_content || note.content || "";

  useEffect(() => setConfirming(false), [note.id, tab]);
  useEffect(() => setFiled(null), [note.id]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (filed === null) return undefined;
    const timer = setTimeout(() => setFiled(null), 2000);
    return () => clearTimeout(timer);
  }, [filed]);

  const copy = async () => {
    const text = payload();
    if (!text.trim()) return;
    await window.electronAPI?.writeClipboard?.(text);
    setCopied(true);
  };

  const save = () => {
    if (tab === "transcript") void window.electronAPI?.exportTranscript?.(note.id, "txt");
    else void window.electronAPI?.exportNote?.(note.id, "md");
  };

  // Every conversation files itself once the vault is set, so this is for the
  // ones recorded before it was — and it says whether it worked, because a
  // write that quietly did nothing is the failure this product does not accept.
  const file = async () => {
    const result = await window.electronAPI?.exportNoteToVault?.(note.id);
    setFiled(Boolean(result?.success));
  };

  if (confirming) {
    return (
      <div className="flex shrink-0 items-baseline gap-4">
        <span className="font-mono text-xs text-foreground">
          {t("oats.intelligence.deleteConfirm")}
        </span>
        <QuietAction
          label={t("oats.intelligence.deleteYes")}
          onClick={() => {
            void (async () => {
              await window.electronAPI?.deleteNote?.(note.id);
              await onDeleted();
            })();
          }}
        />
        <QuietAction
          label={t("oats.intelligence.deleteCancel")}
          onClick={() => setConfirming(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-baseline gap-4">
      <QuietAction
        label={copied ? t("oats.intelligence.copied") : t("oats.intelligence.copy")}
        onClick={() => void copy()}
      />
      <QuietAction label={t("oats.intelligence.save")} onClick={save} />
      {vaultPath && (
        <QuietAction
          label={
            filed === null
              ? t("oats.intelligence.vault")
              : filed
                ? t("oats.intelligence.vaultSaved")
                : t("oats.intelligence.vaultFailed")
          }
          ariaLabel={t("oats.intelligence.vaultLabel")}
          onClick={() => void file()}
        />
      )}
      {/* Deleting a conversation is the one irreversible thing in the product, so
          it asks — in place, on the same line, rather than in a modal. A dialog
          would be the only modal in Oats; a second press is the same guarantee
          with none of the chrome. */}
      <QuietAction label={t("oats.intelligence.delete")} onClick={() => setConfirming(true)} />
    </div>
  );
}

function QuietAction({
  label,
  onClick,
  ariaLabel,
  ariaExpanded,
}: {
  label: string;
  onClick: () => void;
  /** When the visible word alone does not say what it acts on. */
  ariaLabel?: string;
  /** For the ones that open something in place. */
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      // 24px tall, and the padding is negative-margined away so the target grows
      // without the words moving. These measured 23.5 x 12 — Map, Back, Copy,
      // Save and Delete all of them — which is under WCAG 2.2's 24x24 minimum
      // for a pointer target, and Delete is not a control to make small.
      // `inline-flex` rather than `block`: these sit on baseline-aligned rows.
      className="-my-1.5 inline-flex min-h-6 items-center rounded-sm py-1.5 font-mono text-xs text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

// A quiet way back. Husk ink, no chevron box, no button chrome.
function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Same 24px floor as QuietAction, same negative margin so the words do
      // not move. `Map` measured 23.5 x 12 and is the only door to the lifetime
      // graph.
      className="-my-1.5 inline-flex min-h-6 items-center rounded-sm py-1.5 font-mono text-xs text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

// DESIGN.md §9.5: an empty screen is where warmth lives, and it is an invitation
// to act rather than a shrug. One line of quiet mono copy, and the shortcut that
// makes the screen fill itself.
function EmptyState({ line, hint }: { line: string; hint?: string | null }) {
  const conversationKey = useSettingsStore((state) => state.conversationKey);
  const shortcut = useMemo(
    () => formatHotkey(conversationKey, getCachedPlatform()),
    [conversationKey]
  );
  return (
    <div className="mt-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">{line}</p>
      {hint && shortcut && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {hint.replace("{{shortcut}}", shortcut)}
        </p>
      )}
    </div>
  );
}

// One conversation's shape, beside it in the list.
//
// Built from the note's own stored utterances, so a list of conversations reads
// as a page of different entries rather than as identical rows.
//
// **Speech shape only, no question marks.** Marks would need this row's
// persisted events, and a hundred-row list would mean a hundred queries to draw
// a 24px strip. The marks appear when the conversation is opened, where the
// events are already loaded. An earlier version of this comment claimed the
// marks survived here; they never did, because the call site passes no events.
/**
 * One search result's evidence line.
 *
 * With no query this is the ordinary preview. With one it is the passage that
 * matched, marked, under a label saying where it came from — because "these are
 * the words that were spoken" and "this is what a 1.5B model wrote about the
 * conversation" are different claims, and a tool whose whole premise is evidence
 * may not present them identically.
 *
 * `related` is the weakest claim on the page: the vector index thinks this
 * conversation is about your question, and nothing in it literally matched.
 */
function RecallExcerpt({
  note,
  query,
  related,
}: {
  note: NoteItem;
  query: string;
  related: boolean;
}) {
  const { t } = useTranslation();
  const excerpt = useMemo(() => (query.trim() ? findExcerpt(note, query) : null), [note, query]);

  if (!excerpt) {
    return (
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-muted-foreground">
        {related && (
          <span className="mr-2 font-mono text-[11px] text-muted-foreground/80">
            {t("oats.intelligence.matchRelated")}
            <span className="sr-only">: </span>
          </span>
        )}
        {plainPreview(note.enhanced_content) ||
          transcriptText(note.transcript, t) ||
          t("oats.intelligence.processing")}
      </p>
    );
  }

  return (
    <p
      className={cn(
        "mt-1.5 line-clamp-2 text-[13px] leading-6 text-muted-foreground",
        // Mono for a transcript excerpt, sans for a summary: §5's rule that the
        // machine's verbatim record and the model's prose do not share a voice.
        excerpt.source === "transcript" && "font-mono text-[12px]"
      )}
    >
      <span className="mr-2 font-mono text-[11px] text-muted-foreground/80">
        {t(`oats.intelligence.match.${excerpt.source}`)}
        {/* How far in. The product's signature is a picture of time, and a
            result that says what was said but not when leaves you to find it
            again by eye in an hour of transcript. */}
        {excerpt.offsetMs !== undefined && ` · ${clock(excerpt.offsetMs)}`}
        {/* A character, not margin. `textContent` is what a screen reader and
            the clipboard read, and margin is invisible to both — this is the
            same defect the transcript's speaker labels had ("Youso the question
            is"), caught there by measurement and avoided here by the same
            means. */}
        <span className="sr-only">: </span>
      </span>
      {excerpt.prefixed && "…"}
      {excerpt.before}
      <mark className="rounded-[2px] bg-primary/20 px-0.5 text-foreground">{excerpt.match}</mark>
      {excerpt.after}
      {excerpt.suffixed && "…"}
    </p>
  );
}

function NoteContourStrip({ note }: { note: NoteItem }) {
  // Only the rows you can see are drawn.
  //
  // The list loads a hundred conversations, and drawing a hundred strips on open
  // cost 263ms and three long tasks at DPR 2, with 18.9MB of canvas backing
  // store then retained for the life of the process — to render strips that are
  // 22px tall and almost all of them off screen. Each row parses its own
  // transcript to build its geometry, so the parse is behind the same gate.
  //
  // Once a row has been seen it stays drawn: re-drawing on every scroll reversal
  // would trade a one-off cost for a permanent one.
  const box = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
      },
      // A screen of lead time, so a strip is drawn before it is scrolled to
      // rather than appearing under the reader's eye.
      { rootMargin: "400px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);

  // The box is reserved at the strip's height so revealing one does not reflow
  // the list underneath. A note with no transcript has no strip and never will,
  // and that is knowable without parsing anything, so those rows keep their
  // tighter shape.
  if (typeof note.transcript !== "string" || note.transcript.length < 3) return null;
  return (
    <div ref={box} className="mt-3 h-[22px]">
      {seen && <LoadedContourStrip note={note} />}
    </div>
  );
}

function LoadedContourStrip({ note }: { note: NoteItem }) {
  const { i18n } = useTranslation();
  const segments = useMemo(() => parseSegments(note.transcript), [note.transcript]);
  const strip = useContourStrip(segments, NO_EVENTS);
  if (strip.empty) return null;
  return (
    <StripWithSpan
      span={formatSpan(conversationSpanMs(segments), { locale: i18n.language })}
      marked={parseMoments(note.conversation_marks ?? null).length}
    >
      <ConversationContour contour={strip} className="opacity-70" height={22} showMarks={false} />
    </StripWithSpan>
  );
}

/**
 * A contour strip and how long it is.
 *
 * Every strip is drawn to the full width of its row whatever the conversation's
 * length, so two strips side by side said nothing about which conversation ran
 * longer. The strip *is* the time axis; its length is written at its end. Shown
 * only where the transcript is already parsed for the strip, so it adds no
 * parsing to a list that gates exactly that on visibility.
 */
function StripWithSpan({
  span,
  marked = 0,
  className,
  children,
}: {
  span: string;
  /** How many moments were marked in it — the conversations where something
   *  mattered enough to press for, which is worth seeing while scanning. */
  marked?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {marked > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-foreground/80">
          <svg aria-hidden="true" width="7" height="6" viewBox="0 0 8 7">
            <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
          </svg>
          <span aria-hidden="true">{marked}</span>
          <span className="sr-only">{t("oats.intelligence.markedCount", { count: marked })}</span>
        </span>
      )}
      {span && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {span}
        </span>
      )}
    </div>
  );
}

// Wraps the three Intelligence views so switching between them cross-fades, the
// same way the three surfaces do. The inner component reports which branch is
// live; this one only owns the transition.
function IntelligenceSurface() {
  // The view state lives here rather than inside IntelligenceViews so the branch
  // that is showing is owned in one place; the three branches are keyed, so each
  // change remounts and replays the enter animation.
  const [view, setView] = useState<"list" | "map">("list");
  const [reading, setReading] = useState(false);
  return (
    <IntelligenceViews view={view} setView={setView} reading={reading} setReading={setReading} />
  );
}

// One settings row: a label, an optional line of explanation, and the control.
// Rows are separated by whitespace and a hairline, not by card borders — the
// visible page is a single quiet list, not a wall of panels (DESIGN.md §13).
function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    // Label left, control right, on a shared alignment spine.
    //
    // Stacking label → hint → control vertically for every setting made the page
    // three screens tall and gave the eye nothing to follow. A two-column
    // rhythm halves the height and creates the spine that makes a settings page
    // scannable rather than a form to read. DESIGN.md §13 wants the visible page
    // to fit on one screen; this is most of how it gets there.
    <div className="grid grid-cols-[minmax(0,18rem)_1fr] items-start gap-x-8 border-b border-border/40 py-2.5 last:border-b-0">
      <div className="min-w-0">
        {/* A `<label>` with no `for` and no wrapped control labels nothing. */}
        {htmlFor ? (
          <label className="text-sm text-foreground" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="text-sm text-foreground">{label}</span>
        )}
        {/* The explanation belongs to the label, in the label's cell. Putting it
            on a second grid row pushed it below the control, where it read as an
            orphan belonging to whatever came next. */}
        {hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2 pt-0.5">{children}</div>
    </div>
  );
}

// The visible page's entire microphone control: one line naming the microphone
// the next conversation will use, and a way to change it.
//
// It deliberately does not enumerate anything on mount. `enumerateDevices`
// returns unlabelled entries until microphone permission has been granted, so
// any UI that wants to *name* the devices ends up calling `getUserMedia` to
// unlock the labels — which opens the microphone, and on macOS interrupts
// whatever else is playing. Opening Settings is not consent to open the
// microphone; pressing "change" is.
//
// It also writes `preferBuiltInMic`, because that flag wins over the chosen
// device at recording time (`getMeetingMicConstraints`). A picker that let you
// choose a device the recorder then ignored would be a setting that lies.
function MicrophoneChoice() {
  const { t } = useTranslation();
  const preferBuiltIn = useSettingsStore((s) => s.preferBuiltInMic);
  const setPreferBuiltIn = useSettingsStore((s) => s.setPreferBuiltInMic);
  const deviceId = useSettingsStore((s) => s.selectedMicDeviceId);
  const deviceLabel = useSettingsStore((s) => s.selectedMicDeviceLabel);
  const setDevice = useSettingsStore((s) => s.setSelectedMicDevice);

  const [devices, setDevices] = useState<{ deviceId: string; label: string }[] | null>(null);
  const [failed, setFailed] = useState(false);

  const openPicker = async () => {
    setFailed(false);
    try {
      let all = await navigator.mediaDevices.enumerateDevices();
      if (!all.some((device) => device.kind === "audioinput" && device.label)) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        all = await navigator.mediaDevices.enumerateDevices();
      }
      setDevices(
        all
          .filter((device) => device.kind === "audioinput" && device.deviceId !== "default")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || t("microphoneSettings.unknownDevice"),
          }))
      );
    } catch {
      setFailed(true);
    }
  };

  if (failed) {
    return <p className="text-sm leading-5 text-foreground">{t("oats.settings.micError")}</p>;
  }

  if (!devices) {
    return (
      <div className="flex items-baseline gap-3">
        <span className="text-sm text-foreground">
          {preferBuiltIn
            ? t("oats.settings.micBuiltIn")
            : deviceLabel || t("oats.settings.micSystemDefault")}
        </span>
        <QuietAction
          label={t("oats.settings.micChange")}
          ariaLabel={t("oats.settings.micChangeLabel")}
          onClick={() => void openPicker()}
        />
      </div>
    );
  }

  return (
    <select
      id="microphone"
      autoFocus
      value={preferBuiltIn ? "builtin" : deviceId || "default"}
      onChange={(event) => {
        const value = event.target.value;
        setPreferBuiltIn(value === "builtin");
        if (value === "builtin") return;
        if (value === "default") {
          setDevice("", "");
          return;
        }
        setDevice(value, devices.find((device) => device.deviceId === value)?.label ?? "");
      }}
      className={selectClass}
    >
      <option value="builtin">{t("oats.settings.micBuiltIn")}</option>
      <option value="default">{t("oats.settings.micSystemDefault")}</option>
      {devices.map((device) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label}
        </option>
      ))}
    </select>
  );
}

// The conversation languages the visible page offers, each written as its own
// speakers write it.
const CONVERSATION_LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["it", "Italiano"],
  ["zh", "中文"],
];

// Sensible starting points so the one visible choice actually produces a working
// pipeline. Anything more specific belongs behind Advanced.
const DEFAULT_LOCAL_MODEL = "qwen3.5-4b-q4_k_m";
const DEFAULT_CLOUD_MODEL = "gpt-5.6-terra";

/** The model providers `getAIModel` in services/ai/providers.ts can build.
 *  OpenRouter needs no base URL here — ReasoningService supplies its own. */
const SUMMARY_PROVIDERS = [
  { id: "openai", name: "OpenAI", defaultModel: DEFAULT_CLOUD_MODEL },
  { id: "anthropic", name: "Anthropic", defaultModel: "claude-sonnet-4-5" },
  { id: "gemini", name: "Google Gemini", defaultModel: "gemini-2.5-flash" },
  { id: "groq", name: "Groq", defaultModel: "llama-3.3-70b-versatile" },
  { id: "openrouter", name: "OpenRouter", defaultModel: "" },
] as const;

/** The realtime transcription providers this build can actually connect to —
 *  `STREAMING_CLIENT_BY_PROVIDER` in ipcHandlers.js is the authority. */
const REALTIME_PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "deepgram", name: "Deepgram" },
  { id: "assemblyai", name: "AssemblyAI" },
] as const;

const selectClass =
  // A line rather than a box. A boxed control on a quiet page reads as a form
  // field in a SaaS dashboard; the hairline goes gold only while focused, which
  // is the one moment the accent is earning something (DESIGN.md §3, §6).
  // No opt-out class is needed: the inherited input chrome is an element
  // selector, but it is scoped out of `.oats-surface` in index.css, so these
  // utilities are the only thing describing this control.
  //
  // The gold hairline alone was the focus state, and it measured 2.40:1 against
  // the border it replaced — under the 3:1 SC 1.4.11 asks of the thing that
  // says where focus is. A keyboard user could not tell the microphone select
  // from the language select. The ring is the same one every button carries.
  "h-10 w-full max-w-sm border-b border-border-control bg-transparent text-sm transition-colors [transition-duration:var(--motion-instant)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function SettingsSurface() {
  const transcriptionMode = useSettingsStore((s) => s.transcriptionMode);
  const setTranscriptionMode = useSettingsStore((s) => s.setTranscriptionMode);
  const cleanupMode = useSettingsStore((s) => s.cleanupMode);
  const setCleanupMode = useSettingsStore((s) => s.setCleanupMode);
  const uiMode = useSettingsStore((s) => s.uiMode);
  const setUiMode = useSettingsStore((s) => s.setUiMode);
  const vaultPath = useSettingsStore((s) => s.obsidianVaultPath);
  const setVaultPath = useSettingsStore((s) => s.setObsidianVaultPath);
  const vaultEnabled = useSettingsStore((s) => s.obsidianExportEnabled);
  const setVaultEnabled = useSettingsStore((s) => s.setObsidianExportEnabled);
  const cloudProvider = useSettingsStore((s) => s.cloudTranscriptionProvider) || "openai";
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useSettingsStore((s) => s.setOpenaiApiKey);
  const deepgramApiKey = useSettingsStore((s) => s.deepgramApiKey);
  const setDeepgramApiKey = useSettingsStore((s) => s.setDeepgramApiKey);
  const assemblyaiApiKey = useSettingsStore((s) => s.assemblyaiApiKey);
  const setAssemblyaiApiKey = useSettingsStore((s) => s.setAssemblyaiApiKey);
  // One key box, but for whichever provider is selected. Before this the box was
  // hardwired to OpenAI and no provider could be chosen at all, because the
  // catalog IPC it would have come from was never implemented.
  const anthropicApiKey = useSettingsStore((s) => s.anthropicApiKey);
  const setAnthropicApiKey = useSettingsStore((s) => s.setAnthropicApiKey);
  const geminiApiKey = useSettingsStore((s) => s.geminiApiKey);
  const setGeminiApiKey = useSettingsStore((s) => s.setGeminiApiKey);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const setGroqApiKey = useSettingsStore((s) => s.setGroqApiKey);
  const openrouterApiKey = useSettingsStore((s) => s.openrouterApiKey);
  const setOpenrouterApiKey = useSettingsStore((s) => s.setOpenrouterApiKey);
  const providerKey: Record<string, { value: string; set: (v: string) => void }> = {
    openai: { value: openaiApiKey, set: setOpenaiApiKey },
    deepgram: { value: deepgramApiKey, set: setDeepgramApiKey },
    assemblyai: { value: assemblyaiApiKey, set: setAssemblyaiApiKey },
    anthropic: { value: anthropicApiKey, set: setAnthropicApiKey },
    gemini: { value: geminiApiKey, set: setGeminiApiKey },
    groq: { value: groqApiKey, set: setGroqApiKey },
    openrouter: { value: openrouterApiKey, set: setOpenrouterApiKey },
  };
  const summaryProvider = useSettingsStore((s) => s.cleanupProvider) || "openai";
  const summaryModel = useSettingsStore((s) => s.cleanupModel);
  const summaryKey = providerKey[summaryProvider];
  const apiKey = providerKey[cloudProvider]?.value ?? openaiApiKey;
  const setApiKey = providerKey[cloudProvider]?.set ?? setOpenaiApiKey;
  const language = useSettingsStore((s) => s.preferredLanguage);
  const setLanguage = useSettingsStore((s) => s.setPreferredLanguage);
  const autoSearch = useSettingsStore((s) => s.conversationAutoSearchEnabled);
  const setAutoSearch = useSettingsStore((s) => s.setConversationAutoSearchEnabled);
  const conversationKey = useSettingsStore((s) => s.conversationKey);
  const setConversationKey = useSettingsStore((s) => s.setConversationKey);
  const dictationKey = useSettingsStore((s) => s.dictationKey);
  const setDictationKey = useSettingsStore((s) => s.setDictationKey);
  const setNoteFormattingMode = useSettingsStore((s) => s.setNoteFormattingMode);
  const cleanupModel = useSettingsStore((s) => s.cleanupModel);
  const setCleanupModel = useSettingsStore((s) => s.setCleanupModel);
  const setCleanupProvider = useSettingsStore((s) => s.setCleanupProvider);
  const noteFormattingModel = useSettingsStore((s) => s.noteFormattingModel);
  const setNoteFormattingModel = useSettingsStore((s) => s.setNoteFormattingModel);
  const setNoteFormattingProvider = useSettingsStore((s) => s.setNoteFormattingProvider);
  const meetingLocal = useSettingsStore((s) => s.meetingUseLocalWhisper);
  const setMeetingTranscriptionMode = useSettingsStore((s) => s.setMeetingTranscriptionMode);
  const setMeetingUseLocalWhisper = useSettingsStore((s) => s.setMeetingUseLocalWhisper);
  const hotkeyRejection = useSettingsStore((s) => s.hotkeyRejection);
  const [advanced, setAdvanced] = useState(false);

  const { t } = useTranslation();

  const local = transcriptionMode === "local" && cleanupMode === "local" && meetingLocal;

  // Choosing "on this computer" or "use API key" has to configure the *whole*
  // pipeline, not just the mode flags. `cleanupModel` and `noteFormattingModel`
  // both default to an empty string, and their scopes have no fallback — so
  // setting the mode alone leaves dictation cleanup and post-conversation
  // intelligence with no model at all, and they silently do nothing. That is a
  // configuration hole, not a missing feature: the engine underneath is fine.
  //
  // It must also configure the **meeting** scope. Recording a conversation is
  // the primary action, and it reads `meetingUseLocalWhisper` via
  // `selectResolvedMeetingTranscription` — a field the visible page never wrote.
  // The result was that "On this computer" could be selected and lit gold while
  // pressing record still reached for OpenAI and failed on a missing API key.
  // One visible choice has to mean one pipeline, or it is not a choice.
  const setProcessing = (mode: "local" | "providers") => {
    setTranscriptionMode(mode);
    setCleanupMode(mode);
    setNoteFormattingMode(mode);
    setMeetingTranscriptionMode(mode);
    setMeetingUseLocalWhisper(mode === "local");
    // The same rule as `meetingUseLocalWhisper` above, for the field that
    // decides whether the key is *used*. Recording reads the meeting scope, and
    // `meetingCloudTranscriptionMode` was never written here — it stayed empty,
    // which resolves to "legacy", and the realtime handler then refuses with
    // "OpenAI realtime requires a bring-your-own-key API key" while the key sits
    // in Settings. This writes the cloud mode, provider and model to the
    // dictation, meeting and upload scopes at once.
    useSettingsStore.getState().setCloudTranscriptionForAllScopes({
      useLocalWhisper: mode === "local",
      cloudTranscriptionMode: "byok",
    });
    if (mode === "local") {
      setCleanupProvider("local");
      setNoteFormattingProvider("local");
      if (!cleanupModel) setCleanupModel(DEFAULT_LOCAL_MODEL);
      if (!noteFormattingModel) setNoteFormattingModel(DEFAULT_LOCAL_MODEL);
    } else {
      setCleanupProvider("openai");
      setNoteFormattingProvider("openai");
      if (!cleanupModel) setCleanupModel(DEFAULT_CLOUD_MODEL);
      if (!noteFormattingModel) setNoteFormattingModel(DEFAULT_CLOUD_MODEL);
    }
  };

  if (advanced) {
    return (
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border/40 px-8 py-4">
          <Button variant="ghost" size="sm" onClick={() => setAdvanced(false)}>
            <ChevronLeft size={14} /> {t("oats.nav.settings")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("oats.settings.advancedHint")}</p>
        </div>
        {/* The inherited page brings its own cards but no page frame, so it ran
            edge to edge: section headings flush at x=0 and rows the full width
            of the window, with a label on one side and its toggle a thousand
            pixels away. It keeps its own look — that is deliberate — inside the
            same column the rest of the app uses. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-3xl">
            <Suspense
              fallback={
                <p className="px-8 py-6 font-mono text-xs text-muted-foreground">
                  {t("oats.settings.advancedLoading")}
                </p>
              }
            >
              <AdvancedSettings />
            </Suspense>
          </div>
        </div>
      </section>
    );
  }

  return (
    // `pt-4`, as Intelligence has: the heading sat flush against the
    // orientation band, the only surface whose title touched it.
    <section className="oats-surface mx-auto w-full max-w-2xl overflow-y-auto px-8 pb-5 pt-4">
      <h1 className="text-2xl font-medium tracking-[-0.03em]">{t("oats.settings.title")}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {t("oats.settings.subtitle")}
      </p>

      <div className="mt-3">
        <Row label={t("oats.settings.processing")} hint={t("oats.settings.processingHint")}>
          {/* The same language as the nav and the reading tabs: a word, and an
              ink rule under the chosen one. Two filled slabs made the most
              consequential setting on the page also the loudest object on it.
              The rule was gold until the Interface row arrived beneath it with
              the same markup: two choices are two resting golds on one page,
              and §3 says one of them is wrong. A setting that is chosen is not
              a momentary mark, which is what gold is for — the nav and the tabs
              reached the same answer for the same reason. */}
          <div className="flex items-center gap-6">
            {(
              [
                ["local", t("oats.settings.localProcessing")],
                ["providers", t("oats.settings.apiProcessing")],
              ] as const
            ).map(([mode, copy]) => {
              const active = mode === "local" ? local : !local;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setProcessing(mode)}
                  aria-pressed={active}
                  className={cn(
                    "relative rounded-sm pb-1.5 text-sm transition-colors",
                    "[transition-duration:var(--motion-instant)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {copy}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-px origin-center bg-foreground transition-transform",
                      "[transition-duration:var(--motion-base)]",
                      active ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </button>
              );
            })}
          </div>
          {!local && (
            <select
              aria-label={t("oats.settings.provider")}
              value={cloudProvider}
              onChange={(e) => {
                const next = e.target.value;
                useSettingsStore.getState().setCloudTranscriptionForAllScopes({
                  cloudTranscriptionProvider: next,
                  cloudTranscriptionMode: "byok",
                });
              }}
              className={cn(selectClass, "mt-3")}
            >
              {REALTIME_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {!local && (
            <input
              id="api-key"
              name={`${cloudProvider}-api-key`}
              aria-label={t("oats.settings.apiKeyFor", {
                provider: REALTIME_PROVIDERS.find((p) => p.id === cloudProvider)?.name ?? "OpenAI",
              })}
              // A password manager offering to fill a login here, or to save an
              // API key as one, is noise on the one screen that is meant to be
              // quiet.
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("oats.settings.apiKeyFor", {
                provider: REALTIME_PROVIDERS.find((p) => p.id === cloudProvider)?.name ?? "OpenAI",
              })}
              type="password"
              className={cn(selectClass, "mt-3")}
            />
          )}
        </Row>

        {/* Two interfaces, not a theme: they differ in what is on screen. Named
            rather than inferred, and stored, so the choice survives a restart. */}
        <Row label={t("oats.settings.uiMode")} hint={t("oats.settings.uiModeHint")}>
          <div className="flex items-center gap-6">
            {(
              [
                ["work", t("oats.settings.uiModeWork")],
                ["field", t("oats.settings.uiModeField")],
              ] as const
            ).map(([value, copy]) => {
              const active = uiMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setUiMode(value)}
                  aria-pressed={active}
                  className={cn(
                    "relative rounded-sm pb-1.5 text-sm transition-colors",
                    "[transition-duration:var(--motion-instant)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {copy}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-px origin-center bg-foreground transition-transform",
                      "[transition-duration:var(--motion-base)]",
                      active ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </Row>

        {/* Transcription and summaries are different providers with barely any
            overlap — only OpenAI does both — so one row cannot honestly cover
            them. This is the model that writes the title, the summary and the
            threads; it is the row that makes OpenRouter reachable. */}
        {!local && (
          <Row label={t("oats.settings.summaryProvider")} hint={t("oats.settings.summaryHint")}>
            <select
              aria-label={t("oats.settings.summaryProvider")}
              value={summaryProvider}
              onChange={(e) => {
                const next = e.target.value;
                const chosen = SUMMARY_PROVIDERS.find((p) => p.id === next);
                setCleanupProvider(next);
                setNoteFormattingProvider(next);
                // A provider change makes the old model id meaningless — an
                // OpenAI id sent to Anthropic is a hard failure, not a fallback.
                setCleanupModel(chosen?.defaultModel ?? "");
                setNoteFormattingModel(chosen?.defaultModel ?? "");
              }}
              className={selectClass}
            >
              {SUMMARY_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {summaryKey && (
              <input
                aria-label={t("oats.settings.summaryKeyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                value={summaryKey.value}
                onChange={(e) => summaryKey.set(e.target.value)}
                placeholder={t("oats.settings.summaryKeyPlaceholder")}
                type="password"
                className={cn(selectClass, "mt-3")}
              />
            )}
            {/* OpenRouter ids are namespaced ("anthropic/claude-sonnet-4-5")
                and are not in the local registry, so there is nothing sensible
                to preselect — the reader has to name one. */}
            {summaryProvider === "openrouter" && (
              <input
                aria-label={t("oats.settings.summaryModel")}
                autoComplete="off"
                spellCheck={false}
                value={summaryModel}
                onChange={(e) => {
                  setCleanupModel(e.target.value);
                  setNoteFormattingModel(e.target.value);
                }}
                placeholder="anthropic/claude-sonnet-4-5"
                className={cn(selectClass, "mt-3 font-mono text-xs")}
              />
            )}
          </Row>
        )}

        {/* No `htmlFor`: the `<select>` this would address only exists once the
            picker is open, so the label pointed at nothing and the action read
            as a bare "Change". The action names itself instead. */}
        <Row label={t("oats.settings.microphone")}>
          <MicrophoneChoice />
        </Row>

        <Row label={t("oats.settings.language")} htmlFor="language">
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={selectClass}
          >
            <option value="auto">{t("oats.settings.autoDetect")}</option>
            {/* Endonyms, not English exonyms. A user running Oats in Japanese
                was offered "Spanish" and "German" in the one control that is
                about language; a language names itself the same way in every
                interface, so this needs no translation key. */}
            {CONVERSATION_LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Row>

        {/* Both shortcuts use the real capture control rather than a text field:
            a hotkey typed as a string is a hotkey nobody gets right, and the
            control already knows how to reject combinations the platform cannot
            register. */}
        {/* The primary action comes first. This is the one shortcut that ships
            with a working default, because a conversation you have to open a
            window to start is a conversation you will miss the beginning of. */}
        <Row
          label={t("oats.settings.conversationHotkey")}
          hint={t("oats.settings.conversationHotkeyHint")}
        >
          <div className="max-w-sm">
            <HotkeyInput
              variant="ledger"
              value={conversationKey}
              onChange={(value) => void setConversationKey(value)}
            />
            {hotkeyRejection?.key === "conversationKey" && (
              <p className="mt-2 text-xs leading-5 text-foreground">
                {t("oats.settings.hotkeyRejected", { hotkey: hotkeyRejection.hotkey })}
                {hotkeyRejection.message ? ` ${hotkeyRejection.message}` : ""}
              </p>
            )}
          </div>
        </Row>

        <Row label={t("oats.settings.dictationShortcut")} hint={t("oats.settings.dictationHint")}>
          <div className="max-w-sm">
            <HotkeyInput
              variant="ledger"
              value={dictationKey}
              onChange={(value) => void setDictationKey(value)}
              onClear={() => void setDictationKey("")}
            />
            {hotkeyRejection?.key === "dictationKey" && (
              <p className="mt-2 text-xs leading-5 text-foreground">
                {t("oats.settings.hotkeyRejected", { hotkey: hotkeyRejection.hotkey })}
                {hotkeyRejection.message ? ` ${hotkeyRejection.message}` : ""}
              </p>
            )}
          </div>
        </Row>

        {/* Stated plainly, not buried: this is the only thing that leaves the
            device during a conversation. */}
        <Row
          label={t("oats.settings.autoSearch")}
          hint={t("oats.settings.autoSearchHint")}
          htmlFor="auto-search"
        >
          {/* A boolean is a toggle. Rendering it as two slabs made it look like a
              bigger decision than the mic preference directly above it, which is
              the same shape and already uses a toggle. */}
          <Toggle
            id="auto-search"
            aria-label={t("oats.settings.autoSearch")}
            checked={autoSearch}
            onChange={setAutoSearch}
          />
        </Row>

        {/* A vault folder, not a file: each conversation writes itself in as its
            own note when its title and summary land, with topics as
            [[wikilinks]] so Obsidian's own graph shows which conversations
            share a subject. Off until a folder is chosen — nothing writes
            outside this app without being pointed somewhere. */}
        <Row label={t("oats.settings.vault")} hint={t("oats.settings.vaultHint")}>
          {/* `w-full`, because the Row's control column is `items-start`: without
              it this line sizes to its content, grows past the column, and takes
              the "stop" action off the edge of the pane with it. */}
          <div className="flex w-full min-w-0 items-center gap-4">
            <QuietAction
              label={vaultPath ? t("oats.settings.vaultChange") : t("oats.settings.vaultChoose")}
              onClick={() => {
                void (async () => {
                  const picked = await window.electronAPI?.chooseObsidianVault?.();
                  if (!picked?.success || !picked.path) return;
                  setVaultPath(picked.path);
                  setVaultEnabled(true);
                })();
              }}
            />
            {vaultPath && (
              <>
                {/* `truncate` alone does nothing to a flex child: its min-width
                    is auto, so it refuses to shrink and overflows instead —
                    which pushed the control that turns the export off past the
                    edge of the pane. `min-w-0` is what lets it shrink, and the
                    title carries the path the ellipsis eats. */}
                <span
                  title={vaultPath}
                  className="min-w-0 truncate font-mono text-xs text-muted-foreground"
                >
                  {vaultPath}
                </span>
                <QuietAction
                  label={t("oats.settings.vaultStop")}
                  onClick={() => {
                    setVaultEnabled(false);
                    setVaultPath("");
                  }}
                />
              </>
            )}
          </div>
        </Row>

        <Row label={t("oats.settings.data")} hint={t("oats.settings.dataHint")}>
          {/* A quiet action, as the vault's folder action two lines above is.
              Opening a folder is a side errand, not what the page is for — and
              the two folder actions on one page were drawn two different
              ways, an underlined sans link and a mono word. */}
          <QuietAction
            label={t("oats.settings.openDataFolder")}
            onClick={() => window.electronAPI?.openLogsFolder?.()}
          />
        </Row>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced(true)}
        className="mt-4 inline-flex min-h-6 items-center gap-1.5 py-1.5 text-xs text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("oats.settings.advanced")}
        <ChevronRight size={12} />
      </button>
    </section>
  );
}

export default function OatsWorkspace() {
  const { t } = useTranslation();
  const fieldMode = useSettingsStore((s) => s.uiMode) === "field";
  const [surface, setSurface] = useState<Surface>("conversation");

  // Which surfaces have been opened at least once. A surface is built on first
  // visit and never torn down again — so the conversation lifecycle, once
  // started, cannot be unmounted by navigating, which is the whole point of the
  // stack below.
  const [visited, setVisited] = useState<Set<Surface>>(() => new Set<Surface>(["conversation"]));
  useEffect(() => {
    setVisited((previous) => {
      if (previous.has(surface)) return previous;
      const next = new Set(previous);
      next.add(surface);
      return next;
    });
  }, [surface]);

  // Who spoke, once the speaker pass over a stopped conversation finishes.
  // Mounted here, beside the other headless subscriptions, because the result
  // arrives minutes later on whichever surface is showing.
  useEffect(() => {
    const cleanup = window.electronAPI?.onConversationSpeakers?.(
      (payload) => void applyConversationSpeakers(payload)
    );
    return () => cleanup?.();
  }, []);

  // The vault path lives in the renderer's settings, but the write happens in
  // the main process on every note update — so main has to be told, on boot and
  // on every change. Same shape as `activation-mode-changed`.
  const vaultPathSetting = useSettingsStore((s) => s.obsidianVaultPath);
  const vaultEnabledSetting = useSettingsStore((s) => s.obsidianExportEnabled);
  useEffect(() => {
    void window.electronAPI?.configureObsidianVault?.({
      vaultPath: vaultPathSetting || null,
      enabled: vaultEnabledSetting,
    });
  }, [vaultPathSetting, vaultEnabledSetting]);

  // Opening a conversation from the Conversation surface's last-entry row.
  // Delegated rather than lifted into props for the same reason the recall
  // hotkey is: the shell owns `surface`, the row is three components down, and
  // threading a callback through would tie the composition to the shell.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const noteId = (event as CustomEvent<number>).detail;
      if (!Number.isFinite(noteId)) return;
      // Push *and* pull, which is the house pattern for exactly this
      // (CLAUDE.md, the `conversation-assist-ready` handshake and
      // `consume-pending-focus-search`). On a cold first visit Intelligence has
      // not mounted its listener yet, so a fired event lands on nothing: the
      // press navigated to the list and stopped there, and the row whose job is
      // to answer "did that save?" appeared to do nothing. The parked id is
      // consumed by Intelligence on mount, so the first press works like the
      // second.
      parkPendingNote(noteId);
      setSurface("intelligence");
      window.dispatchEvent(new CustomEvent("oats-select-note", { detail: noteId }));
    };
    window.addEventListener("oats-open-note", onOpen);
    return () => window.removeEventListener("oats-open-note", onOpen);
  }, []);

  // The recall hotkey: from any application into cross-conversation search.
  // Refused while recording for the same reason as Cmd+, — and the focus step
  // is delegated via a DOM event so it works whether Intelligence is already
  // mounted or is mounting right now. Push covers a running panel; the consume
  // call covers a cold start, where the press created this window and the
  // pushed event predates any listener.
  useEffect(() => {
    const goToSearch = () => {
      if (useMeetingRecordingStore.getState().isRecording) return;
      setSurface("intelligence");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.dispatchEvent(new Event("oats-focus-search")));
      });
    };
    const cleanup = window.electronAPI?.onFocusConversationSearch?.(() => {
      void window.electronAPI?.consumePendingFocusSearch?.();
      goToSearch();
    });
    void window.electronAPI?.consumePendingFocusSearch?.().then((pending) => {
      if (pending) goToSearch();
    });
    return () => cleanup?.();
  }, []);

  const showSettings = useCallback(() => {
    // Same reasoning as the Cmd+, gate below. This is also the macOS app menu's
    // "Settings" item (menuManager.js registers Command+, as its accelerator),
    // which is why the guard has to live here and not only in the key handler.
    if (useMeetingRecordingStore.getState().isRecording) return;
    setSurface("settings");
  }, []);
  const { showPostMigration, dismissPostMigration } = useAppBootstrap(showSettings);

  // Cmd/Ctrl+, is the platform convention for settings.
  //
  // It is still refused while a conversation is live, but the reason has changed
  // and is now much smaller. It used to be existential: `ConversationSurface` was
  // unmounted on leaving, taking the recording lifecycle with it, so the keyboard
  // could strand a conversation that nothing could then stop. The surfaces no
  // longer unmount, so that failure mode is gone.
  //
  // What remains is that the nav is deliberately hidden while recording (A7 — the
  // tool gets out of the way). A keyboard shortcut that moves you to a surface
  // with no visible way back is a trap, so the shortcut agrees with the screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = getCachedPlatform() === "darwin" ? event.metaKey : event.ctrlKey;
      if (mod && event.key === ",") {
        event.preventDefault();
        if (useMeetingRecordingStore.getState().isRecording) return;
        setSurface("settings");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const recording = useMeetingRecordingStore((state) => state.isRecording);

  // Intelligence's two keys: `/` to search, the convention every reading tool
  // shares, and Escape to step back — from a record or the map to the list.
  // Only on that surface, and never while somebody is typing: Escape in the
  // rename field cancels the rename, and in the search field clears it.
  useEffect(() => {
    if (surface !== "intelligence") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd+F is the platform's find, and Electron draws no find bar of its
      // own — so it is ours, from anywhere on this surface, field or not.
      const mod = getCachedPlatform() === "darwin" ? event.metaKey : event.ctrlKey;
      if (mod && !event.altKey && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        window.dispatchEvent(new Event("oats-find"));
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "/") {
        event.preventDefault();
        window.dispatchEvent(new Event("oats-find"));
      } else if (event.key === "Escape") {
        window.dispatchEvent(new Event("oats-intelligence-back"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [surface]);

  // A conversation starting always brings the Conversation surface with it.
  //
  // The global hotkey works from anywhere — that is the point of it — but until
  // this existed, pressing it on Settings started a recording and left you on
  // Settings, where there is no pulse, no timer and no stop control, and where
  // the nav has just faded out and stopped taking clicks (A7). Recording had
  // begun and the only evidence was a shortcut you could no longer see, on a page
  // whose own copy promises it "starts or stops a conversation from any
  // application". The pencil standard is that it fails loudly at the start rather
  // than quietly at the end; this is the same rule applied to succeeding.
  //
  // Watching the store rather than the hotkey covers every way a conversation can
  // begin, including ones added later.
  useEffect(() => {
    if (recording) setSurface("conversation");
  }, [recording]);

  return (
    <div
      className={cn(
        // `overflow-clip`, not `overflow-hidden`: a hidden box is still
        // scrollable by script, and `scrollIntoView` scrolls every ancestor that
        // is. Opening a search result scrolled this root by 8px — the drag band
        // and the nav slid half out of the window and stayed there, because a
        // hidden box has no scrollbar to bring them back. A clip box cannot be
        // scrolled at all.
        "relative flex h-screen flex-col overflow-clip bg-background text-foreground",
        // The field paints on the shell's own background, so in field mode the
        // background must be transparent or it would cover the sky.
        fieldMode && "bg-transparent",
        // Field mode is a class on the shell, so every surface inside can
        // answer to it without threading a prop, and so the whole thing is
        // inert — not merely hidden — in work mode.
        fieldMode && "oats-field-mode"
      )}
    >
      {/* Behind everything, and only in field mode. Returns null otherwise, so
          work mode pays nothing for it. */}
      <FieldBackdrop surface={surface} />
      {/* Renders nothing. It drives microphone level and the dead-mic warning,
          and pre-warms the audio worklet so the first recording starts fast.
          It was previously mounted only inside unreachable ControlPanel markup,
          which silently disabled all three. */}
      <MeetingRecordingMount />
      {/* Also headless, and also previously mounted only in unreachable markup.
          The post-recording intelligence pipeline reports failures through the
          action-processing store, so without this a conversation could finish,
          its summary could fail, and the user would never be told. */}
      <BackgroundActionToastListener />
      {/* Headless too: reports the recording to the tray and the floating oat,
          which are the only parts of Oats visible when this window is not. */}
      <ConversationStateBridge />
      <PostMigrationOnboarding
        open={showPostMigration}
        onOpenChange={(open) => {
          if (!open) void dismissPostMigration();
        }}
        onDone={dismissPostMigration}
      />

      {/* The window is frameless on every platform (windowConfig.js) and nothing
          else provides a drag handle, so without this it cannot be moved at all —
          including on macOS, where `titleBarStyle: "hiddenInset"` supplies the
          traffic lights but *not* a draggable title bar.

          It occupies real layout rather than floating over the top of the
          composition. An absolutely-positioned drag strip looks free, but
          `-webkit-app-region: drag` swallows clicks: the surfaces below scroll,
          so every list row that passed under the strip stopped being clickable.
          Reserving the band also keeps content clear of the macOS traffic lights,
          which sit at y 20–34 (windowConfig.js) — inside this band, and formerly
          6px above the Intelligence heading. */}
      {/* The orientation band.
      
          Navigation used to be three labels centred along the bottom of the
          window, which is where a consumer media app puts its tabs — and it
          leaned on the old field's horizon to stand on. With the field gone it
          had nothing to belong to, and it disappeared during recording, which
          is the moment orientation matters most.
      
          It lives in the window's drag band now: the wordmark on the left, the
          three destinations beside it, in the one strip that is on every
          surface and never moves. A ledger is identified at its head. The band
          keeps `-webkit-app-region: drag` so the frameless window can still be
          moved; the interactive parts opt back out, because a drag region
          swallows clicks. */}
      <div
        className="oats-titlebar relative z-20 flex h-9 shrink-0 items-center gap-6 px-5"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* The one lowercase thing in the product (DESIGN.md §5). */}
        <span
          aria-hidden="true"
          className="select-none font-mono text-[13px] tracking-[-0.01em] text-foreground"
        >
          oats
        </span>
        <nav
          aria-label={t("oats.nav.label")}
          inert={recording}
          aria-hidden={recording || undefined}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className={cn(
            "flex items-center gap-5",
            "transition-opacity [transition-duration:var(--motion-slow)]",
            // Nothing but the record being written while somebody is talking.
            // The tool gets out of the way.
            recording && "pointer-events-none opacity-0"
          )}
        >
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setSurface(item.id)}
              aria-current={surface === item.id ? "page" : undefined}
              className={cn(
                "relative rounded-sm text-[13px] transition-colors",
                "[transition-duration:var(--motion-instant)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                surface === item.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`oats.nav.${item.id}`)}
              {/* Ink, not gold. This underline is on screen on *every* surface,
                  so a gold one guaranteed a second accent competing with the
                  seed or a selected mark — §3 allows one. */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-1 inset-x-0 h-px origin-center bg-foreground transition-transform",
                  "[transition-duration:var(--motion-base)]",
                  surface === item.id ? "scale-x-100" : "scale-x-0"
                )}
              />
            </button>
          ))}
        </nav>
      </div>

      {/* All three surfaces stay mounted and cross-fade in place.

          This is DESIGN.md §8's "the outgoing view dims to 0 as the incoming
          rises", which an enter-only fade on a keyed, remounting `<main>` could
          not express — there was nothing left on screen to dim. Two earlier
          attempts to hold the outgoing view (re-rendering it, and cloning its DOM
          in a layout effect) were both wrong because both produced a *second*
          instance of a view that was being left. Not unmounting is the version
          with no copy in it.

          It also fixes a functional bug. `ConversationSurface` is the only
          registrant of `onToggleConversation`, so while it was unmounted the
          global conversation hotkey — the product's primary action, documented in
          CLAUDE.md as starting a conversation "from anywhere" — did nothing at
          all on Intelligence and Settings. */}
      <div className="oats-enter relative min-h-0 flex-1">
        {SURFACES.map(({ id, render }) => (
          <main
            key={id}
            data-active={surface === id}
            inert={surface !== id}
            aria-hidden={surface !== id}
            className="oats-pane absolute inset-0 flex min-h-0 flex-col overflow-clip"
          >
            {/* The pane element exists from the first render; its *contents* wait
                until the surface has been opened once, and then stay.

                Both halves matter. Mounting the element early is what makes the
                first visit a cross-fade rather than a pop: the transition needs a
                committed `opacity: 0` to move away from. Waiting to mount the
                contents is because a surface is not free to build — `Settings`
                reaches for the microphone device list, and on a machine whose mic
                permission has been reset that means an OS permission prompt and a
                live `getUserMedia` at launch, on the Conversation screen, with
                nothing on screen to explain it (and on macOS it pauses whatever
                is playing). A user who never opens Settings should never pay for
                it. */}
            {visited.has(id) ? render() : null}
          </main>
        ))}
      </div>
    </div>
  );
}
