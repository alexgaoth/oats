import type { TFunction } from "i18next";
import type { ContourData } from "./ConversationContour";

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
export function contourLabel(contour: ContourData, t: TFunction): string {
  if (contour.empty) return t("oats.conversation.contourEmpty");
  // A live contour shows the last four minutes; its label is the whole sitting.
  if (contour.summary) return t("oats.conversation.contourSummary", contour.summary);
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
