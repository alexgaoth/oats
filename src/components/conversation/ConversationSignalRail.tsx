import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, Search, Undo2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { searchHostLabel } from "../../utils/searchHost";
import type { ConversationCard, QuestionOutcome } from "../../types/conversationEvents";

// The question-card rail (DESIGN.md §9.2) — the help moment, and the surface the
// spec says the product is judged on. The whole stack for a recording: newest at
// the bottom, every re-asking nested under the question it repeats, older groups
// behind a count chip.
//
// It is **docked in the Conversation surface**, and that is the whole design of
// it. Until 2026-08-20 it was a separate always-on-top `BrowserWindow` with its
// own renderer route, its own IPC contract and a cold-start handshake, and the
// signature feature consequently read as an overlay widget bolted to the side of
// the product rather than as part of it. Living here, it shares the store the
// cards are already in, so there is no wire, no sanitiser, no window to show at
// the right moment, and no second copy of card state to disagree with the first.
//
// What that costs, and it was chosen deliberately: a conversation recorded with
// the panel hidden — which the global shortcut makes the normal case — shows no
// cards until Oats is opened. Nothing is lost, because every card here already
// exists in the note; they are simply waiting. Dismissing one removes it from the
// rail, never from the record.
//
// The governing constraint is unchanged: nothing here may compete with the
// person in the room. Small, quiet, non-modal, never takes focus.

const VISIBLE_GROUPS = 4;

// Each card enters on `base` with a 24ms stagger, so a burst of questions arrives
// as a sequence rather than a slab (§9.2).
const STAGGER_MS = 24;

// Ink-only state marks. Colour comes from the `--graph-*` tokens so the rail, the
// thread list, and the topic graph cannot drift apart (DESIGN.md §4).
//
// `dither` is §4's uncertainty encoding: a resolved outcome is solid, an unsure
// one is a stipple. It has to be drawn as *gaps in* the colour — the previous
// version set the dot's background-color to the same `currentColor` the dither
// dots are painted in, so every mark rendered solid and the whole vocabulary was
// invisible.
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

/** The §4 state mark: solid when the outcome is settled, stippled when it is not. */
function StateMark({ state }: { state: QuestionOutcome }) {
  const style = STATE_STYLE[state] ?? STATE_STYLE.asked;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-[5px] h-2 w-2 shrink-0 rounded-full",
        style.dither && "oats-dither oats-dither--fine"
      )}
      // Dithered marks paint dots in `color` over nothing; solid marks fill.
      style={style.dither ? { color: style.token } : { backgroundColor: style.token }}
    />
  );
}

/**
 * One asking: the question verbatim, its outcome, and its one action.
 *
 * Used for the first asking and for every repeat, because they are the same
 * thing — that is the point of §9.2's "a question asked twice gets two cards".
 */
function Asking({
  card,
  now,
  nested,
  searchHost,
  onSearch,
}: {
  card: ConversationCard;
  now: number;
  nested: boolean;
  searchHost: string;
  onSearch: (card: ConversationCard) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-2.5">
      <StateMark state={card.state} />
      <div className="min-w-0 flex-1">
        {/* Mono, and verbatim. Quoting exactly what was said is what earns the
            trust to put a card over somebody's conversation at all. */}
        <p
          className={cn(
            "font-mono leading-snug text-foreground",
            nested ? "text-[12px]" : "text-[13px]"
          )}
        >
          {card.question}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">{t(`questionCard.state.${card.state}`)}</span>
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
          <span className="tabular-nums text-muted-foreground/70">
            {elapsedLabel(card.createdAt, now)}
          </span>
          <span className="flex-1" />
          {card.searched ? (
            // Naming the host is the honesty requirement, not decoration. The
            // card's own `searchBaseUrl` wins over the current setting: this says
            // where this question actually went, and changing the engine later
            // must not rewrite the history of one that already left.
            <span className="lowercase text-muted-foreground/70">
              {(() => {
                const host = searchHostLabel(card.searchBaseUrl || "") || searchHost;
                return host ? t("questionCard.searchedHost", { host }) : t("questionCard.searched");
              })()}
            </span>
          ) : (
            // The card's one action, offered for every outcome that did not
            // auto-search, so "the search is one click away" is true rather than
            // aspirational.
            //
            // Ink at rest, gold only once you reach for it. §9.2 calls this "a
            // single gold action", which is right for one card and wrong for the
            // four the rail actually holds: four gold buttons stacked in the
            // corner is four accents (§3), and it puts the rail's whole visual
            // weight on a secondary action instead of on the questions. Reaching
            // for it is still the one moment gold is earning something — and this
            // panel floats over a live conversation, where the rule that beats
            // every other is that nothing may compete with the person in the room.
            <button
              type="button"
              onClick={() => onSearch(card)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 lowercase text-muted-foreground transition-colors [transition-duration:var(--motion-instant)] hover:bg-primary/10 hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search size={10} />
              {t("topicGraph.search")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One question and every re-asking of it.
 *
 * Repeats **nest** rather than collapsing into a count. The previous version
 * rendered one body and a "asked 3×" tally, which reads tidier and throws away
 * the signal: re-asking is how people mark what actually matters, and a
 * rephrasing ("do you know…" then "are you aware of…") is different words with a
 * different outcome. Both DESIGN.md §9.2 and CLAUDE.md's third question rule are
 * explicit that density is a rendering problem and never a reason to drop a
 * detection — so the repeats are indented, hairline-linked and dimmed, and every
 * word of every asking is still on screen.
 */
function QuestionGroup({
  group,
  now,
  index,
  searchHost,
  onDismiss,
  onSearch,
}: {
  group: CardGroup;
  now: number;
  index: number;
  searchHost: string;
  onDismiss: (cards: ConversationCard[]) => void;
  onSearch: (card: ConversationCard) => void;
}) {
  const { t } = useTranslation();
  const [first, ...repeats] = group.cards;

  return (
    <div
      className={cn(
        "oats-enter oats-dithered-edge relative rounded-xl border border-border bg-surface-raised px-3 py-2.5",
        "shadow-[0_1px_2px_color-mix(in_oklch,var(--color-foreground)_6%,transparent),0_8px_24px_color-mix(in_oklch,var(--color-foreground)_8%,transparent)]"
      )}
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
    >
      {/* One dismiss for the whole group: the repeats are the same question, so
          dropping it one asking at a time would be busywork. A low-contrast
          ghost, per §9.2 — it must never look like the point of the card. */}
      <button
        type="button"
        aria-label={t("questionCard.dismiss")}
        onClick={() => onDismiss(group.cards)}
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground/35 transition-colors [transition-duration:var(--motion-instant)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={13} />
      </button>

      <div className="pr-5">
        <Asking card={first} now={now} nested={false} searchHost={searchHost} onSearch={onSearch} />
      </div>

      {repeats.length > 0 && (
        // Indented and hairline-linked to the question they repeat, at 70% ink.
        <div className="ml-[3px] mt-2.5 space-y-2.5 border-l border-border pl-3 opacity-70">
          {repeats.map((card) => (
            <Asking
              key={card.id}
              card={card}
              now={now}
              nested
              searchHost={searchHost}
              onSearch={onSearch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConversationSignalRail() {
  const { t } = useTranslation();
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Dismiss is the only destructive action in the rail and it is one small button
  // beside a moving list. A short undo window costs nothing and removes the whole
  // class of "I lost the question I actually cared about".
  const [undoable, setUndoable] = useState<ConversationCard[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const searchBaseUrl = useSettingsStore((state) => state.conversationAideSearchBaseUrl);
  const searchHost = useMemo(() => searchHostLabel(searchBaseUrl), [searchBaseUrl]);

  // Ages tick once every 15s, not every second: this sits beside a live
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

  // The one audited outbound path (`docs/network-allowlist.md`), the same one
  // the automatic search and the topic graph's re-search already use.
  //
  // The old `conversation-card-search` channel existed because the rail was the
  // least trustworthy window in the app and was allowed to name a card and
  // nothing else. The rail is the control panel's own renderer now — the one
  // that already calls this directly — so that indirection bought nothing and
  // was removed with the window it protected against.
  //
  // A card with no verdict yet has no derived query, but asking to search it is
  // reason enough: the question itself is the query.
  const onSearch = useCallback(
    (card: ConversationCard) => {
      void window.electronAPI?.openConversationSearch?.({
        eventId: card.suggestionId,
        query: card.query || card.question,
        searchBaseUrl: card.searchBaseUrl || searchBaseUrl,
      });
    },
    [searchBaseUrl]
  );

  const hidden = Math.max(0, groups.length - VISIBLE_GROUPS);
  const shown = expanded ? groups : groups.slice(hidden);

  if (!groups.length && !undoable) return null;

  return (
    // Anchored to the bottom-right of the pane, over the ground the field leaves
    // empty (`justify-center pb-[34vh]` on the composition), rather than beside
    // the pulse. Cards arrive unpredictably and in bursts; putting them in the
    // centre column would make the composition jump every time somebody asked a
    // question, and §8 is explicit that a card entering must not shift the
    // layout anywhere else on screen.
    //
    // `absolute` resolves against the surface pane, which is `absolute inset-0`
    // and clips its overflow — so the rail sits inside the window's content area
    // without reaching past the drag band or under the nav.
    <div
      aria-live="polite"
      className="absolute bottom-5 right-5 z-10 flex max-h-[70%] w-[19rem] flex-col justify-end gap-2"
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
        {shown.map((group, index) => (
          <QuestionGroup
            key={group.key}
            group={group}
            now={now}
            index={index}
            searchHost={searchHost}
            onDismiss={onDismiss}
            onSearch={onSearch}
          />
        ))}
      </div>
    </div>
  );
}
