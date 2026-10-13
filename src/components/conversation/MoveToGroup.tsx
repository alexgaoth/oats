import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FolderInput, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import {
  createConversationGroup,
  groupDisplayName,
  setConversationGroup,
  useConversationGroups,
  type ConversationGroupFailure,
} from "../../stores/conversationGroupStore";
import type { NoteItem } from "../../types/electron";

/** What a move did, for the line that says so. `group` null: no group. */
export interface GroupMove {
  ok: boolean;
  group: string | null;
}

/** The longest group name (database.js checks it too). */
export const GROUP_NAME_MAX = 40;

// The radio value of "No group". Group ids are numbers, so it cannot collide.
const NO_GROUP = "none";

/**
 * "Move to group", for a conversation's ⋯ menu: every group with a check on
 * the one it is in, then "No group", then "New group…". A choice here is a
 * person's, so the writing model never moves the conversation again, and
 * choosing the group it is already in keeps it there for good.
 *
 * "New group…" opens a dialog, so it hands its action to `onSelectAfterClose`
 * (ui/dropdown-menu.tsx): the owner opens `NewGroupDialog` once the menu has
 * closed.
 */
export function MoveToGroupMenu({
  note,
  onNewGroup,
  onMoved,
}: {
  note: NoteItem;
  onNewGroup: () => void;
  onMoved: (move: GroupMove) => void;
}) {
  const { t } = useTranslation();
  const { groups } = useConversationGroups();
  const inGroup = groups.find((group) => group.id === note.group_id) ?? null;
  const current = inGroup ? String(inGroup.id) : NO_GROUP;

  const move = async (value: string) => {
    const group = value === NO_GROUP ? null : (groups.find((g) => String(g.id) === value) ?? null);
    if (value !== NO_GROUP && !group) return;
    const result = await setConversationGroup(note.id, group?.id ?? null);
    onMoved({ ok: result.success, group: group ? groupDisplayName(group, t) : null });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInput aria-hidden="true" />
        {t("oats.groups.moveTo")}
      </DropdownMenuSubTrigger>
      {/* As wide as the longest name (40 characters at most), so every name
          shows whole. */}
      <DropdownMenuSubContent className="min-w-44">
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => void move(value)}>
          {groups.map((group) => (
            <DropdownMenuRadioItem key={group.id} value={String(group.id)}>
              {groupDisplayName(group, t)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={NO_GROUP}>{t("oats.groups.none")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelectAfterClose={onNewGroup}>
          <Plus aria-hidden="true" />
          {t("oats.groups.new")}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function errorText(error: ConversationGroupFailure, t: TFunction) {
  switch (error) {
    case "name-required":
      return t("oats.groups.errors.nameRequired");
    case "name-too-long":
      return t("oats.groups.errors.nameTooLong", { max: GROUP_NAME_MAX });
    case "name-taken":
      return t("oats.groups.errors.nameTaken");
    default:
      return t("oats.groups.errors.failed");
  }
}

/**
 * Name a new group. With a `noteId`, that conversation moves into it, by the
 * person's hand. A name that cannot be used says why under the field and
 * keeps the dialog open.
 *
 * Opened from state, never from a trigger, so give it an `onCloseAutoFocus`
 * that puts the focus back where it came from.
 */
export function NewGroupDialog({
  open,
  onOpenChange,
  noteId = null,
  onMoved,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId?: number | null;
  onMoved?: (move: GroupMove) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<ConversationGroupFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    setBusy(false);
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    const created = await createConversationGroup(name);
    if (created.success === false) {
      setBusy(false);
      setError(created.error);
      return;
    }
    if (noteId != null) {
      const moved = await setConversationGroup(noteId, created.group.id);
      onMoved?.({ ok: moved.success, group: groupDisplayName(created.group, t) });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("oats.groups.newTitle")}</DialogTitle>
            {noteId != null && (
              <DialogDescription>{t("oats.groups.newDescription")}</DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              {t("oats.groups.nameLabel")}
            </label>
            <Input
              id={inputId}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              maxLength={GROUP_NAME_MAX}
              value={name}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
            {error && (
              <p id={errorId} role="alert" className="text-[13px] text-destructive">
                {errorText(error, t)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("oats.groups.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
