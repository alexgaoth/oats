import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ledgerDate } from "../../helpers/ledgerDate.mjs";
import { cn } from "../lib/utils";
import { shortTitle } from "./boardData";
import type { BoardConversation } from "./boardData";
import { useGlobalHighlight } from "./highlightStore";
import type { HighlightSource } from "./highlightStore";
import { markTone } from "./linkedHighlight";
import { openQuestionRows } from "./openQuestions";
import type { OpenQuestionRow } from "./openQuestions";
import { WidgetEmpty } from "./widgets";

// Open questions: every question in this tab's conversations that has no
// verdict, newest first. Each row is a place, not just a sentence: a click
// opens its conversation at the turn it was asked in, and pointing at a row
// lights its conversation everywhere on the board.

// A conversation's events, once read, by id. Kept for the session: a finished
// conversation's questions change only when its count does.
const read = new Map<number, { count: number | null; events: unknown[] }>();

/** The events of the conversations that may hold an open question. */
function useOpenQuestionEvents(conversations: BoardConversation[]): Map<number, unknown[]> {
  // A count of 0 was taken at Finish and means none; null means never counted.
  const candidates = useMemo(
    () => conversations.filter((conversation) => conversation.openQuestions !== 0),
    [conversations]
  );
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const missing = candidates.filter(
      (conversation) => read.get(conversation.id)?.count !== conversation.openQuestions
    );
    if (!missing.length) return undefined;
    let cancelled = false;
    void Promise.all(
      missing.map((conversation) =>
        Promise.resolve(window.electronAPI?.listConversationEvents?.(conversation.id))
          .then((events) => {
            read.set(conversation.id, {
              count: conversation.openQuestions,
              events: Array.isArray(events) ? events : [],
            });
          })
          .catch(() => {
            // Left out of the list rather than shown wrong.
          })
      )
    ).then(() => {
      if (!cancelled) setVersion((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [candidates]);
  return useMemo(() => {
    void version;
    const byId = new Map<number, unknown[]>();
    for (const conversation of candidates) {
      const entry = read.get(conversation.id);
      if (entry) byId.set(conversation.id, entry.events);
    }
    return byId;
  }, [candidates, version]);
}

/**
 * One question. Its own subscription decides whether its ring is honey, so
 * pointing at something re-renders only the rows whose ring changes, not the
 * whole list: a hundred rows re-rendered on every move of the pointer cost
 * more than every chart on the board redrawn.
 */
const QuestionRow = memo(function QuestionRow({
  row,
  where,
  highlight,
  onOpenAt,
}: {
  row: OpenQuestionRow;
  where: string | null;
  highlight: HighlightSource;
  onOpenAt: (noteId: number, segmentId: string | null) => void;
}) {
  const id = row.noteId;
  // Lit with every widget, so a day or a subject pointed at elsewhere lights
  // its questions too. A conversation with questions but no topics is on no
  // chart, so the board's highlight does not hold it: the row still lights
  // while it is pointed at.
  const lit = useSyncExternalStore(
    highlight.subscribe,
    () => markTone(highlight.get(), id) === "focus"
  );
  const pointed = useGlobalHighlight((state) => state.hoveredConversationId === id);
  const honey = lit || pointed;
  const point = () => useGlobalHighlight.getState().pointAtConversation(id);
  const leave = () => useGlobalHighlight.getState().leaveConversation(id);
  return (
    <li>
      <button
        type="button"
        onPointerEnter={point}
        onPointerLeave={leave}
        onFocus={point}
        onBlur={leave}
        onClick={() => onOpenAt(id, row.segmentId)}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors",
          "hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        )}
      >
        {/* The mark a question with no verdict has everywhere: an empty ring.
            Honey while its conversation is pointed at. */}
        <span
          aria-hidden="true"
          className={cn(
            "mt-[5px] size-2.5 shrink-0 rounded-full border-[1.5px]",
            honey ? "border-primary bg-primary" : "border-muted-foreground"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-pretty text-sm leading-snug text-foreground">
            {row.question}
          </span>
          {where && (
            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{where}</span>
          )}
        </span>
      </button>
    </li>
  );
});

export default function OpenQuestionsWidget({
  conversations,
  highlight,
  onOpenAt,
}: {
  conversations: BoardConversation[];
  highlight: HighlightSource;
  onOpenAt: (noteId: number, segmentId: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const events = useOpenQuestionEvents(conversations);
  const rows = useMemo(() => openQuestionRows(events), [events]);
  // Where each question was asked, worded once per list, not on every render.
  const where = useMemo(() => {
    const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    return new Map(
      rows.map((row) => {
        const conversation = byId.get(row.noteId);
        return [
          row.key,
          conversation
            ? t("oats.global.widgets.questions.where", {
                title: shortTitle(conversation.title),
                date: ledgerDate(row.at || conversation.createdAt, { locale: i18n.language }),
              })
            : null,
        ];
      })
    );
  }, [rows, conversations, t, i18n.language]);

  if (!rows.length) {
    return <WidgetEmpty>{t("oats.global.widgets.questions.empty")}</WidgetEmpty>;
  }

  return (
    <ul
      aria-label={t("oats.global.widgets.questions.name")}
      className="h-full divide-y divide-border overflow-y-auto px-1.5 pb-1.5"
    >
      {rows.map((row) => (
        <QuestionRow
          key={row.key}
          row={row}
          where={where.get(row.key) ?? null}
          highlight={highlight}
          onOpenAt={onOpenAt}
        />
      ))}
    </ul>
  );
}
