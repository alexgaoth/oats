import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import DitherBar from "../charts/DitherBar";
import { speakerText } from "../../utils/speakerLabel";
import type { talkTime } from "../../helpers/talkTime.mjs";

/**
 * Who did the talking: one row per voice, with its name, a bar as long as its
 * share against the voice that talked most, and the share. A row is also the
 * transcript's filter: pressing a voice shows only its turns, and pressing it
 * again shows everyone.
 *
 * Measured from each turn's place in the recording (`talkTime.mjs`) and
 * labelled the way the transcript labels speakers, names included. One voice,
 * or a room whose voices were never told apart, draws nothing: a list of one
 * says nothing. Speech no voice was put on is the last row, with a rule-grey
 * bar, and is not a filter.
 *
 * The bars are the chart fill (DESIGN.md §6): the dither of the quiet grey,
 * and honey for the voice being shown. Two columns when the card has room
 * (420px), filled down the first column first, so the reading order and the
 * tab order are the same.
 *
 * Its own module, with no store behind it, so the demo pieces
 * (`components/demo/`) draw the same bars outside the app.
 */
export function TalkTime({
  talk,
  selected,
  onSelect,
  className,
}: {
  talk: ReturnType<typeof talkTime>;
  /** The speaker whose turns the transcript shows, or null for everyone. */
  selected: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const percent = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: "percent" }),
    [i18n.language]
  );
  if (talk.speakers.length < 2) return null;
  const rows = [
    ...talk.speakers.map((speaker) => ({
      key: speaker.key as string | null,
      ms: speaker.ms,
      percent: speaker.percent,
      label: speakerText(speaker.segment, t) ?? "",
    })),
    ...(talk.unattributedMs > 0
      ? [
          {
            key: null,
            ms: talk.unattributedMs,
            percent: talk.unattributedPercent,
            label: t("oats.intelligence.talkTime.unattributed"),
          },
        ]
      : []),
  ];
  // The longest bar is the voice that talked most (or the unattributed speech,
  // when there was more of it): every other bar is a share of that one.
  const longest = Math.max(...rows.map((entry) => entry.ms));
  const firstColumn = Math.ceil(rows.length / 2);
  // Each row spans the list's three columns (name, bar, share) through
  // subgrid, so the bars in a column start on one line.
  const row = "col-span-3 grid grid-cols-subgrid items-center px-1.5 py-1";
  return (
    <div
      role="group"
      aria-label={t("oats.intelligence.talkTime.label")}
      className={cn("@container", className)}
    >
      <ul className="-mx-1.5 grid grid-flow-row-dense grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto] gap-x-3 text-[13px] text-foreground @min-[420px]:grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto_0.25rem_minmax(0,max-content)_minmax(0,1fr)_auto]">
        {rows.map((entry, index) => {
          const pressed = entry.key !== null && selected === entry.key;
          const content = (
            <>
              <span className={cn("max-w-40 truncate", pressed && "font-medium")}>
                {entry.label}
              </span>
              <span aria-hidden="true" className="flex h-1.5 min-w-0">
                <span
                  className={cn(
                    "h-1.5 min-w-1.5 overflow-hidden rounded-[3px]",
                    entry.key === null && "bg-border",
                    pressed && "bg-primary"
                  )}
                  style={{ width: `${(entry.ms / longest) * 100}%` }}
                >
                  {entry.key !== null && !pressed && <DitherBar />}
                </span>
              </span>
              {/* The measurement, set apart from a label that may end in a number. */}
              <span className="text-right font-medium tabular-nums">
                {percent.format(entry.percent / 100)}
              </span>
            </>
          );
          const column =
            index < firstColumn ? "@min-[420px]:col-start-1" : "@min-[420px]:col-start-5";
          if (entry.key === null) {
            return (
              <li key="unattributed" className={cn(row, column)}>
                {content}
              </li>
            );
          }
          const key = entry.key;
          return (
            <li key={key} className={cn("col-span-3 grid grid-cols-subgrid", column)}>
              <button
                type="button"
                aria-pressed={pressed}
                title={
                  pressed
                    ? t("oats.intelligence.talkTime.everyone")
                    : t("oats.intelligence.talkTime.show", { speaker: entry.label })
                }
                onClick={() => onSelect(key)}
                className={cn(
                  row,
                  "rounded-md text-left outline-none transition-colors",
                  "hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                )}
              >
                {content}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
