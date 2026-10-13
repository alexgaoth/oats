import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../../stores/noteStore";
import { parseDbTimestamp } from "../../helpers/dbTime.mjs";
import { subjectThreads } from "../../helpers/lifetimeGraph";
import type { NoteItem } from "../../types/electron";
import { readSnapshot, sanitizeGroups } from "./boardData";
import type { BoardConversation, ConversationGroup } from "./boardData";
import type { Subject } from "./linkedHighlight";

// The board's data, kept current without rebuilding anything that did not
// change: a recording's checkpoints update its note many times a minute, and
// none of that touches what the board draws until the topics are written.

/** How many conversations the note store holds (`OatsWorkspace`'s `initializeNotes`). */
const HELD_LIMIT = 100;
/** How many the board reads when the store does not hold them all. */
const BOARD_LIMIT = 1000;

type BoardNote = NoteItem & { group_id?: number | null };

function toBoardConversation(note: BoardNote, untitled: string): BoardConversation {
  const createdAt = parseDbTimestamp(note.created_at);
  return {
    id: note.id,
    title: note.title?.trim() || untitled,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    snapshot: readSnapshot(note.conversation_topics),
    groupId: typeof note.group_id === "number" ? note.group_id : null,
    openQuestions: typeof note.open_questions === "number" ? note.open_questions : null,
  };
}

/** What, of a note, the board draws. Equal keys mean an unchanged conversation. */
function boardKey(note: BoardNote): string {
  return [
    note.title,
    note.created_at,
    note.group_id ?? "",
    note.open_questions ?? "",
    note.conversation_topics ?? "",
  ].join("\u0000");
}

/**
 * Every conversation, newest held by the note store and the rest read once.
 *
 * The store holds the hundred most recently updated, which is everything for
 * most people; past that the board reads the rest itself, once, and keeps them
 * current from the same note events the store listens to.
 */
export function useBoardConversations(untitled: string): BoardConversation[] {
  const held = useNotes() as BoardNote[];
  const needOlder = held.length >= HELD_LIMIT;
  const [older, setOlder] = useState<BoardConversation[]>([]);
  const cache = useRef(new Map<number, { key: string; conversation: BoardConversation }>());

  useEffect(() => {
    if (!needOlder) return undefined;
    let cancelled = false;
    void Promise.resolve(window.electronAPI?.getNotes?.("meeting", BOARD_LIMIT))
      .then((notes) => {
        if (cancelled || !Array.isArray(notes)) return;
        setOlder((notes as BoardNote[]).map((note) => toBoardConversation(note, untitled)));
      })
      .catch(() => {
        // The held conversations are still drawn; an older one is missing.
      });
    const offUpdated = window.electronAPI?.onNoteUpdated?.((note) => {
      if (!note) return;
      setOlder((previous) =>
        previous.some((item) => item.id === note.id)
          ? previous.map((item) =>
              item.id === note.id ? toBoardConversation(note as BoardNote, untitled) : item
            )
          : previous
      );
    });
    const offDeleted = window.electronAPI?.onNoteDeleted?.((payload) => {
      setOlder((previous) => previous.filter((item) => item.id !== payload?.id));
    });
    return () => {
      cancelled = true;
      offUpdated?.();
      offDeleted?.();
    };
  }, [needOlder, untitled]);

  const previous = useRef<BoardConversation[]>([]);
  return useMemo(() => {
    const byId = new Map<number, BoardConversation>();
    for (const item of older) byId.set(item.id, item);
    for (const note of held) {
      const key = boardKey(note);
      const hit = cache.current.get(note.id);
      if (hit && hit.key === key) {
        byId.set(note.id, hit.conversation);
        continue;
      }
      const conversation = toBoardConversation(note, untitled);
      cache.current.set(note.id, { key, conversation });
      byId.set(note.id, conversation);
    }
    const next = [...byId.values()];
    // The same conversations as last time: the same array, so nothing that
    // depends on it is rebuilt.
    const last = previous.current;
    if (last.length === next.length && last.every((item, index) => item === next[index])) {
      return last;
    }
    previous.current = next;
    return next;
  }, [held, older, untitled]);
}

interface GroupsApi {
  getConversationGroups?: () => Promise<unknown> | unknown;
  onConversationGroupsChanged?: (callback: () => void) => (() => void) | void;
}

/**
 * The conversation groups, when this build has them. Until the main process
 * offers `getConversationGroups`, there are none and the board shows "All".
 */
export function useConversationGroups(): ConversationGroup[] {
  const [groups, setGroups] = useState<ConversationGroup[]>([]);
  useEffect(() => {
    const api = window.electronAPI as unknown as GroupsApi | undefined;
    if (typeof api?.getConversationGroups !== "function") return undefined;
    let cancelled = false;
    const load = () => {
      void Promise.resolve()
        .then(() => api.getConversationGroups?.())
        .then((list) => {
          if (!cancelled) setGroups(sanitizeGroups(list));
        })
        .catch(() => {
          // No groups is a board with one tab, not an error worth showing.
        });
    };
    load();
    const off =
      typeof api.onConversationGroupsChanged === "function"
        ? api.onConversationGroupsChanged(load)
        : undefined;
    window.addEventListener("conversation-groups-changed", load);
    return () => {
      cancelled = true;
      if (typeof off === "function") off();
      window.removeEventListener("conversation-groups-changed", load);
    };
  }, []);
  return groups;
}

export interface BoardNode {
  id: number;
  label: string;
  createdAt: number;
  durationMs: number;
  topicCount: number;
  topics: string[];
  state: "open";
}

export interface BoardEdge {
  from: number;
  to: number;
  weight: number;
  kind: string;
  topics: string[];
}

/** One tab's conversations as the graphs draw them, and what comes back across them. */
export interface TabGraph {
  nodes: BoardNode[];
  edges: BoardEdge[];
  subjects: Subject[];
}

export function useTabGraph(conversations: BoardConversation[]): TabGraph {
  return useMemo(() => {
    const withTopics = conversations
      .filter((conversation) => conversation.snapshot?.nodes.length)
      .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
    // A conversation's disc says how long it was, and nothing else: its
    // connections are its edges, and honey is kept for what is pointed at.
    const nodes: BoardNode[] = withTopics.map((conversation) => {
      const topics = conversation.snapshot?.nodes ?? [];
      return {
        id: conversation.id,
        label: conversation.title,
        createdAt: conversation.createdAt,
        durationMs: topics.reduce((total, topic) => total + (Number(topic.durationMs) || 0), 0),
        topicCount: topics.length,
        topics: topics.map((topic) => topic.label),
        state: "open" as const,
      };
    });
    const threads = subjectThreads(withTopics) as {
      subjects: Subject[];
      edges: BoardEdge[];
    };
    return { nodes, edges: threads.edges, subjects: threads.subjects };
  }, [conversations]);
}
