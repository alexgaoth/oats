// Fictional preview data only. Production uses the SQLite/IPC implementation.
import { recallText, findExcerpt } from "../../src/helpers/conversationRecall.mjs";
import { foldText } from "../../src/helpers/searchFold.mjs";
import { parseMoments } from "../../src/helpers/conversationMoments.mjs";

const parse = (raw, fallback) => {
  try {
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
};
const stamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const cleanName = (name) => {
  if (typeof name !== "string" || !name.trim() || name.length > 80) throw new Error("Invalid name");
  return name.normalize("NFC").replace(/\s+/gu, " ").trim();
};
const nameKey = (name) => cleanName(name).toLowerCase();
const segments = (note) => {
  const raw = parse(note?.transcript, []);
  return Array.isArray(raw)
    ? raw
        .map((segment, index) =>
          segment && typeof segment.text === "string"
            ? { ...segment, id: String(segment.id ?? `legacy-${index}`) }
            : null
        )
        .filter(Boolean)
    : [];
};
const hash = async (text) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export function createDemoLibrary({ notes, emit, storage = null }) {
  const storageKey = "oatsDemoConversationLibrary:v1";
  const held = parse(storage?.getItem(storageKey), null);
  const state =
    held?.version === 1 ? held : { version: 1, sets: [], passages: [], views: [], nextId: 1 };
  const changed = () => {
    storage?.setItem(storageKey, JSON.stringify(state));
    emit("onConversationLibraryChanged");
  };
  const activeNote = (id) =>
    notes.find((note) => note.id === id && !note.deleted_at && note.note_type === "meeting");
  const findSet = (id) => {
    const set = state.sets.find((set) => set.id === id);
    if (!set) throw new Error("Set unavailable");
    return set;
  };
  const summary = (set) => ({ id: set.id, name: set.name, count: set.items.length });
  return {
    async listLibraryConversations(options = {}) {
      const needle = foldText(options.query?.trim() ?? "");
      const subject = foldText(options.subject?.trim() ?? "");
      const cursor =
        options.cursor == null ? null : notes.find((note) => note.id === options.cursor);
      if (options.cursor != null && !cursor) throw new Error("Cursor unavailable");
      const rows = notes
        .filter((note) => {
          if (
            !activeNote(note.id) ||
            (cursor &&
              (note.created_at > cursor.created_at ||
                (note.created_at === cursor.created_at && note.id >= cursor.id)))
          )
            return false;
          if (options.groupId !== undefined && (note.group_id ?? null) !== options.groupId)
            return false;
          if (options.markedOnly && !parseMoments(note.conversation_marks).length) return false;
          if (
            options.openQuestionsOnly &&
            !(Number.isInteger(note.open_questions) && note.open_questions > 0)
          )
            return false;
          if (needle && !foldText(recallText(note)).includes(needle)) return false;
          const topics = parse(note.conversation_topics, {})?.nodes ?? [];
          return (
            !subject ||
            options.conversationIds?.includes(note.id) ||
            topics.some((topic) =>
              foldText(
                [topic.label, ...(Array.isArray(topic.words) ? topic.words : [])].join(" ")
              ).includes(subject)
            )
          );
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
      const limit = options.limit ?? 30;
      const page = rows.slice(0, limit);
      return {
        items: page.map((note) => {
          const source =
            needle || subject ? findExcerpt(note, options.query || options.subject) : null;
          const turn =
            source?.source === "transcript"
              ? segments(note).find((segment) => segment.id === source.segmentId)
              : null;
          const topics = parse(note.conversation_topics, {})?.nodes;
          return {
            id: note.id,
            title: note.title,
            created_at: note.created_at,
            group_id: note.group_id ?? null,
            topics: Array.isArray(topics)
              ? topics
                  .filter((topic) => typeof topic?.label === "string")
                  .map(({ label, description }) => ({ label, description }))
              : [],
            excerpt: turn ? { text: turn.text.slice(0, 500), segmentId: turn.id } : null,
            openQuestionCount: Number.isInteger(note.open_questions) ? note.open_questions : null,
            markedCount: parseMoments(note.conversation_marks).length,
          };
        }),
        cursor: rows.length > limit ? page.at(-1).id : null,
      };
    },
    async getWorkingSets() {
      return state.sets.map(summary);
    },
    async createWorkingSet(name) {
      const cleaned = cleanName(name);
      if (state.sets.some((set) => nameKey(set.name) === nameKey(cleaned)))
        throw new Error("Name in use");
      const set = { id: state.nextId++, name: cleaned, items: [] };
      state.sets.push(set);
      changed();
      return summary(set);
    },
    async renameWorkingSet(id, name) {
      const cleaned = cleanName(name);
      if (state.sets.some((set) => set.id !== id && nameKey(set.name) === nameKey(cleaned)))
        throw new Error("Name in use");
      findSet(id).name = cleaned;
      changed();
    },
    async deleteWorkingSet(id) {
      findSet(id);
      state.sets = state.sets.filter((set) => set.id !== id);
      changed();
    },
    async getWorkingSet(id) {
      const set = state.sets.find((set) => set.id === id);
      if (!set) return null;
      const passages = await Promise.all(
        set.items.map(async (item) => {
          const passage = state.passages.find((passage) => passage.id === item.id);
          const note = activeNote(passage.noteId);
          const segment = segments(note).find((segment) => segment.id === passage.segmentId);
          const currentQuote =
            segment && passage.end <= segment.text.length
              ? segment.text.slice(passage.start, passage.end)
              : null;
          const sourceStatus =
            !note || !segment
              ? "missing"
              : currentQuote !== null && (await hash(currentQuote)) === passage.hash
                ? "available"
                : "changed";
          return {
            ...passage,
            quote: sourceStatus === "available" ? currentQuote : "",
            currentQuote,
            sourceStatus,
            title: note?.title ?? "",
            createdAt: item.createdAt,
            note: item.note,
          };
        })
      );
      return { ...summary(set), passages };
    },
    async addWorkingSetPassage(id, source) {
      const note = activeNote(source.noteId);
      const segment = segments(note).find((segment) => segment.id === source.segmentId);
      const start = source.start ?? 0;
      const end = source.end ?? segment?.text.length;
      if (
        !segment ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > segment.text.length
      )
        throw new Error("Source unavailable");
      const digest = await hash(segment.text.slice(start, end));
      const set = findSet(id);
      let passage = state.passages.find(
        (item) =>
          item.noteId === source.noteId &&
          item.segmentId === source.segmentId &&
          item.start === start &&
          item.end === end &&
          item.hash === digest
      );
      if (!passage) {
        passage = {
          id: state.nextId++,
          noteId: source.noteId,
          segmentId: source.segmentId,
          start,
          end,
          hash: digest,
        };
        state.passages.push(passage);
      }
      if (!set.items.some((item) => item.id === passage.id))
        set.items.push({ id: passage.id, note: "", createdAt: stamp() });
      changed();
    },
    async updateWorkingSetPassage(id, passageId, update) {
      const set = findSet(id);
      const index = set.items.findIndex((item) => item.id === passageId);
      if (index < 0) throw new Error("Passage unavailable");
      if (update.note !== undefined) set.items[index].note = update.note.slice(0, 500);
      if (update.position !== undefined) {
        const [item] = set.items.splice(index, 1);
        set.items.splice(update.position, 0, item);
      }
      changed();
    },
    async removeWorkingSetPassage(id, passageId) {
      const set = findSet(id);
      set.items = set.items.filter((item) => item.id !== passageId);
      changed();
    },
    async listSavedViews() {
      return structuredClone(state.views);
    },
    async saveLibraryView(view) {
      const name = cleanName(view.name);
      if (state.views.some((held) => held.id !== view.id && nameKey(held.name) === nameKey(name)))
        throw new Error("Name in use");
      const item = {
        id: view.id ?? state.nextId++,
        name,
        criteria: structuredClone(view.criteria),
      };
      state.views = [...state.views.filter((held) => held.id !== item.id), item];
      changed();
    },
    async deleteLibraryView(id) {
      state.views = state.views.filter((view) => view.id !== id);
      changed();
    },
  };
}
