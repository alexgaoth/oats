import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import MicrophoneSettings from "./ui/MicrophoneSettings";
import HotkeyInput from "./ui/HotkeyInput";
import SettingsPage from "./SettingsPage";
import { MarkdownRenderer } from "./ui/MarkdownRenderer";
import MeetingRecordingMount from "./MeetingRecordingMount";
import BackgroundActionToastListener from "./notes/BackgroundActionToastListener";
import PostMigrationOnboarding from "./PostMigrationOnboarding";
import { useAppBootstrap } from "../hooks/useAppBootstrap";
import { getCachedPlatform } from "../utils/platform";
import { formatHotkey } from "../utils/hotkeyLabel";
import { initializeActions } from "../stores/actionStore";
import { runBackgroundAction } from "../stores/actionProcessingStore";
import { serializeTranscriptSegments } from "../utils/transcriptSpeakerState";
import type { TranscriptSegment } from "../stores/meetingRecordingStore";
import type {
  ConversationEvent,
  ConversationTopicNode,
  ConversationTopicSnapshot,
} from "../types/conversationEvents";
import type { NoteItem } from "../types/electron";

type Surface = "conversation" | "intelligence" | "settings";
type DetailTab = "summary" | "transcript" | "threads";

// Three destinations, named. No icons — see the nav comment in OatsWorkspace.
const nav = [
  { id: "conversation" as const },
  { id: "intelligence" as const },
  { id: "settings" as const },
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
  const wasRecording = useRef(false);

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
        "relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-8",
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
          {/* Machine state speaks in mono — the "this is what was heard" voice. */}
          <p className="relative mt-4 text-center font-mono text-xs lowercase text-muted-foreground">
            {t("oats.conversation.listeningHint")}
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
      <section key="map" className="oats-enter relative flex min-h-0 flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-3xl shrink-0 items-baseline justify-between px-8 pt-10">
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
      <section key="reading" className="oats-enter relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[68ch] px-8 pb-16 pt-10">
          <BackLink onClick={() => setReading(false)} label={t("oats.intelligence.backToList")} />

          <p className="mt-8 font-mono text-xs text-muted-foreground">
            {new Date(selected.created_at).toLocaleDateString()}
          </p>
          {renaming ? (
            <input
              autoFocus
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
            <h1
              className="mt-2 cursor-text text-3xl font-medium tracking-[-0.03em]"
              title={t("oats.intelligence.renameHint")}
              onClick={() => {
                setDraftTitle(selected.title || "");
                setRenaming(true);
              }}
            >
              {selected.title || t("oats.untitled")}
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
              needs no box (DESIGN.md §1). */}
          <div className="mt-8 flex gap-5">
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
              {transcriptText(selected.transcript) || t("oats.intelligence.noTranscript")}
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
    <section key="list" className="oats-enter relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[68ch] px-8 pb-16 pt-10">
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
                  setTab("summary");
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
    <div className="grid grid-cols-[minmax(0,13rem)_1fr] items-start gap-x-10 border-b border-border/40 py-4 last:border-b-0">
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

// Sensible starting points so the one visible choice actually produces a working
// pipeline. Anything more specific belongs behind Advanced.
const DEFAULT_LOCAL_MODEL = "qwen3.5-4b-q4_k_m";
const DEFAULT_CLOUD_MODEL = "gpt-5.6-terra";

const selectClass =
  // A line rather than a box. A boxed control on a quiet page reads as a form
  // field in a SaaS dashboard; the hairline goes gold only while focused, which
  // is the one moment the accent is earning something (DESIGN.md §3, §6).
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
  const preferBuiltInMic = useSettingsStore((s) => s.preferBuiltInMic);
  const setPreferBuiltInMic = useSettingsStore((s) => s.setPreferBuiltInMic);
  const micDeviceId = useSettingsStore((s) => s.selectedMicDeviceId);
  const micDeviceLabel = useSettingsStore((s) => s.selectedMicDeviceLabel);
  const setSelectedMicDevice = useSettingsStore((s) => s.setSelectedMicDevice);
  const meetingKey = useSettingsStore((s) => s.meetingKey);
  const conversationKey = useSettingsStore((s) => s.conversationKey);
  const setConversationKey = useSettingsStore((s) => s.setConversationKey);
  const setMeetingKey = useSettingsStore((s) => s.setMeetingKey);
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
          <SettingsPage />
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl overflow-y-auto px-8 pb-10 pt-10">
      <h1 className="text-3xl font-medium lowercase tracking-[-0.03em]">
        {t("oats.settings.title")}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {t("oats.settings.subtitle")}
      </p>

      <div className="mt-8">
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
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("oats.settings.apiKeyPlaceholder")}
              type="password"
              className={cn(selectClass, "mt-3")}
            />
          )}
        </Row>

        <Row label={t("oats.settings.microphone")} hint={t("oats.settings.microphoneHint")}>
          <MicrophoneSettings
            preferBuiltInMic={preferBuiltInMic}
            selectedMicDeviceId={micDeviceId}
            selectedMicDeviceLabel={micDeviceLabel}
            onPreferBuiltInChange={setPreferBuiltInMic}
            onDeviceSelect={setSelectedMicDevice}
          />
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

        <Row label={t("oats.settings.shortcut")}>
          <div className="max-w-sm">
            <HotkeyInput
              value={meetingKey}
              onChange={(value) => void setMeetingKey(value)}
              onClear={() => void setMeetingKey("")}
            />
            {hotkeyRejection?.key === "meetingKey" && (
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
        className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

  const showSettings = useCallback(() => {
    // Same reasoning as the Cmd+, gate below.
    if (useMeetingRecordingStore.getState().isRecording) return;
    setSurface("settings");
  }, []);
  const { showPostMigration, dismissPostMigration } = useAppBootstrap(showSettings);

  // Cmd/Ctrl+, is the platform convention for settings, and it used to open a
  // modal that no longer renders.
  //
  // It is refused while a conversation is live. `ConversationSurface` is the
  // only registrant of `onToggleConversation` and the only holder of the effect
  // that writes the transcript and runs the intelligence pipeline, so leaving
  // that surface mid-recording strands the recording: the global hotkey can no
  // longer stop it, there is no visible stop control, and the transcript is
  // never finalised. That is the one unforgivable failure in this product.
  //
  // The nav is already hidden while recording (§9.8 — the tool gets out of the
  // way), so refusing here just makes the keyboard agree with what is on screen.
  // The deeper fix is to hoist the conversation lifecycle out of the surface so
  // it cannot be unmounted at all; that is recorded in UI_OVERHAUL.md.
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

  const content = useMemo(
    () =>
      surface === "conversation" ? (
        <ConversationSurface />
      ) : surface === "intelligence" ? (
        <IntelligenceSurface />
      ) : (
        <SettingsSurface />
      ),
    [surface]
  );
  const recording = useMeetingRecordingStore((state) => state.isRecording);

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
      <PostMigrationOnboarding
        open={showPostMigration}
        onOpenChange={(open) => {
          if (!open) void dismissPostMigration();
        }}
        onDone={dismissPostMigration}
      />

      {/* The world, behind everything and present on every surface. The wheat
          only grows while a conversation is live. */}
      {/* The window is frameless (windowConfig.js) and nothing else provides a
          drag handle, so on Linux and Windows it could not be moved at all. The
          top of the composition is empty sky, which makes it the right place for
          an invisible one. macOS gets its traffic lights from titleBarStyle. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-10 h-9"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Full strength on Conversation, which is the surface the world is for.
          Intelligence and Settings are for reading, so the sky recedes to a
          suggestion rather than drawing a horizon through a paragraph. */}
      <Field live={recording} intensity={surface === "conversation" ? 1 : 0.3} />

      {/* Keyed on the surface so switching remounts and replays the enter
          animation; CrossFade holds the outgoing view underneath for the length
          of the transition so the two overlap rather than leaving a blank frame
          (DESIGN.md §8: "the outgoing view dims to 0 as the incoming rises"). */}
      <main
        key={surface}
        className="oats-enter relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {content}
      </main>

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
