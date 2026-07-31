import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, Search, Undo2, X } from "lucide-react";
import { cn } from "./lib/utils";
import type { ConversationCard, QuestionOutcome } from "../types/conversationEvents";

// The question-card rail (DESIGN.md §9.2). One always-on-top window holding the
// whole stack for a recording — newest at the bottom, repeats gathered under the
// question they repeat, older groups collapsed behind a count chip.
//
// Every card here already exists in the note. Dismissing one removes it from the
// rail, never from the record.

const VISIBLE_GROUPS = 4;

// Ink-only state marks. Colour comes from the `--graph-*` tokens so the rail, the
// thread list, and the topic graph cannot drift apart (DESIGN.md §4).
const STATE_STYLE: Record<QuestionOutcome, { token: string; dither: boolean }> = {
  asked: { token: "var(--graph-silence)", dither: true },
  answered: { token: "var(--graph-answered)", dither: false },
  uncertain: { token: "var(--graph-uncertain)", dither: true },
  silence: { token: "var(--graph-silence)", dither: true },
  denied: { token: "var(--graph-open)", dither: true },
};

// Searching is always offered by hand. Automatic search is restricted to a
// confirmed negative, but *asking* to search is the user's call and gating that
// on a verdict — one the classifier may never deliver — leaves cards with no
// action at all.

interface CardGroup {
  key: string;
  cards: ConversationCard[];
}

function groupCards(cards: ConversationCard[]): CardGroup[] {
  const groups = new Map<string, ConversationCard[]>();
  for (const card of cards) {
    const list = groups.get(card.groupKey);
    if (list) list.push(card);
    else groups.set(card.groupKey, [card]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, cards: list.sort((a, b) => a.createdAt - b.createdAt) }))
    .sort((a, b) => a.cards[0].createdAt - b.cards[0].createdAt);
}

function elapsedLabel(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

// One group: the question, its outcome, and how many times it was asked.
//
// A repeat does not get its own card body — repeating a question does not make it
// a different question, it makes it a more insistent one, and a count says that
// far more calmly than three identical cards stacked in a corner.
function QuestionGroup({
  group,
  now,
  onDismiss,
  onSearch,
}: {
  group: CardGroup;
  now: number;
  onDismiss: (cards: ConversationCard[]) => void;
  onSearch: (card: ConversationCard) => void;
}) {
  const { t } = useTranslation();
  // The latest asking carries the outcome: it is the one that was actually
  // answered or not.
  const latest = group.cards[group.cards.length - 1];
  const style = STATE_STYLE[latest.state] ?? STATE_STYLE.asked;
  const repeats = group.cards.length;
  const canSearch = !latest.searched;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-raised px-3 py-2.5",
        "shadow-[0_1px_2px_color-mix(in_oklch,var(--color-foreground)_6%,transparent),0_8px_24px_color-mix(in_oklch,var(--color-foreground)_8%,transparent)]",
        "transition-all [transition-duration:var(--motion-base)]"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dither && "oats-dither")}
          style={{ color: style.token, backgroundColor: "currentColor" }}
        />
        <p className="min-w-0 flex-1 font-mono text-[13px] leading-snug text-foreground">
          {latest.question}
        </p>
        <button
          type="button"
          aria-label={t("questionCard.dismiss")}
          onClick={() => onDismiss(group.cards)}
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors [transition-duration:var(--motion-instant)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2 pl-[1.125rem] text-[11px]">
        <span className="text-muted-foreground">{t(`questionCard.state.${latest.state}`)}</span>
        <span aria-hidden="true" className="text-muted-foreground/40">
          ·
        </span>
        <span className="tabular-nums text-muted-foreground/70">
          {elapsedLabel(group.cards[0].createdAt, now)}
        </span>
        {repeats > 1 && (
          <>
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <span className="text-muted-foreground">
              {t("questionCard.askedTimes", { count: repeats })}
            </span>
          </>
        )}
        <span className="flex-1" />
        {latest.searched ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground/70">
            <Search size={10} />
            {t("questionCard.searched")}
          </span>
        ) : (
          canSearch && (
            // The one action on the card. Present for every outcome that did not
            // auto-search, so that "the search is one click away" is actually
            // true rather than aspirational.
            <button
              type="button"
              onClick={() => onSearch(latest)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary transition-colors [transition-duration:var(--motion-instant)] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search size={10} />
              {t("topicGraph.search")}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default function ConversationAssistOverlay() {
  const { t } = useTranslation();
  const [cards, setCards] = useState<ConversationCard[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Dismiss is the only destructive action in the rail and it is one small button
  // beside a moving list. A short undo window costs nothing and removes the whole
  // class of "I lost the question I actually cared about".
  const [undoable, setUndoable] = useState<ConversationCard[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const receive = (value: ConversationCard[] | null) => setCards(value ?? []);
    const cleanup = window.electronAPI?.onConversationAssistData?.(receive);
    void window.electronAPI?.getConversationAssistData?.().then(receive);
    void window.electronAPI?.conversationAssistReady?.();
    return () => cleanup?.();
  }, []);

  // Ages tick once every 15s, not every second: this window sits over a live
  // conversation and must not be the thing moving in the corner of an eye.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const groups = useMemo(
    () => groupCards(cards.filter((card) => !dismissed.has(card.id))),
    [cards, dismissed]
  );

  const onDismiss = useCallback((groupCards: ConversationCard[]) => {
    setDismissed((current) => {
      const next = new Set(current);
      for (const card of groupCards) next.add(card.id);
      return next;
    });
    setUndoable(groupCards);
    for (const card of groupCards) {
      void window.electronAPI?.dismissConversationCard?.(card.suggestionId);
    }
  }, []);

  const undoDismiss = useCallback(() => {
    const cards = undoable;
    if (!cards) return;
    setUndoable(null);
    setDismissed((current) => {
      const next = new Set(current);
      for (const card of cards) next.delete(card.id);
      return next;
    });
  }, [undoable]);

  useEffect(() => {
    if (!undoable) return;
    const timer = window.setTimeout(() => setUndoable(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undoable]);

  const onSearch = useCallback((card: ConversationCard) => {
    void window.electronAPI?.searchConversationCard?.(card.id);
  }, []);

  const hidden = Math.max(0, groups.length - VISIBLE_GROUPS);
  const shown = expanded ? groups : groups.slice(hidden);

  return (
    <div
      className="flex h-full w-full flex-col justify-end gap-2 bg-transparent p-3"
      onMouseEnter={() => window.electronAPI?.setConversationAssistInteractivity?.(true)}
      onMouseLeave={() => window.electronAPI?.setConversationAssistInteractivity?.(false)}
    >
      {undoable && (
        <button
          type="button"
          onClick={undoDismiss}
          className="self-start rounded-full border border-border bg-surface-raised px-3 py-1 text-[11px] text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Undo2 size={11} className="mr-1 inline" />
          {t("questionCard.undo")}
        </button>
      )}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-full border border-border bg-surface-raised px-3 py-1 text-[11px] text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronUp size={11} className="mr-1 inline" />
          {t("questionCard.earlier", { count: hidden })}
        </button>
      )}
      <div className="flex min-h-0 flex-col justify-end gap-2 overflow-y-auto">
        {shown.map((group) => (
          <QuestionGroup
            key={group.key}
            group={group}
            now={now}
            onDismiss={onDismiss}
            onSearch={onSearch}
          />
        ))}
      </div>
    </div>
  );
}
