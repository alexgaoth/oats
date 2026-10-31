import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronUp,
  CircleCheck,
  FileText,
  Link2,
  MessagesSquare,
  Search,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { searchHostLabel } from "../../utils/searchHost";
import type { ContextCheck, ContextSource, ConversationCard } from "../../types/conversationEvents";
import { nextAnnouncement, nextCheckAnnouncement } from "../../helpers/questionAnnouncement.mjs";
import { questionAge } from "../../helpers/questionAge.mjs";
import { StateMark } from "./StateMark";

// Kept here too, for the surfaces that import the mark with the rail.
export { StateMark };

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
// The store is read by `LiveSignalRail.tsx`, which hands this rail the cards
// and the actions that leave the window; this file reads no store, so the same
// rail draws the example conversation in the tour and on the site.
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

const VERDICT = {
  right: { badge: "success", icon: CircleCheck },
  wrong: { badge: "warning", icon: TriangleAlert },
  answer: { badge: "info", icon: BookOpen },
} as const;

/**
 * Where a verdict came from, and the way to open it when there is one: a file
 * or a link, when the caller can open it (`onOpenSource`). Without one (the
 * demo pieces), the source is named and not offered.
 */
function CheckSource({
  source,
  quote,
  onOpenSource,
}: {
  source: ContextSource;
  quote: string;
  onOpenSource?: (source: ContextSource) => void;
}) {
  const { t } = useTranslation();
  const Icon = source.kind === "file" ? FileText : source.kind === "link" ? Link2 : MessagesSquare;
  const open =
    onOpenSource && (source.kind === "file" || source.kind === "link")
      ? () => onOpenSource(source)
      : null;
  // The exact words that settle it are the hover text, not a line of their
  // own: beside a live conversation the verdict, the answer and where it is
  // written are enough, and the words are one look away.
  const words = t("questionCard.check.quote", { quote });
  // A past conversation is named, not opened: opening it would take the
  // window away from the conversation being recorded.
  if (!open) {
    return (
      <span
        title={words}
        className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{source.label}</span>
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={open}
      title={words}
      aria-label={t("questionCard.check.openSource", { source: source.label })}
      className="-mx-2 max-w-full justify-start text-muted-foreground"
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{source.label}</span>
    </Button>
  );
}

/**
 * What the team's context says about the reply (contextCheck.mjs): checking,
 * then right, wrong, or the answer nobody had, and where it is written.
 * Spoken through the rail's live region, never from here.
 */
function CheckLine({
  check,
  onOpenSource,
}: {
  check: ContextCheck;
  onOpenSource?: (source: ContextSource) => void;
}) {
  const { t } = useTranslation();
  if (check.state === "checking") {
    // Its shape, under one status line, not a spinner (DESIGN.md §7).
    return (
      <div className="mt-2 grid gap-1.5">
        <p className="text-xs text-muted-foreground">
          {check.by !== "agent"
            ? t("questionCard.check.checking")
            : check.sources?.length
              ? t("questionCard.check.checkingSources", { sources: check.sources.join(", ") })
              : t("questionCard.check.checkingAgent")}
        </p>
        <span
          aria-hidden="true"
          className="h-2.5 w-2/3 rounded-full bg-muted motion-safe:animate-pulse"
        />
      </div>
    );
  }
  const verdict = VERDICT[check.state];
  const Icon = verdict.icon;
  return (
    <div className="mt-2 grid min-w-0 gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={verdict.badge}>
          <Icon aria-hidden="true" />
          {t(`questionCard.check.${check.state}`)}
        </Badge>
        <span className="min-w-0 text-[13px] font-medium text-foreground">{check.answer}</span>
      </div>
      <CheckSource source={check.source} quote={check.quote} onOpenSource={onOpenSource} />
    </div>
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
  onOpenSource,
}: {
  card: ConversationCard;
  now: number;
  nested: boolean;
  searchHost: string;
  /** Absent (the demo pieces), a card offers no search: nothing may leave. */
  onSearch?: (card: ConversationCard) => void;
  onOpenSource?: (source: ContextSource) => void;
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
          <span className="tabular-nums">
            {(() => {
              const age = questionAge(card.createdAt, now);
              return age.kind === "now" ? t("questionCard.now") : age.label;
            })()}
          </span>
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
          ) : onSearch ? (
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
          ) : null}
        </div>
        {card.check && <CheckLine check={card.check} onOpenSource={onOpenSource} />}
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
  onOpenSource,
  onFocus,
}: {
  group: CardGroup;
  now: number;
  index: number;
  searchHost: string;
  onDismiss: (cards: ConversationCard[]) => void;
  onSearch?: (card: ConversationCard) => void;
  onOpenSource?: (source: ContextSource) => void;
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
        <Asking
          card={first}
          now={now}
          nested={false}
          searchHost={searchHost}
          onSearch={onSearch}
          onOpenSource={onOpenSource}
        />
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
              onOpenSource={onOpenSource}
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

/**
 * The rail itself, with no store and no main process behind it: it draws the
 * cards it is given and keeps its own dismissals. What reaches outside the
 * window comes in as a prop: the recording's rail (`LiveSignalRail.tsx`) is
 * given the web search, the dismissal's record and the opening of a source;
 * the demo pieces (`components/demo/`) are given none, so a card there offers
 * no Search and a dismissal stays on the screen it was made on.
 */
export default function ConversationSignalRail({
  cards,
  onFocus,
  announceOnly = false,
  searchHost = "",
  onSearch,
  onDismiss,
  onOpenSource,
}: {
  cards: ConversationCard[];
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
  /** The search host to name on a searched card when the card names none. */
  searchHost?: string;
  /** The card's one action. Absent, a card offers no search. */
  onSearch?: (card: ConversationCard) => void;
  /** Told of a dismissal, after the rail has taken the cards away. */
  onDismiss?: (cards: ConversationCard[]) => void;
  /** Opens a verdict's file or link. Absent, the source is only named. */
  onOpenSource?: (source: ContextSource) => void;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Dismiss is the only destructive action in the rail and it is one small button
  // beside a moving list. A short undo window costs nothing and removes the whole
  // class of "I lost the question I actually cared about".
  const [undoable, setUndoable] = useState<ConversationCard[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  const dismiss = useCallback(
    (groupCards: ConversationCard[]) => {
      setDismissed((current) => {
        const next = new Set(current);
        for (const card of groupCards) next.add(card.id);
        return next;
      });
      setUndoable(groupCards);
      onDismiss?.(groupCards);
    },
    [onDismiss]
  );

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

  // A check's verdict is announced once, when it lands, in its own region:
  // folding it into the question's text would make that region re-speak the
  // question (helpers/questionAnnouncement.mjs, nextCheckAnnouncement).
  const checkSpoken = useRef<Set<string>>(new Set());
  const [checkAnnounced, setCheckAnnounced] = useState("");
  useEffect(() => {
    const next = nextCheckAnnouncement(cards, checkSpoken.current);
    if (!next) return;
    for (const id of next.ids) checkSpoken.current.add(id);
    setCheckAnnounced(
      t(`questionCard.check.announced.${next.state}`, {
        answer: next.answer,
        source: next.source,
      })
    );
  }, [cards, t]);

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
      <p aria-live="polite" className="sr-only">
        {checkAnnounced}
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
                onDismiss={dismiss}
                onSearch={onSearch}
                onOpenSource={onOpenSource}
                onFocus={onFocus}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
