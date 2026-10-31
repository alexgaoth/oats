import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge, type BadgeProps } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { buildReview } from "../../helpers/conversationReview.mjs";
import type { ConversationEvent, ConversationTopicNode } from "../../types/conversationEvents";

/**
 * How a question came out, as a status badge. Amber for the ones worth chasing
 * (unknown, or uncertain); red is for recording and danger only.
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
 *
 * Its own module, with no store behind it: the reading view gives it
 * `onOpenTurn`; the demo pieces (`components/demo/`) have no transcript to
 * open, give it none, and its rows are then words, not buttons.
 */
export function ConversationReview({
  events,
  topics,
  onOpenTurn,
}: {
  events: ConversationEvent[];
  topics: ConversationTopicNode[];
  /** Opens the transcript at a turn. Absent, nothing in the review is a place. */
  onOpenTurn?: (segmentId: string | null) => void;
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
            const row: ReactNode = (
              <>
                <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">
                  {item.question}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  {item.searched && <Badge variant="info">{t("questionCard.searched")}</Badge>}
                  <Badge variant={OUTCOME_BADGE[outcome] ?? "secondary"}>
                    {t(`questionCard.state.${outcome}`)}
                  </Badge>
                </span>
              </>
            );
            return (
              <li key={item.key}>
                {onOpenTurn ? (
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
                    {row}
                  </button>
                ) : (
                  <div className="flex w-full items-start gap-4 px-5 py-3">{row}</div>
                )}
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
              {item.reply && onOpenTurn ? (
                <button
                  type="button"
                  onClick={() => onOpenTurn(item.segmentId)}
                  disabled={!item.segmentId}
                  className="mt-1 line-clamp-2 w-full rounded-sm text-left text-[13px] leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {item.reply}
                </button>
              ) : item.reply ? (
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                  {item.reply}
                </p>
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
