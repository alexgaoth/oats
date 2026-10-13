import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { TFunction } from "i18next";
import type {
  ConversationGroup,
  ConversationGroupError,
  ConversationGroupsChange,
  NoteItem,
} from "../types/electron";
import { patchNoteGroups, updateNoteInStore } from "./noteStore";

// The conversation groups (Work, Personal and the person's own), as the main
// process keeps them in `conversation_groups`. Read once, on first use, then
// kept current by `conversation-groups-changed`, which carries the whole list
// and the notes whose group changed with it.

interface ConversationGroupState {
  groups: ConversationGroup[];
  // True once the list has been read. Until then an empty list means "not
  // known yet", not "no groups".
  loaded: boolean;
}

const useConversationGroupStore = create<ConversationGroupState>()(() => ({
  groups: [],
  loaded: false,
}));

/** Why a request failed. "failed": the main process did not answer, or threw. */
export type ConversationGroupFailure = ConversationGroupError | "failed";
type Failed = { success: false; error: ConversationGroupFailure };
const FAILED: Failed = { success: false, error: "failed" };

let listening = false;
let reading: Promise<ConversationGroup[]> | null = null;

const byOrder = (a: ConversationGroup, b: ConversationGroup) =>
  a.sort_order - b.sort_order || a.id - b.id;

function applyChange(change: ConversationGroupsChange | null | undefined): void {
  if (!change) return;
  if (Array.isArray(change.groups)) {
    useConversationGroupStore.setState({ groups: [...change.groups].sort(byOrder), loaded: true });
  }
  if (Array.isArray(change.notes)) patchNoteGroups(change.notes);
}

function ensureListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const off = window.electronAPI?.onConversationGroupsChanged?.(applyChange);
  if (typeof off === "function") window.addEventListener("beforeunload", () => off());
}

/** Read the groups from the main process (one read at a time). */
export function loadConversationGroups(): Promise<ConversationGroup[]> {
  ensureListener();
  if (!reading) {
    reading = Promise.resolve(window.electronAPI?.getConversationGroups?.())
      .then((groups) => {
        const list = Array.isArray(groups) ? [...groups].sort(byOrder) : [];
        useConversationGroupStore.setState({ groups: list, loaded: true });
        return list;
      })
      .catch(() => {
        useConversationGroupStore.setState({ loaded: true });
        return useConversationGroupStore.getState().groups;
      })
      .finally(() => {
        reading = null;
      });
  }
  return reading;
}

/** The groups, in the person's order, read on first use and kept current. */
export function useConversationGroups(): { groups: ConversationGroup[]; loaded: boolean } {
  const groups = useConversationGroupStore((state) => state.groups);
  const loaded = useConversationGroupStore((state) => state.loaded);
  useEffect(() => {
    ensureListener();
    if (!useConversationGroupStore.getState().loaded) void loadConversationGroups();
  }, []);
  return useMemo(() => ({ groups, loaded }), [groups, loaded]);
}

/**
 * The name a group shows: a seeded group's in the current language, until it
 * is renamed; any other group's as the person wrote it.
 */
export function groupDisplayName(
  group: Pick<ConversationGroup, "name" | "seed_key">,
  t: TFunction
): string {
  return group.seed_key
    ? t(`oats.groups.seed.${group.seed_key}`, { defaultValue: group.name })
    : group.name;
}

/** The answer, or `FAILED` when the main process did not give one. */
async function settle<T>(request: Promise<T> | undefined): Promise<T | Failed> {
  try {
    return (await request) ?? FAILED;
  } catch {
    return FAILED;
  }
}

/** Hold a group the main process just returned, before its broadcast arrives. */
function keepGroup(group: ConversationGroup): void {
  const { groups } = useConversationGroupStore.getState();
  useConversationGroupStore.setState({
    groups: [...groups.filter((item) => item.id !== group.id), group].sort(byOrder),
    loaded: true,
  });
}

export async function createConversationGroup(
  name: string
): Promise<{ success: true; group: ConversationGroup } | Failed> {
  const result = await settle(window.electronAPI?.createConversationGroup?.(name));
  if (result.success) keepGroup(result.group);
  return result;
}

export async function renameConversationGroup(
  id: number,
  name: string
): Promise<{ success: true; group: ConversationGroup } | Failed> {
  const result = await settle(window.electronAPI?.renameConversationGroup?.(id, name));
  if (result.success) keepGroup(result.group);
  return result;
}

/** Delete a group. Its conversations are left in no group. */
export async function deleteConversationGroup(id: number): Promise<{ success: true } | Failed> {
  const result = await settle(window.electronAPI?.deleteConversationGroup?.(id));
  if (!result.success) return result;
  const { groups } = useConversationGroupStore.getState();
  useConversationGroupStore.setState({ groups: groups.filter((group) => group.id !== id) });
  patchNoteGroups(result.notes);
  return { success: true };
}

/** Put the groups in this order; groups not named follow, in their order. */
export async function reorderConversationGroups(
  ids: number[]
): Promise<{ success: true } | Failed> {
  const result = await settle(window.electronAPI?.reorderConversationGroups?.(ids));
  if (!result.success) return result;
  applyChange({ groups: result.groups, notes: [] });
  return { success: true };
}

/**
 * Put a conversation in a group, or in none (`groupId` null), by a person's
 * hand: the writing model never moves it again.
 */
export async function setConversationGroup(
  noteId: number,
  groupId: number | null
): Promise<{ success: true; note: NoteItem } | Failed> {
  const result = await settle(window.electronAPI?.setConversationGroup?.(noteId, groupId));
  if (result.success) updateNoteInStore(result.note);
  return result;
}
