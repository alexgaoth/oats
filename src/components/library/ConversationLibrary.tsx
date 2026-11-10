import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BookmarkPlus,
  Files,
  ListFilter,
  MoreHorizontal,
  Search,
  SplitSquareHorizontal,
} from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { LibraryCriteria } from "../../types/conversationLibrary";
import { WorkingSets } from "./WorkingSets";
import { SavedViews, SubjectHistory } from "./LibraryBrowser";
import { ConversationComparison } from "./ConversationComparison";
import { LibraryContext, useLibraryTools } from "./libraryContext";
import type { LibraryDialog, LibraryTools, PassageSource } from "./libraryContext";
import { LibraryError } from "./LibraryError";

/** Secondary tools share one dialog, not another navigation surface. */
export function ConversationLibrary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<LibraryDialog | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [criteria, setCriteria] = useState<LibraryCriteria | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  const opening = useRef(0);
  const lastSource = useRef<{ id: number; segmentId: string | null } | null>(null);

  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    const clear = () => setCriteria(null);
    window.addEventListener("oats-clear-search", clear);
    const subscriptions = [
      window.electronAPI?.onConversationLibraryChanged?.(changed),
      window.electronAPI?.onNoteUpdated?.(changed),
      window.electronAPI?.onNoteDeleted?.(changed),
      window.electronAPI?.onNoteAdded?.(changed),
    ];
    return () => {
      window.removeEventListener("oats-clear-search", clear);
      subscriptions.forEach((off) => off?.());
    };
  }, []);

  const close = () => {
    opening.current += 1;
    setIsOpen(false);
    setError(false);
  };
  const show: LibraryTools["show"] = (next, target) => {
    opening.current += 1;
    returnTo.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    navigating.current = false;
    setError(false);
    setDialog(next);
    setIsOpen(true);
  };
  const openSource: LibraryTools["openSource"] = async (id, segmentId = null) => {
    lastSource.current = { id, segmentId };
    setError(false);
    const ticket = ++opening.current;
    try {
      const note = await window.electronAPI.getNote(id);
      if (ticket !== opening.current) return;
      if (!note || note.deleted_at) throw new Error("Source unavailable");
      navigating.current = true;
      window.dispatchEvent(new CustomEvent("oats-library-source", { detail: { note, segmentId } }));
      setIsOpen(false);
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>("[data-library-source-heading]")?.focus()
      );
    } catch {
      if (ticket === opening.current) setError(true);
    }
  };
  const title =
    dialog?.kind === "subject"
      ? t("oats.library.subjectHistory", { subject: dialog.label })
      : t(
          `oats.library.${dialog?.kind === "sets" ? (dialog.source ? "savePassage" : "workingSets") : dialog?.kind === "compare" ? "compare" : "savedViews"}`
        );

  return (
    <LibraryContext.Provider value={{ show, close, openSource, revision, criteria, setCriteria }}>
      {children}
      {error && !isOpen && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-background">
          <LibraryError
            retry={() => {
              if (lastSource.current)
                void openSource(lastSource.current.id, lastSource.current.segmentId);
            }}
          />
        </div>
      )}
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="oats-surface flex max-h-[calc(100dvh-3rem)] flex-col gap-5 overflow-y-auto sm:max-w-3xl"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (navigating.current) {
              requestAnimationFrame(() =>
                document.querySelector<HTMLButtonElement>("[data-library-source-heading]")?.focus()
              );
            } else if (returnTo.current?.isConnected) returnTo.current.focus();
            else document.querySelector<HTMLButtonElement>("[data-library-tools]")?.focus();
          }}
        >
          <DialogHeader className="shrink-0 pr-5">
            <DialogTitle className="text-base leading-6">{title}</DialogTitle>
            <DialogDescription>
              {t(
                `oats.library.${dialog?.kind === "subject" ? "historyDescription" : dialog?.kind === "compare" ? "compareDescription" : dialog?.kind === "sets" ? "setsDescription" : "viewsDescription"}`
              )}
            </DialogDescription>
          </DialogHeader>
          {error && <LibraryError />}
          {dialog?.kind === "sets" && <WorkingSets source={dialog.source} />}
          {dialog?.kind === "views" && <SavedViews current={dialog.criteria} />}
          {dialog?.kind === "subject" && (
            <SubjectHistory label={dialog.label} conversationIds={dialog.conversationIds} />
          )}
          {dialog?.kind === "compare" && <ConversationComparison firstId={dialog.firstId} />}
        </DialogContent>
      </Dialog>
    </LibraryContext.Provider>
  );
}

export function LibraryMenu({ query }: { query: string }) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-library-tools
          ref={trigger}
          variant="ghost"
          size="icon-sm"
          aria-label={t("oats.library.tools")}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelectAfterClose={() => {
            const criteria = tools.criteria ?? {};
            tools.setCriteria(criteria);
            window.dispatchEvent(
              new CustomEvent("oats-library-view", { detail: { ...criteria, query } })
            );
          }}
        >
          <ListFilter aria-hidden="true" />
          {t("oats.library.filter")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelectAfterClose={() =>
            tools.show({ kind: "views", criteria: { ...tools.criteria, query } }, trigger.current)
          }
        >
          <Search aria-hidden="true" />
          {t("oats.library.savedViews")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelectAfterClose={() => tools.show({ kind: "sets" }, trigger.current)}>
          <Files aria-hidden="true" />
          {t("oats.library.workingSets")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelectAfterClose={() => tools.show({ kind: "compare" }, trigger.current)}
        >
          <SplitSquareHorizontal aria-hidden="true" />
          {t("oats.library.compare")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CompareMenuItem({
  noteId,
  returnTo,
}: {
  noteId: number;
  returnTo: () => HTMLElement | null;
}) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  return (
    <DropdownMenuItem
      onSelectAfterClose={() => tools.show({ kind: "compare", firstId: noteId }, returnTo())}
    >
      <SplitSquareHorizontal aria-hidden="true" />
      {t("oats.library.compareWith")}
    </DropdownMenuItem>
  );
}

export function SavePassageButton({
  source,
  textRoot,
}: {
  source: PassageSource;
  textRoot: () => HTMLElement | null;
}) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-7 shrink-0 text-muted-foreground opacity-0 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      aria-label={t("oats.library.savePassage")}
      title={t("oats.library.savePassage")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const root = textRoot();
        const selection = window.getSelection();
        let range: { start: number; end: number } | undefined;
        if (root && selection?.rangeCount && !selection.isCollapsed) {
          const selected = selection.getRangeAt(0);
          if (root.contains(selected.startContainer) && root.contains(selected.endContainer)) {
            const before = selected.cloneRange();
            before.selectNodeContents(root);
            before.setEnd(selected.startContainer, selected.startOffset);
            const start = before.toString().length;
            range = { start, end: start + selected.toString().length };
          }
        }
        tools.show({ kind: "sets", source: { ...source, ...range } }, event.currentTarget);
      }}
    >
      <BookmarkPlus aria-hidden="true" />
    </Button>
  );
}
