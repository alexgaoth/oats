import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ForceGraph from "../notes/ForceGraph";
import { ledgerDate } from "../../helpers/ledgerDate.mjs";
import ArcTimeline from "./ArcTimeline";
import type { TimelineConversation } from "./ArcTimeline";
import { forceLayoutKey } from "./boardPersistence";
import { useGlobalHighlight } from "./highlightStore";
import type { HighlightSource } from "./highlightStore";
import type { BoardNode, TabGraph } from "./useBoardData";
import { cn } from "../lib/utils";

// The widgets a board can hold. Each draws one tab's conversations and reads
// and writes the board's one highlight, so pointing at a conversation in any
// of them lights it in all of them.

/** Fewer than this and a force graph has no shape: two dots and a line is a list. */
export const MIN_FORCE_CONVERSATIONS = 3;
/** Fewer than this and there is no line to put conversations along. */
export const MIN_TIMELINE_CONVERSATIONS = 2;

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <p className="max-w-xs text-pretty text-center text-[13px] leading-5 text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

/** Report the pointer or the keyboard reaching a conversation, or leaving one. */
function usePointAtConversation() {
  return useCallback((id: number | null, previous: number | null) => {
    const store = useGlobalHighlight.getState();
    if (id !== null) store.pointAtConversation(id);
    else if (previous !== null) store.leaveConversation(previous);
  }, []);
}

/** A press between conversations lets go of the one selected. */
const deselect = () => useGlobalHighlight.getState().select(null);

/** How a conversation is named to a screen reader: title, day, and how many topics. */
function useDescribe() {
  const { t, i18n } = useTranslation();
  return useCallback(
    (title: string, createdAt: number, count: number) =>
      t("oats.global.node", {
        title,
        date: ledgerDate(createdAt, { locale: i18n.language }),
        count,
      }),
    [t, i18n.language]
  );
}

export function ForceGraphWidget({
  tabId,
  graph,
  highlight,
  onOpen,
}: {
  tabId: string;
  graph: TabGraph;
  highlight: HighlightSource;
  onOpen: (id: number) => void;
}) {
  const { t } = useTranslation();
  const point = usePointAtConversation();
  const describe = useDescribe();
  if (graph.nodes.length < MIN_FORCE_CONVERSATIONS) {
    return (
      <WidgetEmpty>
        {t("oats.global.widgets.force.empty", { count: MIN_FORCE_CONVERSATIONS })}
      </WidgetEmpty>
    );
  }
  return (
    <ForceGraph<BoardNode>
      nodes={graph.nodes}
      edges={graph.edges}
      highlight={highlight}
      surface="card"
      roving
      layoutKey={forceLayoutKey(tabId)}
      onHoverChange={point}
      onActivate={(node) => onOpen(node.id)}
      onBackgroundPress={deselect}
      aria-label={t("oats.global.widgets.force.name")}
      nodeDescription={(node) => describe(node.label, node.createdAt, node.topicCount)}
    />
  );
}

/** One subject that comes back, and how many conversations carry it. */
export function SubjectChip({ subject }: { subject: TabGraph["subjects"][number] }) {
  const { t } = useTranslation();
  const lit = useGlobalHighlight((state) => state.hoveredSubject === subject.label);
  const point = () => useGlobalHighlight.getState().pointAtSubject(subject.label);
  const leave = () => useGlobalHighlight.getState().leaveSubject(subject.label);
  return (
    <button
      type="button"
      aria-label={t("oats.global.subjects.chip", {
        label: subject.label,
        count: subject.conversationIds.length,
      })}
      onPointerEnter={point}
      onPointerLeave={leave}
      onFocus={point}
      onBlur={leave}
      className={cn(
        "inline-flex h-6 cursor-default items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium text-foreground outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        lit ? "border-foreground" : "border-border"
      )}
    >
      {subject.label}
      <span className="font-normal tabular-nums text-muted-foreground">
        {subject.conversationIds.length}
      </span>
    </button>
  );
}

/** The subjects that come back, above the timeline: pointing at one lights its arcs. */
export function SubjectLine({ subjects }: { subjects: TabGraph["subjects"] }) {
  const { t } = useTranslation();
  if (!subjects.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-1 pt-0.5">
      <span className="text-[13px] text-muted-foreground">{t("oats.global.subjects.caption")}</span>
      {subjects.map((subject) => (
        <SubjectChip key={subject.label} subject={subject} />
      ))}
    </div>
  );
}

/** Every subject that comes back, most often first: pointing at one lights it everywhere. */
export function SubjectsWidget({ subjects }: { subjects: TabGraph["subjects"] }) {
  const { t } = useTranslation();
  if (!subjects.length) {
    return <WidgetEmpty>{t("oats.global.widgets.subjects.empty")}</WidgetEmpty>;
  }
  return (
    <ul
      aria-label={t("oats.global.widgets.subjects.name")}
      className="flex h-full flex-wrap content-start gap-1.5 overflow-y-auto px-3.5 pb-3 pt-0.5"
    >
      {subjects.map((subject) => (
        <li key={subject.label}>
          <SubjectChip subject={subject} />
        </li>
      ))}
    </ul>
  );
}

/** How many subjects the timeline names above itself. */
const SUBJECTS_ABOVE_TIMELINE = 5;

export function ArcTimelineWidget({
  graph,
  highlight,
  onOpen,
}: {
  graph: TabGraph;
  highlight: HighlightSource;
  onOpen: (id: number) => void;
}) {
  const { t } = useTranslation();
  const point = usePointAtConversation();
  const describe = useDescribe();
  const conversations: TimelineConversation[] = useMemo(
    () =>
      graph.nodes.map((node) => ({ id: node.id, title: node.label, createdAt: node.createdAt })),
    [graph.nodes]
  );
  const topics = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.topicCount])),
    [graph.nodes]
  );
  if (graph.nodes.length < MIN_TIMELINE_CONVERSATIONS) {
    return (
      <WidgetEmpty>
        {t("oats.global.widgets.arcs.empty", { count: MIN_TIMELINE_CONVERSATIONS })}
      </WidgetEmpty>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <SubjectLine subjects={graph.subjects.slice(0, SUBJECTS_ABOVE_TIMELINE)} />
      <div className="min-h-0 flex-1">
        <ArcTimeline
          conversations={conversations}
          edges={graph.edges}
          highlight={highlight}
          onHoverChange={point}
          onActivate={onOpen}
          onBackgroundPress={deselect}
          aria-label={t("oats.global.widgets.arcs.name")}
          describe={(conversation) =>
            describe(conversation.title, conversation.createdAt, topics.get(conversation.id) ?? 0)
          }
        />
      </div>
    </div>
  );
}
