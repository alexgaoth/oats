import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import OpenThreadStack from "./conversation/OpenThreadStack";
import Field from "./conversation/Field";
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
import type { TranscriptSegment } from "../stores/meetingRecordingStore";
import type {
  ConversationEvent,
  ConversationTopicNode,
  ConversationTopicSnapshot,
} from "../types/conversationEvents";
import type { NoteItem } from "../types/electron";

// Advanced Settings is the inherited OpenWhispr settings application: every
// provider, every model picker, every diagnostic. It is behind a deliberate,
// non-default path (DESIGN.md §13), and a static import pulled all of it — and
// everything it imports — into the chunk that has to render before the first
// conversation. Splitting it means the Oats path never pays for a room it does
// not walk into.
const AdvancedSettings = React.lazy(() => import("./SettingsPage"));

type Surface = "conversation" | "intelligence" | "settings";
type DetailTab = "summary" | "transcript" | "threads";

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
function plainPreview(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptText(raw: string | null): string {
  if (!raw) return "";
  try {
    const segments = JSON.parse(raw);
    if (Array.isArray(segments)) {
      return segments
        .map((s) => `${s.source === "mic" ? "You" : "Conversation"}: ${s.text}`)
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
    return Array.isArray(parsed) ? (parsed as TranscriptSegment[]) : [];
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

/** How long the last-heard echo stays before the line returns to the hint. */
const LAST_HEARD_MS = 6000;
const LAST_HEARD_MAX_CHARS = 110;

/**
 * The tail of the last finalised utterance, held for a few seconds.
 *
 * Positive proof of hearing: the dead-microphone warning says when nothing has
 * arrived for thirty seconds; this says — quietly, in the machine's own mono
 * voice — that something just did. It is an echo, not a transcript: one line,
 * replaced in place with no animation (motion in the corner of an eye is the
 * exact thing §9.8 forbids), gone six seconds after the room goes quiet.
 */
function useLastHeard(recording: boolean): string | null {
  const lastSegment = useMeetingRecordingStore((s) => s.segments[s.segments.length - 1] ?? null);
  const [echo, setEcho] = useState<string | null>(null);
  useEffect(() => {
    if (!recording || !lastSegment?.text?.trim()) {
      setEcho(null);
      return undefined;
    }
    // A resumed conversation seeds the previous session's segments; echoing a
    // half-hour-old line as proof of hearing would be a small lie. Segments
    // without a timestamp fail open — better a rare stale echo than a mute one.
    if (lastSegment.timestamp && Date.now() - lastSegment.timestamp > 15_000) {
      setEcho(null);
      return undefined;
    }
    const text = lastSegment.text.trim();
    setEcho(text.length > LAST_HEARD_MAX_CHARS ? `…${text.slice(-LAST_HEARD_MAX_CHARS)}` : text);
    const timer = window.setTimeout(() => setEcho(null), LAST_HEARD_MS);
    return () => window.clearTimeout(timer);
  }, [recording, lastSegment]);
  return echo;
}

function ConversationSurface() {
  const recording = useMeetingRecordingStore((s) => s.isRecording);
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
  const lastHeard = useLastHeard(recording);
  const wasRecording = useRef(false);
  // Checked before the first word rather than discovered after the last one.
  const preflight = useConversationPreflight();

  useEffect(() => {
    if (!wasRecording.current || recording) {
      wasRecording.current = recording;
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
    void (async () => {
      await window.electronAPI?.updateNote(recordingNoteId, {
        transcript: finalTranscript,
        ...(topics ? { conversation_topics: JSON.stringify(topics) } : {}),
      });
      const action = (await initializeActions()).find((item) => item.is_builtin);
      if (!action) return;
      const settings = useSettingsStore.getState();
      const config = selectResolvedNoteFormatting(settings);
      const formatted = transcriptText(finalTranscript);
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
  }, [recording, recordingNoteId, transcript, t]);

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
    <section
      className={cn(
        "oats-surface relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-8",
        // The composition sits in the sky, above the horizon, rather than dead
        // centre — dead centre reads as an error page, and the ground below
        // belongs to the field.
        "justify-center pb-[34vh]"
      )}
    >
      {/* The seed is the button, and the button becomes the pulse. One object in
          two states rather than a control and an unrelated indicator: press the
          husked oat and it starts breathing (DESIGN.md §9.1, §9.2). */}
      <button
        type="button"
        disabled={starting}
        onClick={recording ? () => void stopRecording() : begin}
        aria-label={recording ? t("oats.conversation.finish") : t("oats.conversation.record")}
        className={cn(
          "group relative flex h-28 w-28 items-center justify-center rounded-full",
          "transition-transform [transition-duration:var(--motion-base)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          !recording && "hover:scale-[1.04] active:scale-[0.98]"
        )}
      >
        <ListeningPulse state={recording ? "live" : "idle"} size="lg" />
      </button>

      <h1
        className={cn(
          "relative mt-9 max-w-lg text-center lowercase text-foreground",
          "text-[2.5rem] font-medium leading-[1.1] tracking-[-0.03em]"
        )}
      >
        {recording ? t("oats.conversation.listening") : t("oats.conversation.title")}
      </h1>

      {recording ? (
        <>
          {/* Machine state speaks in mono — the "this is what was heard" voice.
              While an utterance is fresh the line IS what was heard; when the
              room has been quiet for a moment it returns to the hint. */}
          <p className="relative mt-4 w-full max-w-md truncate text-center font-mono text-xs lowercase text-muted-foreground">
            {lastHeard ?? t("oats.conversation.listeningHint")}
          </p>
          {/* Said plainly rather than asked. Oats resumed a recent conversation
              instead of stopping to check, because the check would have cost
              the first thing anybody said. */}
          {continuingFrom && (
            <p className="relative mt-2 text-center font-mono text-xs text-muted-foreground">
              {t("oats.conversation.continuing", { title: continuingFrom })}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="relative mt-4 max-w-md text-center text-sm leading-6 text-muted-foreground">
            {starting ? t("oats.conversation.preparing") : t("oats.conversation.subtitle")}
          </p>
          {/* The app teaches its own shortcut. This is the highest-value line on
              the screen for somebody who has not learned it yet, because after
              they have, they will never open this window to record again. */}
          {shortcut && (
            <p className="relative mt-7 text-center font-mono text-xs text-muted-foreground/80">
              {shortcut}
            </p>
          )}
        </>
      )}

      {/* The microphone went flat for long enough that the room being quiet is the
          less likely explanation. Said once, quietly, while there is still time
          to fix it — not discovered at the end when the recording is already gone. */}
      {recording && micSilentSince !== null && (
        <p className="relative mt-6 max-w-sm text-center text-xs leading-5 text-foreground">
          {t("oats.conversation.micSilent")}
        </p>
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

      {recording && (
        <OpenThreadStack
          threads={openThreads}
          suggestions={suggestions}
          speaking={speaking}
          className="relative mt-10"
        />
      )}
    </section>
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
    return parsed as ConversationTopicSnapshot;
  } catch {
    return null;
  }
}

function ThreadsView({
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
          column width so labels have somewhere to sit. */}
      <div className="h-[26rem] w-full">
        <TopicGraph
          snapshot={snapshot}
          selectedId={selectedTopic?.id ?? null}
          onSelect={setSelectedTopic}
          layoutKey={`oats:topic-layout:${note.id}`}
        />
      </div>
      {/* The panel exists only once a topic is selected. A permanent column
          holding "select a topic to see…" is a third region carrying an
          instruction rather than content. */}
      {selectedTopic && (
        <aside className="mt-6 border-t border-border/40 pt-5">
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
  );
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
  const { t } = useTranslation();
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

  useEffect(() => {
    void initializeNotes("meeting", 100);
  }, []);

  // The recall hotkey's landing: back to the list with the filter focused.
  // The input only renders past four conversations; with fewer, landing on
  // the short list is already the answer.
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
  useEffect(() => {
    if (notes.length && selectedId == null) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  // Local filter over title, summary, and transcript. Everything is already in
  // memory, so this needs no index and no IPC — and it is the only way to find a
  // conversation by what was said in it rather than by scrolling.
  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return notes;
    return notes.filter((note) =>
      [note.title, note.enhanced_content, note.transcript]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase().includes(needle))
    );
  }, [notes, query]);

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

  // Three regions — rail, list, detail — is a mail client, and DESIGN.md §1 is
  // explicit that a surface needing a third region is really two screens. So the
  // list *is* the screen until you open something, and then the reading view
  // replaces it. Nothing is ever half-visible in a column you are not using.
  if (view === "map") {
    return (
      <section key="map" className="oats-surface oats-enter relative flex min-h-0 flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-3xl shrink-0 items-baseline justify-between px-8 pt-4">
          <h1 className="text-2xl font-medium lowercase tracking-[-0.03em]">
            {t("lifetime.title")}
          </h1>
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

          <p className="mt-8 font-mono text-xs text-muted-foreground">
            {new Date(selected.created_at).toLocaleDateString()}
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
              className="mt-2 w-full border-b border-border bg-transparent pb-1 text-3xl font-medium tracking-[-0.03em] focus-visible:border-primary focus-visible:outline-none"
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

          {/* Text links, not tabs. A tab bar is a box drawn around a choice that
              needs no box (DESIGN.md §1). The three actions sit on the same line,
              pushed to the far side: they belong to what is being read, and a
              second row for them would be a third region (§1). */}
          <div className="mt-8 flex items-baseline justify-between gap-6">
            <div className="flex gap-5">
              {(["summary", "transcript", "threads"] as DetailTab[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  aria-current={tab === item ? "true" : undefined}
                  className={cn(
                    "rounded-sm text-sm lowercase transition-colors",
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
            <MarkdownRenderer
              content={summary}
              className="mt-7 text-[15px] leading-7 text-foreground"
            />
          )}
          {tab === "transcript" && (
            <article className="mt-7 whitespace-pre-wrap font-mono text-[13px] leading-7 text-muted-foreground">
              <Highlighted
                text={transcriptText(selected.transcript) || t("oats.intelligence.noTranscript")}
                query={query}
              />
            </article>
          )}
          {tab === "threads" && (
            <ThreadsView key={selected.id} note={selected} events={events} onReload={reload} />
          )}
        </div>
      </section>
    );
  }

  return (
    <section key="list" className="oats-surface oats-enter relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[68ch] px-8 pb-16 pt-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-medium lowercase tracking-[-0.03em]">
            {t("oats.intelligence.listTitle")}
          </h1>
          {notes.length > 0 && (
            <BackLink onClick={() => setView("map")} label={t("lifetime.viewMap")} />
          )}
        </div>

        {/* The filter appears when there is enough to filter, and it is a line
            rather than a box — a permanent bordered input is chrome for a
            capability most sessions never reach for. */}
        {notes.length > 4 && (
          <input
            ref={searchInputRef}
            type="search"
            aria-label={t("oats.intelligence.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("oats.intelligence.searchPlaceholder")}
            className="mt-6 w-full border-b border-border bg-transparent pb-2 text-sm placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none"
          />
        )}

        {visibleNotes.length ? (
          <div className="mt-8">
            {visibleNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => {
                  setSelectedId(note.id);
                  // Land where the match is. Opening every result on the summary
                  // meant that finding a conversation by something said in it
                  // dropped you at the top of a different document, with the
                  // sentence you searched for still to be hunted for by eye.
                  setTab(matchedTab(note, query));
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
                    {new Date(note.created_at).toLocaleDateString()}
                  </p>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-muted-foreground">
                  {plainPreview(note.enhanced_content) ||
                    transcriptText(note.transcript).slice(0, 160) ||
                    t("oats.intelligence.processing")}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            line={query ? t("oats.intelligence.noMatches") : t("oats.intelligence.empty")}
            hint={query ? null : t("oats.intelligence.emptyHint")}
          />
        )}
      </div>
    </section>
  );
}

/** Which tab to open a search result on. The rule itself is in `conversationSearch`. */
function matchedTab(note: NoteItem, query: string): DetailTab {
  return matchTarget(
    {
      title: note.title,
      summary: note.enhanced_content,
      transcript: transcriptText(note.transcript),
    },
    query
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
            className="rounded-sm bg-primary/25 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

/**
 * Copy it, save it, or delete it.
 *
 * Until now a conversation could be recorded and read and nothing else: there
 * was no way to get the text out of Oats and no way to remove one at all, which
 * for a tool holding unannounced work is the more serious of the two.
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

  // Whatever is being read is what leaves — no menu of formats, no dialog asking
  // which part. The transcript tab copies the transcript, the other two copy the
  // summary, because that is what is on the screen.
  const payload = () =>
    tab === "transcript"
      ? transcriptText(note.transcript)
      : note.enhanced_content || note.content || "";

  useEffect(() => setConfirming(false), [note.id, tab]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

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

  if (confirming) {
    return (
      <div className="flex shrink-0 items-baseline gap-4">
        <span className="font-mono text-xs lowercase text-foreground">
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
      {/* Deleting a conversation is the one irreversible thing in the product, so
          it asks — in place, on the same line, rather than in a modal. A dialog
          would be the only modal in Oats; a second press is the same guarantee
          with none of the chrome. */}
      <QuietAction label={t("oats.intelligence.delete")} onClick={() => setConfirming(true)} />
    </div>
  );
}

function QuietAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm font-mono text-xs lowercase text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      className="rounded-sm font-mono text-xs lowercase text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <p className="font-mono text-sm lowercase text-muted-foreground">{line}</p>
      {hint && shortcut && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">
          {hint.replace("{{shortcut}}", shortcut)}
        </p>
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
    <div className="grid grid-cols-[minmax(0,18rem)_1fr] items-start gap-x-8 border-b border-border/40 py-3 last:border-b-0">
      <div className="min-w-0">
        <label className="text-sm text-foreground" htmlFor={htmlFor}>
          {label}
        </label>
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
        <QuietAction label={t("oats.settings.micChange")} onClick={() => void openPicker()} />
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

// Sensible starting points so the one visible choice actually produces a working
// pipeline. Anything more specific belongs behind Advanced.
const DEFAULT_LOCAL_MODEL = "qwen3.5-4b-q4_k_m";
const DEFAULT_CLOUD_MODEL = "gpt-5.6-terra";

const selectClass =
  // A line rather than a box. A boxed control on a quiet page reads as a form
  // field in a SaaS dashboard; the hairline goes gold only while focused, which
  // is the one moment the accent is earning something (DESIGN.md §3, §6).
  // No opt-out class is needed: the inherited input chrome is an element
  // selector, but it is scoped out of `.oats-surface` in index.css, so these
  // utilities are the only thing describing this control.
  "h-10 w-full max-w-sm border-b border-border bg-transparent text-sm transition-colors [transition-duration:var(--motion-instant)] focus-visible:border-primary focus-visible:outline-none";

function SettingsSurface() {
  const transcriptionMode = useSettingsStore((s) => s.transcriptionMode);
  const setTranscriptionMode = useSettingsStore((s) => s.setTranscriptionMode);
  const cleanupMode = useSettingsStore((s) => s.cleanupMode);
  const setCleanupMode = useSettingsStore((s) => s.setCleanupMode);
  const apiKey = useSettingsStore((s) => s.openaiApiKey);
  const setApiKey = useSettingsStore((s) => s.setOpenaiApiKey);
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <p className="px-8 py-6 font-mono text-xs lowercase text-muted-foreground">
                {t("oats.settings.advancedLoading")}
              </p>
            }
          >
            <AdvancedSettings />
          </Suspense>
        </div>
      </section>
    );
  }

  return (
    <section className="oats-surface mx-auto w-full max-w-2xl overflow-y-auto px-8 pb-5">
      <h1 className="text-2xl font-medium lowercase tracking-[-0.03em]">
        {t("oats.settings.title")}
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {t("oats.settings.subtitle")}
      </p>

      <div className="mt-3">
        <Row label={t("oats.settings.processing")} hint={t("oats.settings.processingHint")}>
          {/* The same language as the nav and the reading tabs: a word, and a
              gold rule under the live one. Two filled slabs made the most
              consequential setting on the page also the loudest object on it,
              and put a second gold next to the toggle (DESIGN.md §3). */}
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
                    "relative rounded-sm pb-1.5 text-sm lowercase transition-colors",
                    "[transition-duration:var(--motion-instant)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {copy}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-px origin-center bg-primary transition-transform",
                      "[transition-duration:var(--motion-base)]",
                      active ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </button>
              );
            })}
          </div>
          {!local && (
            <input
              id="api-key"
              name="openai-api-key"
              aria-label={t("oats.settings.apiKeyPlaceholder")}
              // A password manager offering to fill a login here, or to save an
              // API key as one, is noise on the one screen that is meant to be
              // quiet.
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("oats.settings.apiKeyPlaceholder")}
              type="password"
              className={cn(selectClass, "mt-3")}
            />
          )}
        </Row>

        <Row label={t("oats.settings.microphone")} htmlFor="microphone">
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
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
            <option value="it">Italian</option>
            <option value="zh">Chinese</option>
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
        <Row label={t("oats.settings.autoSearch")} hint={t("oats.settings.autoSearchHint")}>
          {/* A boolean is a toggle. Rendering it as two slabs made it look like a
              bigger decision than the mic preference directly above it, which is
              the same shape and already uses a toggle. */}
          <Toggle checked={autoSearch} onChange={setAutoSearch} />
        </Row>

        <Row label={t("oats.settings.data")} hint={t("oats.settings.dataHint")}>
          {/* A link, not a button. Opening a folder is a side errand, not an
              action the page is for. */}
          <button
            type="button"
            onClick={() => window.electronAPI?.openLogsFolder?.()}
            className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("oats.settings.openDataFolder")}
          </button>
        </Row>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced(true)}
        className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("oats.settings.advanced")}
        <ChevronRight size={12} />
      </button>
    </section>
  );
}

export default function OatsWorkspace() {
  const { t } = useTranslation();
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
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
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

      {/* Full strength on Conversation, which is the surface the world is for.
          Intelligence and Settings are for reading, so the sky recedes to a
          suggestion rather than drawing a horizon through a paragraph — and it
          stops moving there too. A dimmed backdrop is not worth a GPU frame
          every 16ms behind a page of text, still less behind another window
          (the control panel disables Chromium's background throttling). A
          conversation always pins this surface, so the wheat never freezes
          part-grown. */}
      <Field
        live={recording}
        intensity={surface === "conversation" ? 1 : 0.3}
        animate={surface === "conversation"}
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
      <div
        aria-hidden="true"
        className="relative z-20 h-9 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
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
      <div className="oats-enter relative min-h-0 flex-1">
        {SURFACES.map(({ id, render }) => (
          <main
            key={id}
            data-active={surface === id}
            inert={surface !== id}
            aria-hidden={surface !== id}
            className="oats-pane absolute inset-0 flex min-h-0 flex-col overflow-hidden"
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

      {/* Navigation stands on the ground rather than running down the side.
          Three destinations do not earn a permanent 208px rail, and a rail cuts
          the horizon in half — the whole composition depends on the window
          being uninterrupted edge to edge (DESIGN.md §1: chrome is the enemy).

          Words, no icons: Mic / Brain / Gear were generic glyphs doing no work
          beside three unambiguous labels, and §10 prefers a word over an icon
          wherever space allows. */}
      <nav
        aria-label={t("oats.nav.label")}
        className={cn(
          "relative flex shrink-0 items-center justify-center gap-9 pb-7 pt-4",
          "transition-opacity [transition-duration:var(--motion-slow)]",
          // Nothing but the field, the pulse and the cards while somebody is
          // talking. The tool gets out of the way.
          recording && "pointer-events-none opacity-0"
        )}
      >
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setSurface(item.id)}
            aria-current={surface === item.id ? "page" : undefined}
            className={cn(
              "relative rounded-sm px-1 pb-1.5 text-sm lowercase transition-colors",
              "[transition-duration:var(--motion-instant)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              surface === item.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`oats.nav.${item.id}`)}
            {/* Ink, not gold. This underline is on screen on *every* surface, so
                a gold one guaranteed a second accent competing with the seed,
                the processing choice, or a selected graph node — §3 allows one. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-1 bottom-0 h-px origin-center bg-foreground transition-transform",
                "[transition-duration:var(--motion-base)]",
                surface === item.id ? "scale-x-100" : "scale-x-0"
              )}
            />
          </button>
        ))}
      </nav>
    </div>
  );
}
