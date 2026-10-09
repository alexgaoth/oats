import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  History,
  Info,
  MessageSquarePlus,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  Search,
  SearchX,
  Settings,
  Square,
  StickyNote,
  Trash2,
  Users,
  Vault,
  Waypoints,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { Button } from "./ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Badge, type BadgeProps } from "./ui/badge";
import { Kbd } from "./ui/kbd";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ConfirmDialog } from "./ui/dialog";
import { Toggle } from "./ui/toggle";
import { useNotes, initializeNotes, setActiveNoteId } from "../stores/noteStore";
import { AppSidebar } from "./shell/AppSidebar";
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
  ledgerDayGroup,
  ledgerTime,
} from "../helpers/ledgerDate.mjs";
import { checkpointRisk, transcriptionStalled } from "../helpers/recordingHealth.mjs";
import { findResumableConversation } from "../helpers/conversationResume.mjs";
import { parseDbTimestamp } from "../helpers/dbTime.mjs";
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
import type { SettingsSectionType } from "./SettingsPage";
import type { TFunction } from "i18next";

// Advanced Settings is the inherited OpenWhispr settings application: every
// provider, every model picker, every diagnostic. It is behind a deliberate,
// non-default path (DESIGN.md §13), and a static import pulled all of it — and
// everything it imports — into the chunk that has to render before the first
// conversation. Splitting it means the Oats path never pays for a room it does
// not walk into.
const AdvancedSettings = React.lazy(() => import("./SettingsPage"));

// Advanced is the inherited settings page, which draws one section at a time and
// used to rely on a sidebar this app deleted. Mounted with no section it showed
// "General" and nothing else, so everything behind it — the speech model, the
// shortcuts, the question cards, the summary model — was unreachable, including
// the screens other messages point people to.
const ADVANCED_SECTIONS: SettingsSectionType[] = [
  "general",
  "hotkeys",
  "speechToText",
  "llms",
  "privacyData",
  "system",
];

type Surface = "conversation" | "intelligence" | "settings";

const SURFACE_TITLES: Record<Surface, string> = {
  conversation: "oats.shell.home",
  intelligence: "oats.shell.conversations",
  settings: "oats.nav.settings",
};
type DetailTab = "summary" | "transcript" | "connections";

// Three destinations, named. No icons — see the nav comment in OatsWorkspace.

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

// Resolved by the Finish effect once the final transcript write has landed, or
// once there turned out to be nothing to write. Quitting during a conversation
// waits on exactly this (conversationGuards.js), rather than on capture
// stopping, which happens well before the transcript is safe.
let finishSavedWaiters: Array<() => void> = [];

function whenFinishSaved(): Promise<void> {
  return new Promise((resolve) => finishSavedWaiters.push(resolve));
}

function finishSaved(): void {
  const waiters = finishSavedWaiters;
  finishSavedWaiters = [];
  for (const resolve of waiters) resolve();
}

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
function RecentRow({ note }: { note: NoteItem }) {
  const { t, i18n } = useTranslation();
  const segments = useMemo(() => parseSegments(note.transcript ?? null), [note.transcript]);
  const span = formatSpan(conversationSpanMs(segments), { locale: i18n.language });
  const preview = note.enhanced_content
    ? plainPreview(note.enhanced_content)
    : transcriptText(note.transcript ?? null, t);
  return (
    <li>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("oats-open-note", { detail: note.id }))}
        className={cn(
          "flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors hover:bg-muted/60",
          "outline-none focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
        )}
      >
        <span className="flex items-baseline gap-4">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {note.title || t("oats.untitled")}
          </span>
          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
            {ledgerDate(note.created_at, { locale: i18n.language })}
          </span>
        </span>
        <span className="flex items-baseline gap-4">
          <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-muted-foreground">
            {preview}
          </span>
          {span && (
            <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{span}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** The few most recent conversations, one press from Home. */
function RecentConversations() {
  const { t } = useTranslation();
  const notes = useNotes();
  const recent = useMemo(
    () => notes.filter((note) => note.note_type === "meeting").slice(0, 5),
    [notes]
  );
  if (!recent.length) return null;
  return (
    <section aria-labelledby="oats-recent-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="oats-recent-heading" className="text-sm font-semibold">
          {t("oats.conversation.recentHeading")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.dispatchEvent(new Event("oats-show-conversations"))}
        >
          {t("oats.conversation.viewAll")}
        </Button>
      </div>
      <Card className="gap-0 overflow-hidden">
        <ul className="divide-y divide-border">
          {recent.map((note) => (
            <RecentRow key={note.id} note={note} />
          ))}
        </ul>
      </Card>
    </section>
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
    if (!recordingNoteId) {
      finishSaved();
      return;
    }
    // A conversation that captured nothing is not a conversation. Leaving an
    // empty note behind means the Intelligence list slowly fills with blanks the
    // user has to clean up, and it hides the actual problem: the mic heard
    // nothing. Say so, and delete the note.
    if (!finalTranscript.trim()) {
      setNothingHeard(true);
      void window.electronAPI?.deleteNote?.(recordingNoteId);
      finishSaved();
      return;
    }
    setNothingHeard(false);
    // Snapshot the topics before anything else awaits: the tracker is live
    // renderer state, and the graph in Intelligence reads only what is persisted.
    const topics = getConversationTopicSnapshot();
    const moments = state.moments;
    void (async () => {
      try {
        await window.electronAPI?.updateNote(recordingNoteId, {
          transcript: finalTranscript,
          ...(topics ? { conversation_topics: JSON.stringify(topics) } : {}),
          // Written on every press already; once more here so a press whose
          // write was refused still lands with the transcript it belongs to.
          ...(moments.length ? { conversation_marks: JSON.stringify(moments) } : {}),
        });
      } finally {
        finishSaved();
      }
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

  // Quitting during a conversation lands here. Main holds the quit until this
  // answers, so it answers only once the transcript is written: capture is
  // released, main transcribes what it still holds, and the Finish effect saves.
  useEffect(() => {
    const cleanup = window.electronAPI?.onFinishConversationForQuit?.(() => {
      void (async () => {
        try {
          const { isRecording, isTranscribing } = useMeetingRecordingStore.getState();
          if (isRecording || isTranscribing) {
            const saved = whenFinishSaved();
            if (isRecording) await stopRecording();
            await saved;
          }
        } finally {
          window.electronAPI?.reportConversationFinishedForQuit?.();
        }
      })();
    });
    return () => cleanup?.();
  }, []);

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

  // One alert line for anything worth saying before or around a recording.
  const notice = (tone: "warning" | "danger", text: string) => (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-5",
        tone === "danger"
          ? "border-destructive/30 bg-destructive/5 text-foreground"
          : "border-warning/30 bg-warning/5 text-foreground"
      )}
    >
      <AlertTriangle
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "danger" ? "text-destructive" : "text-warning"
        )}
      />
      <span>{text}</span>
    </div>
  );

  return (
    <>
      <section className="oats-surface flex min-h-0 flex-1 flex-col overflow-y-auto">
        {recording ? (
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-8 py-6">
            {/* Announcements: a mark on its own, and the recording's health. */}
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

            <Card className="shrink-0 gap-0 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4">
                <span aria-hidden="true" className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-recording opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-recording" />
                </span>
                {/* The clock is the heading: the one thing on this screen that is
                    unambiguously true, and what a person glances at. */}
                <h1 className="text-2xl font-semibold tabular-nums tracking-[-0.02em]">
                  <span className="sr-only">{t("oats.conversation.listening")} </span>
                  {clock(elapsed)}
                </h1>
                <Badge variant="recording">{t("oats.conversation.recordingBadge")}</Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void mark()}
                    aria-label={t("oats.conversation.markLabel")}
                    aria-keyshortcuts="M"
                    title={`${t("oats.conversation.markLabel")} (M)`}
                  >
                    <Bookmark className={cn(markedAt !== null && "fill-current")} />
                    {markedAt !== null
                      ? t("oats.conversation.marked")
                      : t("oats.conversation.mark")}
                    <Kbd className="ml-0.5">M</Kbd>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void stopRecording()}
                    aria-label={t("oats.conversation.finish")}
                  >
                    <Square className="size-3.5 fill-current" />
                    {t("oats.conversation.stop")}
                  </Button>
                </div>
              </div>

              {/* Resumed without asking — asking would cost the opening words —
                  so it says so, and offers the way out. */}
              {continuingFrom && (
                <div className="flex items-center gap-2 border-t border-border px-5 py-2.5 text-[13px] text-muted-foreground">
                  <History aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("oats.conversation.continuing", { title: continuingFrom })}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="ml-auto text-[13px]"
                    onClick={() => {
                      void (async () => {
                        await stopRecording();
                        await startFresh();
                      })();
                    }}
                  >
                    {t("oats.conversation.notAContinuation")}
                  </Button>
                </div>
              )}

              {/* The contour: every part of it measured from this conversation. */}
              <div className="border-t border-border px-5 pb-3 pt-4">
                <ConversationContour
                  contour={contour}
                  height={detailed ? "clamp(44px, 10vh, 84px)" : "clamp(56px, 16vh, 120px)"}
                  focusedGroup={focusedGroup}
                  label={contourLabel(contour, t)}
                />
              </div>

              <div className="flex items-center justify-end border-t border-border px-3 py-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetail(toggleConversationDetail(detail))}
                >
                  {detailed ? <EyeOff /> : <Eye />}
                  {detailed
                    ? t("oats.conversation.showClean")
                    : t("oats.conversation.showDetailed")}
                </Button>
              </div>
            </Card>

            {micSilentSince !== null && notice("danger", t("oats.conversation.micSilent"))}
            {atRisk.atRisk &&
              notice("danger", t("oats.conversation.notSaving", { count: atRisk.unsavedTurns }))}
            {stalled.stalled && notice("warning", t("oats.conversation.notTranscribing"))}

            {/* The question rail stays mounted in both compositions — remounting
                it on every switch re-announced every question already heard. */}
            <div
              className={cn(
                "flex min-h-0 flex-col",
                detailed && "flex-1 [@media(max-height:640px)]:min-h-[13rem]"
              )}
            >
              <div
                className={cn(
                  "group relative flex min-h-0 shrink-0 flex-col",
                  detailed ? "max-h-[52%]" : "max-h-0"
                )}
              >
                <div
                  ref={bandRef}
                  onScroll={measureBand}
                  className={cn("min-h-0", detailed ? "overflow-y-auto" : "overflow-hidden")}
                >
                  <ConversationSignalRail onFocus={setFocusedGroup} announceOnly={!detailed} />
                </div>
                <ScrollFade edges={detailed ? bandFaded : { top: false, bottom: false }} />
              </div>
              {detailed && (
                <ConversationDialogue
                  className={cn(
                    "min-h-[4.5rem] flex-1 basis-0",
                    cardCount > 0 ? "mt-4 border-t border-border pt-4" : "mt-1"
                  )}
                />
              )}
            </div>

            {detailed && (
              <div className="flex max-h-[34%] shrink-0 flex-col gap-3 overflow-y-auto pb-2">
                <LiveThreadMap />
                <OpenThreadStack
                  threads={openThreads}
                  suggestions={suggestions}
                  speaking={speaking}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-8">
            <p aria-live="polite" role="status" className="sr-only">
              {justStopped ? t("oats.conversation.statusStopped") : ""}
            </p>

            <Card className="gap-0">
              <div className="flex items-start gap-4 p-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Mic aria-hidden="true" className="size-5 text-brand-ink" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-semibold tracking-[-0.01em]">
                    {t("oats.conversation.recordTitle")}
                  </h1>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    {starting ? t("oats.conversation.preparing") : t("oats.conversation.subtitle")}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button
                      onClick={begin}
                      disabled={starting || preflight.blocking}
                      aria-label={t("oats.conversation.record")}
                    >
                      <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                      {t("oats.conversation.start")}
                    </Button>
                    {shortcut && (
                      <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Kbd>{shortcut}</Kbd>
                        {t("oats.conversation.shortcutAnywhere")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {(nothingHeard || preflight.problem) && (
                <div className="border-t border-border px-6 py-4">
                  {nothingHeard
                    ? notice("warning", t("oats.conversation.nothingHeard"))
                    : notice(
                        preflight.blocking ? "danger" : "warning",
                        t(`oats.preflight.${preflight.problem}`)
                      )}
                </div>
              )}
            </Card>

            <RecentConversations />
          </div>
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

  // The list without a query, by day: the bearing a record of conversations is
  // scanned by.
  const dayGroups = useMemo(() => {
    const names = {
      now: new Date(),
      locale: i18n.language,
      today: t("controlPanel.history.dateGroups.today"),
      yesterday: t("controlPanel.history.dateGroups.yesterday"),
    };
    // The store orders by last change; a day heading is about when it happened.
    const byTime = [...visibleNotes].sort(
      (a, b) => (parseDbTimestamp(b.created_at) || 0) - (parseDbTimestamp(a.created_at) || 0)
    );
    const groups = new Map<string, { key: string; label: string; notes: NoteItem[] }>();
    for (const note of byTime) {
      const { key, label } = ledgerDayGroup(note.created_at, names);
      const group = groups.get(key);
      if (group) group.notes.push(note);
      else groups.set(key, { key, label, notes: [note] });
    }
    return [...groups.values()];
  }, [visibleNotes, i18n.language, t]);

  // What the previous conversation on this subject left open. The lifetime graph
  // already knows which conversations share a subject; this puts that knowledge
  // where it is actually useful — at the top of the one you are reading.
  const carriedOver = useMemo(() => {
    if (!selected) return null;
    const current = readTopicSnapshot(selected.conversation_topics);
    if (!current) return null;
    const earlier = notes
      .filter((note) => note.id !== selected.id && note.conversation_topics)
      .filter((note) => parseDbTimestamp(note.created_at) < parseDbTimestamp(selected.created_at))
      .sort((a, b) => parseDbTimestamp(b.created_at) - parseDbTimestamp(a.created_at));
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
        <header className="mx-auto flex w-full max-w-3xl shrink-0 flex-col items-start gap-3 px-8 pt-6">
          <BackButton onClick={() => setView("list")} label={t("oats.shell.conversations")} />
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{t("lifetime.title")}</h1>
        </header>
        <div className="relative mt-4 min-h-0 flex-1">
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
    const speakerCount = new Set(selectedSegments.map((segment) => segment.speaker).filter(Boolean))
      .size;
    const openTurn = (segmentId: string | null) => {
      setLandedOnSegment(segmentId);
      setTab("transcript");
    };
    return (
      <section
        key="reading"
        className="oats-surface oats-enter relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-8 pb-16 pt-6">
          {/* The way back, and what can be done with the whole record. */}
          <div className="flex items-center justify-between gap-4">
            <BackButton onClick={() => setReading(false)} label={t("oats.shell.conversations")} />
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

          <div className="mt-6">
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
                className="-mx-2 block w-[calc(100%+1rem)] rounded-md border border-input bg-transparent px-2 py-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            ) : (
              // A heading you can rename is still a heading; the control that
              // makes it operable goes inside it, so it has focus, Enter, and a
              // role a screen reader announces.
              <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
                <button
                  type="button"
                  title={t("oats.intelligence.renameHint")}
                  onClick={() => {
                    setDraftTitle(selected.title || "");
                    setRenaming(true);
                  }}
                  className="-mx-2 block max-w-[calc(100%+1rem)] cursor-text rounded-md border border-transparent px-2 py-0.5 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {selected.title || t("oats.untitled")}
                </button>
              </h1>
            )}

            {/* When, for how long, with how many voices: the bearings a record is
                found again by. Each value says what it is, so no labels. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              <MetaItem icon={CalendarDays}>
                {ledgerDateLong(selected.created_at, { locale: i18n.language })}
              </MetaItem>
              {selectedSpan && <MetaItem icon={Clock}>{selectedSpan}</MetaItem>}
              {speakerCount > 0 && (
                <MetaItem icon={Users}>
                  {t("oats.intelligence.speakerCount", { count: speakerCount })}
                </MetaItem>
              )}
              {selectedMoments.length > 0 && (
                <MetaItem icon={Bookmark}>
                  {t("oats.intelligence.markedCount", { count: selectedMoments.length })}
                </MetaItem>
              )}
            </div>
          </div>

          {/* What the last conversation on this subject left unfinished. Shown
              once, at the top, because that is the moment it is useful. */}
          {carriedOver && (
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-[13px]">
              <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{t("oats.intelligence.carriedOver")}</span>
              {carriedOver.open.map((node) => (
                <Badge key={node.id} variant="outline">
                  {node.label}
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="-my-1 ml-auto"
                onClick={() => {
                  setSelectedId(carriedOver.note.id);
                  setTab("summary");
                }}
              >
                {t("oats.intelligence.openPrevious")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* The conversation's own shape: how the talking was distributed,
              where the subject turned, what was asked and how settled it came
              out. It is also the way in — a click on the trace opens the
              transcript at that moment, and the hairline under the pointer says
              when that was before you press. */}
          <Card className="mt-6 px-5 pb-4 pt-7">
            <ConversationContour
              contour={storedContour}
              height={92}
              label={contourLabel(storedContour, t)}
              onPick={(time) => {
                const segment = momentSegment({ at: time }, selectedSegments);
                openTurn(segment?.id != null ? String(segment.id) : null);
              }}
              pickLabel={(time) => clock(Math.max(0, time - (storedContour.start ?? time)))}
            />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {t("oats.conversation.contourLegend")}
            </p>
          </Card>

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as DetailTab)}
            className="mt-8 gap-5"
          >
            <TabsList>
              {(["summary", "transcript", "connections"] as DetailTab[]).map((item) => (
                <TabsTrigger key={item} value={item}>
                  {t(`oats.intelligence.tabs.${item}`)}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Certain first, inferred second: what the reader marked, then what
                was asked and how it came out, and only then the model's prose. */}
            <TabsContent value="summary" className="flex flex-col gap-4">
              <MarkedMoments
                note={selected}
                moments={selectedMoments}
                segments={selectedSegments}
                onOpenTurn={openTurn}
              />
              <ConversationReview events={events} topics={selectedTopics} onOpenTurn={openTurn} />
              {/* The summary is markdown — the pipeline emits headings and bold. */}
              <MarkdownRenderer
                content={summary}
                className="pt-2 text-[15px] leading-7 text-foreground"
              />
            </TabsContent>

            <TabsContent value="transcript">
              {finding !== null && (
                // Find in this conversation. It stays at the top of the scroll
                // while you step through the matches.
                <div className="sticky top-0 z-10 -mx-1 mb-4 bg-background px-1 pb-2 pt-1">
                  <div className="flex h-9 items-center gap-0.5 rounded-md border border-input bg-background pl-2.5 pr-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/20">
                    <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={findInputRef}
                      // Mounting is the first open, and the frame callback in
                      // the `oats-find` handler runs before this commits; it only
                      // covers a second `/` while the bar is already open.
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
                          setFindAt(
                            (at) => (at + (event.shiftKey ? findCount - 1 : 1)) % findCount
                          );
                        }
                      }}
                      aria-label={t("oats.find.label")}
                      placeholder={t("oats.find.label")}
                      autoComplete="off"
                      spellCheck={false}
                      className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <span
                      aria-live="polite"
                      className="shrink-0 px-1.5 text-xs tabular-nums text-muted-foreground"
                    >
                      {findQuery
                        ? findCount
                          ? t("oats.find.count", { current: findAt + 1, total: findCount })
                          : t("oats.find.none")
                        : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      aria-label={t("oats.find.previous")}
                      disabled={!findCount}
                      onClick={() => setFindAt((at) => (at + findCount - 1) % findCount)}
                    >
                      <ChevronUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      aria-label={t("oats.find.next")}
                      disabled={!findCount}
                      onClick={() => setFindAt((at) => (at + 1) % findCount)}
                    >
                      <ChevronDown aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      aria-label={t("oats.find.close")}
                      onClick={() => setFinding(null)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
              <TranscriptView
                note={selected}
                query={findQuery || query}
                scrollToId={landedOnSegment}
                events={events}
                moments={selectedMoments}
                currentMatch={findQuery && findCount ? findAt : null}
              />
            </TabsContent>

            <TabsContent value="connections">
              <ConnectionsView
                key={selected.id}
                note={selected}
                events={events}
                onReload={reload}
              />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    );
  }

  const openResult = (note: NoteItem) => {
    setSelectedId(note.id);
    setTab(matchedTab(note, query, t));
    setLandedOnSegment(findExcerpt(note, query)?.segmentId ?? null);
    setReading(true);
  };

  return (
    <section key="list" className="oats-surface oats-enter relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pb-16 pt-6">
        {/* Search is always here, from the first conversation: "what did that
            candidate say about equity?" is the reason to keep a record at all. */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchInputRef}
              type="search"
              aria-label={t("oats.intelligence.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("oats.intelligence.searchPlaceholder")}
              className="peer pl-8 pr-9"
            />
            {!query && (
              <Kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 peer-focus:hidden"
              >
                /
              </Kbd>
            )}
          </div>
          {notes.length > 0 && (
            <Button variant="outline" onClick={() => setView("map")}>
              <Waypoints aria-hidden="true" />
              {t("lifetime.viewMap")}
            </Button>
          )}
        </div>

        {/* The result, announced. A screen-reader user who types should not have
            to tab into the list to learn whether anything matched. */}
        <p aria-live="polite" role="status" className="sr-only">
          {/* Literal matches first, then the related ones; "only related" only
              when there are related results to speak of, so assistive output
              never claims a match the screen does not show. */}
          {!query.trim()
            ? ""
            : literalNotes.length
              ? // The count is the *literal* matches, not the row count.
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

        {/* With no literal hit, every row below is the index's guess, and the
            page says so before the reader takes them as findings. */}
        {query.trim() && !literalNotes.length && recalled.length > 0 && (
          <p className="mt-5 flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t("oats.intelligence.onlyRelated")}
          </p>
        )}

        {!visibleNotes.length ? (
          query.trim() ? (
            <EmptyState
              icon={SearchX}
              title={t("oats.intelligence.noMatches")}
              description={t("oats.intelligence.noMatchesHint")}
            />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={t("oats.intelligence.empty")}
              description={t("oats.intelligence.emptyDescription")}
              action={<StartRecordingButton />}
            />
          )
        ) : query.trim() ? (
          // Ranked, not dated: literal matches first, then the related ones, and
          // a date heading between them would break that order.
          <Card className="mt-5 gap-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {recalled.map(({ note, related }) => (
                <ConversationRow
                  key={note.id}
                  note={note}
                  query={query}
                  related={related}
                  onOpen={() => openResult(note)}
                />
              ))}
            </ul>
          </Card>
        ) : (
          dayGroups.map((group) => (
            <section key={group.key} aria-label={group.label} className="mt-6">
              <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
              <Card className="gap-0 overflow-hidden">
                <ul className="divide-y divide-border">
                  {group.notes.map((note) => (
                    <ConversationRow
                      key={note.id}
                      note={note}
                      query=""
                      related={false}
                      timeOnly
                      onOpen={() => openResult(note)}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ))
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
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between pb-4">
        <CardTitle>{t("oats.review.markedTitle")}</CardTitle>
        <Badge className="tabular-nums">{moments.length}</Badge>
      </CardHeader>
      <ul className="divide-y divide-border border-t border-border">
        {moments.map((moment) => {
          const segment = momentSegment(moment, segments);
          const time = clock(Math.max(0, moment.at - (startedAt as number)));
          return (
            <li key={moment.id} className="group flex items-start gap-3 px-5 py-3">
              <Bookmark aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className="block text-xs tabular-nums leading-6 text-muted-foreground">
                  {time}
                </span>
                {/* The words being said when Mark was pressed: a place in the
                    record, so pressing them opens the transcript there. */}
                <button
                  type="button"
                  onClick={() => onOpenTurn(segment?.id != null ? String(segment.id) : null)}
                  disabled={!segment}
                  className={cn(
                    "line-clamp-2 w-full rounded-sm text-left text-sm leading-6 text-foreground outline-none",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    segment
                      ? "decoration-muted-foreground/50 underline-offset-4 hover:underline"
                      : "cursor-default"
                  )}
                >
                  {segment ? String(segment.text ?? "").trim() : time}
                </button>
                {editing === moment.id ? (
                  <Input
                    autoFocus
                    defaultValue={moment.note}
                    maxLength={280}
                    aria-label={t("oats.review.noteLabel", { time })}
                    placeholder={t("oats.review.addNote")}
                    spellCheck
                    onBlur={(event) => void save(moment.id, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditing(null);
                    }}
                    className="mt-2 h-8 text-[13px]"
                  />
                ) : moment.note ? (
                  // The reader's own words. Pressing them edits them.
                  <button
                    type="button"
                    onClick={() => setEditing(moment.id)}
                    aria-label={t("oats.review.noteLabel", { time })}
                    className="mt-1 flex max-w-full items-start gap-1.5 rounded-sm text-left text-[13px] leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <StickyNote aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0">{moment.note}</span>
                  </button>
                ) : null}
              </div>
              {/* Row actions, on hover or focus: add a note, or take back a mark
                  pressed by mistake. A mark is a highlight, not evidence, so
                  removing it does not ask twice. */}
              {editing !== moment.id && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  {!moment.note && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("oats.review.noteLabel", { time })}
                      title={t("oats.review.addNote")}
                      onClick={() => setEditing(moment.id)}
                    >
                      <MessageSquarePlus aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("oats.review.removeMarkLabel", { time })}
                    title={t("oats.review.removeMark")}
                    onClick={() => void write(removeMoment(moments, moment.id))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * How a question came out, as a status badge. Amber for the ones worth chasing
 * (nobody knew, or nobody was sure); red is for recording and danger only.
 */
const OUTCOME_BADGE: Record<string, BadgeProps["variant"]> = {
  asked: "secondary",
  silence: "secondary",
  uncertain: "warning",
  denied: "warning",
  answered: "success",
};

/**
 * What the conversation certainly contained, above what a model wrote about it.
 *
 * Oats knows some things exactly: which questions were asked, how each came
 * out, which it went and searched, and which threads were left open. The
 * summary is prose from a small local model. So the certain part goes first and
 * the inferred part follows — an evidence tool that leads with a summary is
 * asking you to trust the weakest thing on the page.
 *
 * It is a review, not a task manager: no checkboxes, no owners, no due dates,
 * and nothing Oats had to guess. Each unresolved question is a *place* —
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
  // The answered half, on request: what was left open is the reason to come
  // back; what was answered is one press away.
  const [showAnswers, setShowAnswers] = useState(false);
  useEffect(() => setShowAnswers(false), [events]);

  // Nothing observed means nothing to review, and no "0 questions" panel.
  if (review.empty) return null;

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4 pb-4">
        <CardTitle>{t("oats.review.title")}</CardTitle>
        {/* The denominator for "three went unanswered". */}
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {t("oats.review.tally", { asked: review.asked, answered: review.answered })}
        </span>
      </CardHeader>

      {review.unresolved.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {review.unresolved.map((item) => {
            const outcome = item.outcome === "open" ? "asked" : item.outcome;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpenTurn(item.segmentId)}
                  disabled={!item.segmentId}
                  className={cn(
                    "flex w-full items-start gap-4 px-5 py-3 text-left outline-none transition-colors",
                    "focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
                    item.segmentId ? "hover:bg-muted/60" : "cursor-default"
                  )}
                >
                  <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">
                    {item.question}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    {item.searched && <Badge variant="info">{t("questionCard.searched")}</Badge>}
                    <Badge variant={OUTCOME_BADGE[outcome] ?? "secondary"}>
                      {t(`questionCard.state.${outcome}`)}
                    </Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showAnswers && (
        <ul className="divide-y divide-border border-t border-border">
          {review.answers.map((item) => (
            <li key={item.key} className="px-5 py-3">
              <p className="flex items-start gap-4 text-sm leading-6 text-foreground">
                <span className="min-w-0 flex-1">{item.question}</span>
                <Badge variant="success" className="mt-0.5">
                  {t("questionCard.state.answered")}
                </Badge>
              </p>
              {/* The words that answered it, and a place: pressing them opens
                  the transcript there. */}
              {item.reply ? (
                <button
                  type="button"
                  onClick={() => onOpenTurn(item.segmentId)}
                  disabled={!item.segmentId}
                  className="mt-1 line-clamp-2 w-full rounded-sm text-left text-[13px] leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {item.reply}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {(review.openThreads.length > 0 || review.answers.length > 0) && (
        <CardFooter className="justify-between gap-4 text-[13px] text-muted-foreground">
          {/* The labels go through the string, not beside it: appended as markup
              they read as part of the count, and the colon is spaced differently
              in French and full-width in Chinese and Japanese. */}
          <span className="min-w-0">
            {review.openThreads.length > 0 &&
              t("oats.review.openThreads", {
                count: review.openThreads.length,
                threads: review.openThreads.map((thread) => thread.label).join(", "),
              })}
          </span>
          {review.answers.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 -mr-2 shrink-0"
              aria-expanded={showAnswers}
              onClick={() => setShowAnswers((open) => !open)}
            >
              {showAnswers ? t("oats.review.hideAnswers") : t("oats.review.showAnswers")}
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform", showAnswers && "rotate-180")}
              />
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * The transcript as the timed record it is, rather than as one wall of text.
 *
 * Each turn carries its offset from the first thing said, in a quiet gutter that
 * is `aria-hidden` (a screen reader working through a transcript does not want a
 * timestamp read before every line; the time is on the paragraph as a `title`).
 * The speaker is named once per run of turns, the way every transcript reader
 * does it, and the gutter also carries the margin marks: which turns asked a
 * question, and which the reader marked.
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
  /** Which highlighted match the find bar is on, or null when it is not open. */
  currentMatch?: number | null;
}) {
  const { t } = useTranslation();
  const segments = useMemo(() => parseSegments(note.transcript), [note.transcript]);
  const target = useRef<HTMLLIElement | null>(null);
  // The match the find bar is on: marked, and brought to the middle of the
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
  // to the plain text rather than to an empty page.
  if (!segments.length) {
    return (
      <div ref={transcriptRef}>
        <article className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
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
      <ol>
        {segments.map((segment, index) => {
          const at =
            Number.isFinite(segment.timestamp) && Number.isFinite(startedAt)
              ? clock(Math.max(0, (segment.timestamp as number) - (startedAt as number)))
              : null;
          const matched = scrollToId != null && String(segment.id) === scrollToId;
          const outcome = asked.get(String(segment.id));
          const isMarked = marked.has(String(segment.id));
          const previous = index > 0 ? segments[index - 1] : null;
          const newSpeaker = !previous || speakerText(previous, t) !== speakerText(segment, t);
          return (
            <li
              key={segment.id}
              ref={matched ? target : undefined}
              className={cn(
                "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 rounded-md",
                index > 0 && (newSpeaker ? "mt-5" : "mt-1.5"),
                // The turn a search landed on. Not a highlight — a semantic match
                // has no span to highlight — but "this is the one".
                matched && "-mx-2 bg-muted/70 px-2 py-1"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex items-center justify-end gap-1.5 self-start text-xs leading-5 tabular-nums text-muted-foreground",
                  newSpeaker ? "pt-0" : "pt-1"
                )}
              >
                {isMarked && <Bookmark className="size-3 fill-current text-foreground" />}
                {outcome && (
                  <StateMark
                    state={(outcome === "open" ? "asked" : outcome) as QuestionOutcome}
                    className=""
                  />
                )}
                {at ?? ""}
              </span>
              <div className="min-w-0">
                {newSpeaker && <SpeakerName note={note} segments={segments} segment={segment} />}
                <p title={at ?? undefined} className="text-[15px] leading-7 text-foreground/90">
                  {isMarked && <span className="sr-only">{t("oats.review.markedTurn")} </span>}
                  <Highlighted text={String(segment.text ?? "")} query={query} />
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A run of turns' speaker, and the way to name them.
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
      <Input
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
        className="mb-1 h-7 w-48 px-2 text-[13px]"
      />
    );
  }

  return (
    <span className="block select-none text-[13px] font-medium leading-5 text-foreground">
      {nameable ? (
        <button
          type="button"
          onClick={() => setNaming(true)}
          aria-label={t("oats.intelligence.nameSpeaker", { speaker: label })}
          title={t("oats.intelligence.nameSpeaker", { speaker: label })}
          className="rounded-sm outline-none decoration-muted-foreground/50 underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            // The one the find bar is on is the stronger of the two marks.
            className="rounded-sm bg-highlight px-0.5 text-foreground data-[current]:bg-highlight-strong"
          >
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

/**
 * Copy it, export it, file it, or delete it.
 *
 * Whatever is being read is what leaves: the transcript tab copies and exports
 * the transcript, the other two the summary, because that is what is on the
 * screen. The tooltip and the accessible name say which.
 *
 * Saving to the vault appears only once a vault folder has been chosen, and it
 * says whether it worked — a write that quietly did nothing is the failure this
 * product does not accept.
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
  const transcript = tab === "transcript";
  const copyLabel = transcript
    ? t("oats.intelligence.copyTranscript")
    : t("oats.intelligence.copySummary");
  const exportLabel = transcript
    ? t("oats.intelligence.exportTranscript")
    : t("oats.intelligence.exportSummary");

  const payload = () =>
    transcript ? transcriptText(note.transcript, t) : note.enhanced_content || note.content || "";

  useEffect(() => setConfirming(false), [note.id]);
  useEffect(() => setFiled(null), [note.id]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (filed === null) return undefined;
    const timer = setTimeout(() => setFiled(null), 2500);
    return () => clearTimeout(timer);
  }, [filed]);

  const copy = async () => {
    const text = payload();
    if (!text.trim()) return;
    await window.electronAPI?.writeClipboard?.(text);
    setCopied(true);
  };

  const exportFile = () => {
    if (transcript) void window.electronAPI?.exportTranscript?.(note.id, "txt");
    else void window.electronAPI?.exportNote?.(note.id, "md");
  };

  // Every conversation files itself once the vault is set, so this is for the
  // ones recorded before it was.
  const file = async () => {
    const result = await window.electronAPI?.exportNoteToVault?.(note.id);
    setFiled(Boolean(result?.success));
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      {filed !== null && (
        <span
          role="status"
          className={cn(
            "flex items-center gap-1.5 text-[13px]",
            filed ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {filed ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-4" />
          )}
          {filed ? t("oats.intelligence.vaultSaved") : t("oats.intelligence.vaultFailed")}
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" aria-label={copyLabel} onClick={() => void copy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? t("oats.intelligence.copied") : t("oats.intelligence.copy")}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copyLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" aria-label={exportLabel} onClick={exportFile}>
            <Download aria-hidden="true" />
            {t("oats.intelligence.export")}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{exportLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("oats.intelligence.more")}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {vaultPath && (
            <>
              <DropdownMenuItem onSelect={() => void file()}>
                <Vault aria-hidden="true" />
                {t("oats.intelligence.vaultAction")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 aria-hidden="true" />
            {t("oats.intelligence.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Deleting a conversation is the one irreversible thing in the product,
          so it asks, and the safe answer has the focus. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("oats.intelligence.deleteConfirm")}
        description={t("oats.intelligence.deleteDescription")}
        confirmText={t("oats.intelligence.deleteYes")}
        cancelText={t("common.cancel")}
        variant="destructive"
        onConfirm={() => {
          void (async () => {
            await window.electronAPI?.deleteNote?.(note.id);
            await onDeleted();
          })();
        }}
      />
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
      // without the words moving: WCAG 2.2's 24x24 minimum for a pointer target.
      // `inline-flex` rather than `block`: these sit on baseline-aligned rows.
      className="-my-1.5 inline-flex min-h-6 items-center rounded-sm py-1.5 font-mono text-xs text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

/** Back to where the reader came from, named, the way a desktop app says it. */
function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="-ml-2.5 text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft aria-hidden="true" />
      {label}
    </Button>
  );
}

/** One fact about a record, with the icon that says which fact it is. */
function MetaItem({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 tabular-nums">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </span>
  );
}

/** The record action, from a page that has nothing to show without it. */
function StartRecordingButton() {
  const { t } = useTranslation();
  const conversationKey = useSettingsStore((state) => state.conversationKey);
  const shortcut = useMemo(
    () => formatHotkey(conversationKey, getCachedPlatform()),
    [conversationKey]
  );
  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        variant="record"
        onClick={() => void window.electronAPI?.requestToggleConversation?.()}
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-recording-foreground" />
        {t("oats.conversation.start")}
      </Button>
      {shortcut && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Kbd>{shortcut}</Kbd>
          {t("oats.conversation.shortcutAnywhere")}
        </span>
      )}
    </div>
  );
}

/** An empty page that says what would be here, and how to fill it. */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  description?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-20 flex flex-col items-center text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * One conversation in the list: its name, when, what it was about, and its
 * shape. The same row the Home page's recent list uses, plus the contour — so
 * two conversations of the same length and title still look different here,
 * because this is drawn from what was said in them.
 */
function ConversationRow({
  note,
  query,
  related,
  timeOnly = false,
  onOpen,
}: {
  note: NoteItem;
  query: string;
  related: boolean;
  /** Under a day heading the day is already said, so the row gives the time. */
  timeOnly?: boolean;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const marked = useMemo(
    () => parseMoments(note.conversation_marks ?? null).length,
    [note.conversation_marks]
  );
  const when = timeOnly
    ? ledgerTime(note.created_at, { locale: i18n.language })
    : ledgerDate(note.created_at, { locale: i18n.language });
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors hover:bg-muted/60",
          "outline-none focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
        )}
      >
        <span className="flex items-baseline gap-4">
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {note.title || t("oats.untitled")}
            </span>
            {marked > 0 && (
              <span className="flex shrink-0 items-center gap-1 self-center text-xs tabular-nums text-muted-foreground">
                <Bookmark aria-hidden="true" className="size-3" />
                <span aria-hidden="true">{marked}</span>
                <span className="sr-only">
                  {t("oats.intelligence.markedCount", { count: marked })}
                </span>
              </span>
            )}
          </span>
          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{when}</span>
        </span>
        <span className="flex items-center gap-6">
          <RecallExcerpt note={note} query={query} related={related} />
          <NoteContourStrip note={note} />
        </span>
      </button>
    </li>
  );
}

/**
 * One search result's evidence line.
 *
 * With no query this is the ordinary preview. With one it is the passage that
 * matched, marked, under a label saying where it came from — "these are the
 * words that were spoken" and "this is what a model wrote" are different claims,
 * and a tool whose premise is evidence may not present them identically.
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
      <span className="line-clamp-1 min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
        {related && (
          <Badge variant="outline" className="mr-1.5 py-0">
            {t("oats.intelligence.matchRelated")}
            <span className="sr-only">: </span>
          </Badge>
        )}
        {plainPreview(note.enhanced_content) ||
          transcriptText(note.transcript, t) ||
          t("oats.intelligence.processing")}
      </span>
    );
  }

  const source = t(`oats.intelligence.match.${excerpt.source}`);
  return (
    <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
      {/* Where it came from, and how far in: a result that says what was said
          but not when leaves you to find it again by eye. One text node, so a
          screen reader and the clipboard read "Said 12:04: …". */}
      <Badge className="mr-1.5 py-0 tabular-nums">
        {excerpt.offsetMs !== undefined ? `${source} ${clock(excerpt.offsetMs)}` : source}
        <span className="sr-only">: </span>
      </Badge>
      {excerpt.prefixed && "…"}
      {excerpt.before}
      <mark className="rounded-sm bg-highlight px-0.5 text-foreground">{excerpt.match}</mark>
      {excerpt.after}
      {excerpt.suffixed && "…"}
    </span>
  );
}

function NoteContourStrip({ note }: { note: NoteItem }) {
  // Only the rows you can see are drawn.
  //
  // The list loads a hundred conversations, and drawing a hundred strips on open
  // cost 263ms and three long tasks at DPR 2, with 18.9MB of canvas backing
  // store then retained for the life of the process. Each row parses its own
  // transcript to build its geometry, so the parse is behind the same gate.
  //
  // Once a row has been seen it stays drawn: re-drawing on every scroll reversal
  // would trade a one-off cost for a permanent one.
  const box = useRef<HTMLSpanElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
      },
      // A screen of lead time, so a strip is drawn before it is scrolled to.
      { rootMargin: "400px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);

  // The box is reserved at the strip's size so revealing one does not reflow
  // the row. A note with no transcript has no strip and never will.
  if (typeof note.transcript !== "string" || note.transcript.length < 3) return null;
  return (
    <span ref={box} className="flex h-4 min-w-[8.5rem] shrink-0 items-center justify-end gap-2">
      {seen && <LoadedContourStrip note={note} />}
    </span>
  );
}

/**
 * A conversation's contour as a sparkline, and how long it ran.
 *
 * Every strip is drawn to the same width whatever the conversation's length, so
 * the strip alone cannot say which ran longer; its length is written beside it.
 */
function LoadedContourStrip({ note }: { note: NoteItem }) {
  const { i18n } = useTranslation();
  const segments = useMemo(() => parseSegments(note.transcript), [note.transcript]);
  const strip = useContourStrip(segments, NO_EVENTS);
  if (strip.empty) return null;
  const span = formatSpan(conversationSpanMs(segments), { locale: i18n.language });
  return (
    <>
      <ConversationContour contour={strip} className="w-20" height={16} showMarks={false} />
      {span && (
        <span className="min-w-12 shrink-0 whitespace-nowrap text-right text-[13px] tabular-nums text-muted-foreground">
          {span}
        </span>
      )}
    </>
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
  const [advancedSection, setAdvancedSection] = useState<SettingsSectionType>("general");

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
    const sectionLabels: Record<SettingsSectionType, string> = {
      general: t("oats.settings.sections.general"),
      hotkeys: t("oats.settings.sections.hotkeys"),
      speechToText: t("oats.settings.sections.speechToText"),
      llms: t("oats.settings.sections.llms"),
      privacyData: t("oats.settings.sections.privacyData"),
      system: t("oats.settings.sections.system"),
    };
    return (
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border/40 px-8 py-4">
          <Button variant="ghost" size="sm" onClick={() => setAdvanced(false)}>
            <ChevronLeft size={14} /> {t("oats.nav.settings")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("oats.settings.advancedHint")}</p>
        </div>
        {/* The same quiet links as the app's own nav: words, ink for the one
            you are on, no chrome. */}
        <nav
          aria-label={t("oats.settings.sections.label")}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/40 px-8 py-3"
        >
          {ADVANCED_SECTIONS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setAdvancedSection(id)}
              aria-current={advancedSection === id ? "page" : undefined}
              className={cn(
                "rounded-sm text-[13px] transition-colors",
                "[transition-duration:var(--motion-instant)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                advancedSection === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {sectionLabels[id]}
            </button>
          ))}
        </nav>
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
              <AdvancedSettings
                activeSection={advancedSection}
                onNavigateToSection={setAdvancedSection}
              />
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

  useEffect(() => {
    const onShow = () => setSurface("intelligence");
    window.addEventListener("oats-show-conversations", onShow);
    return () => window.removeEventListener("oats-show-conversations", onShow);
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
    <TooltipProvider>
      <div
        className={cn(
          // `overflow-clip`, not `overflow-hidden`: a hidden box is still
          // scrollable by script, and `scrollIntoView` scrolls every ancestor that
          // is. Opening a search result scrolled this root by 8px — the drag band
          // and the nav slid half out of the window and stayed there, because a
          // hidden box has no scrollbar to bring them back. A clip box cannot be
          // scrolled at all.
          "relative flex h-screen flex-col overflow-clip bg-background text-foreground antialiased",
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
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            surface={surface}
            onNavigate={(next) => {
              // Settings stays closed while a conversation is live, as Cmd+, does.
              if (next === "settings" && useMeetingRecordingStore.getState().isRecording) return;
              setSurface(next);
            }}
            onOpenNote={(noteId) =>
              window.dispatchEvent(new CustomEvent("oats-open-note", { detail: noteId }))
            }
            onSearch={() => {
              setSurface("intelligence");
              requestAnimationFrame(() => {
                requestAnimationFrame(() => window.dispatchEvent(new Event("oats-focus-search")));
              });
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* The window is frameless (windowConfig.js); this band and the
              sidebar's are what move it, so they take real layout rather than
              floating over content a drag region would stop being clickable. */}
            <header
              className="flex h-[52px] shrink-0 items-center border-b border-border px-6"
              style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            >
              <h1 className="text-sm font-semibold tracking-[-0.01em]">
                {t(SURFACE_TITLES[surface])}
              </h1>
            </header>
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
        </div>
      </div>
    </TooltipProvider>
  );
}
