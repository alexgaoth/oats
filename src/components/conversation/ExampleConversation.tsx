import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useToast } from "../ui/useToast";
import { addNote, useNotes, useNotesLoaded } from "../../stores/noteStore";
import { isExampleNote, offersExample } from "../../helpers/exampleConversation.mjs";
import type { NoteItem } from "../../types/electron";

// The bundled example conversation (`helpers/exampleConversation.mjs`): the
// quiet offer of it while nothing has been recorded, and the badge that marks
// it wherever its title is shown. Neither is honey. The brand marks the main
// action on a screen (DESIGN.md §2), and on both screens with this offer the
// main action is Start recording.

/**
 * "Example", beside the title of a bundled example conversation. Muted, so the
 * title stays the first thing read. Not in the sidebar's Recent list: at its
 * width the badge would take half of the title.
 */
export function ExampleBadge({
  note,
  className,
}: {
  note: Pick<NoteItem, "sample_id">;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!isExampleNote(note)) return null;
  return (
    <Badge variant="outline" className={cn("py-0 text-muted-foreground", className)}>
      {t("oats.example.badge")}
    </Badge>
  );
}

/**
 * The offer: a plain button and one muted line, only while there are no
 * conversations at all. The press inserts the example in the main process and
 * opens it the way a Recent row opens a conversation.
 *
 * `line` sits under Home's record card; `stacked` is centred under Start
 * recording in the empty Conversations page.
 */
export function ExampleOffer({
  layout = "line",
  className,
}: {
  layout?: "line" | "stacked";
  className?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const notes = useNotes();
  const loaded = useNotesLoaded();
  const [opening, setOpening] = useState(false);
  const noteId = useId();
  if (!offersExample({ loaded, notes })) return null;

  const open = async () => {
    setOpening(true);
    try {
      const result = await window.electronAPI?.insertExampleConversation?.();
      if (!result || !result.success) throw new Error("The example conversation was not opened");
      // Held at once, so the reading view finds it before `note-added` lands.
      if (result.note) addNote(result.note);
      window.dispatchEvent(new CustomEvent("oats-open-note", { detail: result.noteId }));
    } catch {
      // Main inserts in one transaction, so a failure has added nothing.
      toast({
        title: t("oats.example.failed"),
        description: t("oats.example.failedHint"),
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className={cn(
        layout === "stacked"
          ? "flex flex-col items-center text-center"
          : "flex flex-wrap items-center gap-x-2 gap-y-1",
        className
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={opening}
        aria-busy={opening || undefined}
        aria-describedby={noteId}
        onClick={() => void open()}
        className={cn(layout === "line" && "-ml-3")}
      >
        {t("oats.example.open")}
      </Button>
      <p
        id={noteId}
        className={cn(
          "text-[13px] leading-5 text-muted-foreground",
          layout === "stacked" && "max-w-md text-balance"
        )}
      >
        {t("oats.example.note")}
      </p>
    </div>
  );
}
