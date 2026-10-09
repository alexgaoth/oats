import type { TFunction } from "i18next";
import type { TranscriptSegment } from "../stores/meetingRecordingStore";
import { speakerLabelKind } from "../helpers/speakerTurns.mjs";

/**
 * A segment's speaker in words, by the one rule `speakerLabelKind` keeps for
 * every surface — live, reading, copy and vault. Null for a conversation in one
 * room whose voices have not been told apart: it used to say "You" on every
 * line of it, and live, an untranslated "Conversation".
 */
export function speakerText(
  segment: Pick<TranscriptSegment, "source" | "speaker" | "speakerName" | "speakerIsPlaceholder">,
  t: TFunction
): string | null {
  const kind = speakerLabelKind(segment);
  if (!kind) return null;
  if (kind.kind === "name") return kind.name;
  if (kind.kind === "number") return t("oats.intelligence.speakerN", { n: kind.n });
  return kind.kind === "you"
    ? t("oats.intelligence.speakerYou")
    : t("oats.intelligence.speakerRoom");
}
