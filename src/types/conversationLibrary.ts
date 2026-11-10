export interface LibraryCriteria {
  query?: string;
  /** Omitted means all groups; null means ungrouped. */
  groupId?: number | null;
  markedOnly?: boolean;
  openQuestionsOnly?: boolean;
}

export type LibraryOptions = LibraryCriteria & {
  subject?: string;
  /** Graph membership OR normalized topic phrase; other criteria still apply. */
  conversationIds?: number[];
  /**
   * Exclusive note ID resolved to its creation time. Order: created_at DESC,
   * id DESC. Soft-deleted cursors work; physically missing cursors reject.
   */
  cursor?: number | null;
  /** 1..200, default 50. */
  limit?: number;
};

export interface LibraryConversation {
  id: number;
  title: string;
  created_at: string;
  group_id: number | null;
  topics: Array<{ label: string; description?: string }>;
  excerpt: { text: string; segmentId: string | null } | null;
  openQuestionCount: number | null;
  markedCount: number;
}

export interface WorkingSet {
  id: number;
  name: string;
  /** Includes unavailable source references. */
  count: number;
}

export interface WorkingPassage {
  id: number;
  noteId: number;
  segmentId: string;
  /** UTF-16 offsets into the source segment, end exclusive. */
  start: number;
  end: number;
  /** Live source quote; empty if changed or missing. Never a stored copy. */
  quote: string;
  currentQuote: string | null;
  sourceStatus: "available" | "changed" | "missing";
  /** Empty for a deleted/missing source. */
  title: string;
  /** When this membership was added, in SQLite UTC form. */
  createdAt: string;
  note: string;
}

export interface WorkingSetDetail extends WorkingSet {
  /** In personal order. Positions are zero-based and contiguous. */
  passages: WorkingPassage[];
}

export interface WorkingPassageSource {
  noteId: number;
  segmentId: string;
  /** Omitted bounds select the full segment. */
  start?: number;
  end?: number;
}

export interface SavedLibraryView {
  id: number;
  name: string;
  criteria: LibraryCriteria;
}
