// What the Global conversations board is drawn from: every conversation, as
// the few fields the board needs, split into one tab per conversation group.
//
// Pure, so the tab rules are tested: "All" holds every conversation, a group's
// tab holds only that group's, and the groups keep the order the person gave
// them (`stores/conversationGroupStore.ts` reads and orders them).

import type { ConversationGroup } from "../../types/electron";
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
  /** A cloud model's links to earlier conversations (`remoteLinks.mjs`), or null. */
  linkCheck?: LinkCheck | null;
}

/** A cloud model's link check, as stored on a note (`notes.conversation_links`). */
export interface LinkCheck {
  checkedAt: string;
  model: string;
  candidates: number[];
  links: { id: number; subject: string; topic: string; earlierTopic: string }[];
}

export interface BoardTab {
  id: string;
  /** Null for "All". The caller names every tab in the reader's language. */
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
