import { createContext, useContext } from "react";
import type { LibraryCriteria } from "../../types/conversationLibrary";

export type PassageSource = { noteId: number; segmentId: string; start?: number; end?: number };
export type LibraryDialog =
  | { kind: "sets"; source?: PassageSource }
  | { kind: "views"; criteria: LibraryCriteria }
  | { kind: "subject"; label: string; conversationIds: number[] }
  | { kind: "compare"; firstId?: number };
export type LibraryTools = {
  show: (dialog: LibraryDialog, returnTo?: HTMLElement | null) => void;
  close: () => void;
  openSource: (id: number, segmentId?: string | null) => Promise<void>;
  revision: number;
  criteria: LibraryCriteria | null;
  setCriteria: (criteria: LibraryCriteria | null) => void;
};
export const LibraryContext = createContext<LibraryTools | null>(null);
export function useLibraryTools() {
  const tools = useContext(LibraryContext);
  if (!tools) throw new Error("Conversation library is not mounted");
  return tools;
}
