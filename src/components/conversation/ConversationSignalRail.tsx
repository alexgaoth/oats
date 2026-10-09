import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, Search, Undo2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { searchHostLabel } from "../../utils/searchHost";
import type { ConversationCard, QuestionOutcome } from "../../types/conversationEvents";
import { nextAnnouncement } from "../../helpers/questionAnnouncement.mjs";
import { markFill, markTone, TONE_TOKEN, type MarkTone } from "./questionMarks";

/** What the live region is currently saying. See `questionAnnouncement.mjs`. */
interface Announcement {
  ids: string[];
  question: string;
  occurrence: number;
  count: number;
}

// The question-card rail (DESIGN.md §9.2) — the help moment, and the surface the
// spec says the product is judged on. The whole stack for a recording: the most
// recently asked at the top, every re-asking nested under the question it
// repeats, older groups behind a count chip.
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

// The mark's shape and colour come from `questionMarks.ts`, the vocabulary the
// contour canvas draws in too, so the rail, the transcript margin and the trace
// above them cannot drift apart.
const TONE_CLASS: Record<MarkTone, { fill: string; ring: string }> = {
  success: { fill: "bg-success", ring: "border-success" },
  warning: { fill: "bg-warning", ring: "border-warning" },
  muted: { fill: "bg-muted-foreground", ring: "border-muted-foreground" },
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
  // Ordered by each group's *latest* asking, not its first. A re-asking is the
  // newest thing that happened in the room and, by §9.2, the strongest signal
  // there is — but nested under a first asking from twenty minutes ago it sank
  // with that group to the bottom of a band that clips, below the fold of the
  // one surface built to catch it. The group rises when it is asked again; the
  // repeat still nests under the first.
  const latest = (list: ConversationCard[]) => list[list.length - 1].createdAt;
  return [...groups.entries()]
    .map(([key, list]) => ({ key, cards: list.sort((a, b) => a.createdAt - b.createdAt) }))
    .sort((a, b) => latest(a.cards) - latest(b.cards));
}

function elapsedLabel(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

/**
 * A question's state mark: filled when settled, half filled when the answer was
 * hedged, a ring when nobody gave a verdict.
 *
 * Exported so the transcript's margin speaks the same vocabulary as the rail:
 * one mark component, so the surfaces cannot drift apart.
 */
export function StateMark({
  state,
  className = "mt-[5px]",
}: {
  state: QuestionOutcome;
  /** Placement only; the default aligns it with the rail's first line. */
  className?: string;
}) {
  const fill = markFill(state);
  const tone = TONE_CLASS[markTone(state)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative size-2 shrink-0 overflow-hidden rounded-full",
        fill === "solid" ? tone.fill : cn("border-[1.5px]", tone.ring),
        className
      )}
    >
      {fill === "half" && <span className={cn("absolute inset-y-0 right-0 w-1/2", tone.fill)} />}
    </span>
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
    <div className="flex items-start gap-3">
      <StateMark state={card.state} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        {/* Verbatim. Quoting exactly what was said is what earns the trust to
            put a card beside somebody's conversation at all. Inter, like the
            transcript it quotes: mono is for machine text (DESIGN.md §3). */}
        <p
          className={cn(
            "text-pretty leading-snug text-foreground",
            nested ? "text-[13px]" : "text-sm font-medium"
          )}
        >
          {card.question}
        </p>
        <div className="mt-1 flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
          <span>{t(`questionCard.state.${card.state}`)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{elapsedLabel(card.createdAt, now)}</span>
          <span className="flex-1" />
          {card.searched ? (
            // Naming the host is the honesty requirement, not decoration. The
            // card's own `searchBaseUrl` wins over the current setting: this says
            // where this question actually went, and changing the engine later
            // must not rewrite the history of one that already left.
            <span>
              {(() => {
                const host = searchHostLabel(card.searchBaseUrl || "") || searchHost;
                return host ? t("questionCard.searchedHost", { host }) : t("questionCard.searched");
              })()}
            </span>
          ) : (
            // The card's one action, offered for every outcome that did not
            // auto-search, so "the search is one click away" is true rather than
            // aspirational. A ghost button: four questions in the rail must not
            // make four brand buttons beside a live conversation.
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onSearch(card)}
              className="-my-1 text-muted-foreground"
            >
              <Search aria-hidden="true" />
              {t("topicGraph.search")}
            </Button>
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
  onFocus,
}: {
  group: CardGroup;
  now: number;
  index: number;
  searchHost: string;
  onDismiss: (cards: ConversationCard[]) => void;
  onSearch: (card: ConversationCard) => void;
  /** Tells the contour which mark this annotation belongs to. */
  onFocus: (groupKey: string | null) => void;
}) {
  const { t } = useTranslation();
  const [first, ...repeats] = group.cards;

  return (
    // A row in a list, like every other list in the app (DESIGN.md §4). The
    // state is the mark beside the words, not a coloured bar: status is never
    // a border.
    <li
      className="oats-enter relative py-3 first:pt-0 last:pb-0"
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
      onMouseEnter={() => onFocus(group.key)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(group.key)}
      onBlur={() => onFocus(null)}
    >
      <div className="pr-8">
        <Asking card={first} now={now} nested={false} searchHost={searchHost} onSearch={onSearch} />
      </div>

      {repeats.length > 0 && (
        // Indented and hairline-linked to the question they repeat. Not dimmed
        // with `opacity`: that dragged each repeat's outcome word and elapsed
        // time under AA, and a re-asking is signal, not a footnote.
        <div className="ml-[3px] mt-2.5 space-y-2.5 border-l border-border pl-4">
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

      {/* One dismiss for the whole group: the repeats are the same question, so
          dropping it one asking at a time would be busywork. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("questionCard.dismiss")}
        onClick={() => onDismiss(group.cards)}
        className={cn(
          "absolute right-0 text-muted-foreground",
          index === 0 ? "-top-0.5" : "top-2.5"
        )}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

export default function ConversationSignalRail({
  onFocus,
  announceOnly = false,
}: {
  /**
   * Mount the announcements without drawing the annotations.
   *
   * The clean composition (DESIGN.md §9.0) hides the question cards, and the
   * first version of it simply did not render this component — which silently
   * took the *only* channel that tells a screen-reader user a question was
   * detected and searched, and made "clean" mean "less product" for them
   * rather than "calmer". The spec is that assistive output is identical in
   * both compositions, so the live region is mounted either way and only the
   * drawing is conditional.
   */
  announceOnly?: boolean;
  /** Reports which question group the pointer or keyboard is on, so the
   *  contour can raise the matching mark. Null when nothing is focused. */
  onFocus: (groupKey: string | null) => void;
}) {
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

  // What has already been announced, so the live region can only ever move
  // forwards. The selection is `helpers/questionAnnouncement.mjs` — pure, and
  // pinned, because three attempts at it here were wrong and each one read
  // correctly. The set is of *everything ever announced*, so a card cannot be
  // announced twice however the list is rearranged, dismissed or restored.
  const spoken = useRef<Set<string>>(new Set());
  const [announced, setAnnounced] = useState<Announcement | null>(null);
  useEffect(() => {
    const next = nextAnnouncement(cards, spoken.current);
    if (!next) return;
    for (const id of next.ids) spoken.current.add(id);
    if (next.count > 0) setAnnounced(next);
  }, [cards]);

  // A live region speaks only when its text changes, so each case has to read
  // differently as well as truthfully: a re-asking says it is a re-asking
  // (rule 3 — repeats are the signal), and a batch says how many arrived.
  const announcement = !announced
    ? ""
    : announced.count > 1
      ? t("questionCard.announcedBatch", {
          count: announced.count,
          question: announced.question,
        })
      : announced.occurrence > 1
        ? t("questionCard.announcedAgain", {
            count: announced.occurrence,
            question: announced.question,
          })
        : t("questionCard.announced", { question: announced.question });

  const hidden = Math.max(0, groups.length - VISIBLE_GROUPS);
  // **Newest first.**
  //
  // The band is a fixed height with the rest scrolled out of sight, and it used
  // to run oldest-first, which put the question just asked at the bottom — at
  // the exact round-2 content shape the newest group's top landed on the band's
  // bottom edge, so the one card that matters most was the one card nobody
  // could see, and the next arrival appeared clipped through its outcome and
  // its Search action. Reading order follows recency here: the thing that just
  // happened is at the top, and history scrolls away beneath it.
  const ordered = [...groups].reverse();
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE_GROUPS);

  return (
    // In the record, under the trace it annotates — not in the corner of the
    // window. The annotations line up on the same left spine as the contour
    // above them, so a question and the mark it put on the line are read as one
    // thing rather than as an application and its notifications.
    //
    // The surface gives this region the space left between the pinned head and
    // foot, so it scrolls inside itself rather than pushing the dead-microphone
    // warning off screen.
    <div className="mt-6 flex w-full flex-col gap-3">
      {/* The only thing announced, and it is mounted **before** it has anything
          to say.
          
          Two mistakes are avoided here. Wrapping the whole stack meant a screen
          reader re-read every visible question every 15 seconds, when the
          elapsed labels re-render — during a live in-person conversation, which
          is the one thing this surface must never do. And a live region that is
          inserted into the DOM already containing its first message is not
          announced at all by NVDA, JAWS or VoiceOver: the region has to be
          there, empty, before the update — otherwise the very first question of
          every conversation, the one that proves the feature works, is the one
          nobody hears. That is why this sits above the early return. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {announceOnly || (!groups.length && !undoable) ? null : (
        <>
          {/* The band clips whatever does not fit. Without a cue the crowded
              case just looked like a row sliced by an invisible boundary — the
              contour above drew seven marks while six annotations showed, and
              the seventh was two coloured crumbs in the gap. The fade says
              "there is more below" in the only place a reader is looking. */}
          {undoable && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={undoDismiss}
              className="self-start text-muted-foreground"
            >
              <Undo2 aria-hidden="true" />
              {t("questionCard.undo")}
            </Button>
          )}
          {/* Reversible. It used to only ever expand, so a user who opened every
          group mid-conversation had no way back to the four that matter. */}
          {hidden > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              className="self-start text-muted-foreground"
            >
              <ChevronUp
                aria-hidden="true"
                className={cn("transition-transform", expanded && "rotate-180")}
              />
              {expanded ? t("questionCard.collapse") : t("questionCard.earlier", { count: hidden })}
            </Button>
          )}
          <ol className="divide-y divide-border">
            {shown.map((group, index) => (
              <QuestionGroup
                key={group.key}
                group={group}
                now={now}
                index={index}
                searchHost={searchHost}
                onDismiss={onDismiss}
                onSearch={onSearch}
                onFocus={onFocus}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
