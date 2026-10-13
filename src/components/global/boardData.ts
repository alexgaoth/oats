// What the Global conversations board is drawn from: every conversation, as
// the few fields the board needs, split into one tab per conversation group.
//
// Pure, so the tab rules are tested: "All" holds every conversation, a group's
// tab holds only that group's, and a group list that is missing or malformed
// leaves just "All".

import { ALL_TAB, groupTab } from "./boardPersistence.ts";

export interface TopicSnapshot {
  nodes: { label: string; words?: string[]; durationMs?: number }[];
  edges?: unknown[];
}

/** One conversation, as the board sees it. */
export interface BoardConversation {
  id: number;
  title: string;
  /** Epoch ms. */
  createdAt: number;
  snapshot: TopicSnapshot | null;
  groupId: number | null;
  /** Questions left with no verdict, as counted at Finish; null if never counted. */
  openQuestions: number | null;
}

export interface ConversationGroup {
  id: number;
  name: string;
  seedKey: string | null;
}

export interface BoardTab {
  id: string;
  /** Null for "All", which the caller names in the reader's language. */
  group: ConversationGroup | null;
}

/** A topic snapshot as stored on a note, or null when there is none to read. */
export function readSnapshot(raw: unknown): TopicSnapshot | null {
  let value = raw;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const nodes = (value as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) ? (value as TopicSnapshot) : null;
}

/** The groups the main process reported, in its order, with anything unusable left out. */
export function sanitizeGroups(raw: unknown): ConversationGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const groups: ConversationGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, name, seed_key: seedKey } = item as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isFinite(id) || seen.has(id)) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    seen.add(id);
    groups.push({ id, name: name.trim(), seedKey: typeof seedKey === "string" ? seedKey : null });
  }
  return groups;
}

/** "All", then one tab per group in the groups' own order. */
export function boardTabs(groups: ConversationGroup[]): BoardTab[] {
  return [
    { id: ALL_TAB, group: null },
    ...groups.map((group) => ({ id: groupTab(group.id), group })),
  ];
}

/** The conversations a tab shows. */
export function conversationsInTab(
  conversations: BoardConversation[],
  tab: BoardTab
): BoardConversation[] {
  if (!tab.group) return conversations;
  const id = tab.group.id;
  return conversations.filter((conversation) => conversation.groupId === id);
}

/**
 * A conversation's title as short as it can be said: the part before a colon,
 * which is how generated titles name their subject ("Design crit: import
 * errors and SSO" is "Design crit"). A title with no colon, or nothing before
 * it, is kept whole.
 */
export function shortTitle(title: string): string {
  const head = title.split(":")[0]?.trim();
  return head ? head : title.trim();
}
