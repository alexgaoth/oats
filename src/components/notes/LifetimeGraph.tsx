import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ForceGraph from "./ForceGraph";
import { buildLifetimeGraph, recurringTopics } from "../../helpers/lifetimeGraph";
import type { ConversationTopicSnapshot } from "../../types/conversationEvents";
import type { NoteItem } from "../../types/electron";

// The lifetime graph (DESIGN.md §9.7): one node per conversation, edges where two
// conversations talked about the same thing.
//
// The topic graph answers "how did this conversation move?". This answers the
// question you cannot see from inside any single conversation — "what do I keep
// coming back to?" — and it is the only surface in Oats that looks across months
// rather than minutes.

interface LifetimeNode {
  id: number;
  label: string;
  durationMs: number;
  state: "live" | "open" | "resolved" | "dropped";
  createdAt: number;
  topicCount: number;
  topics: string[];
  returns: number;
}

function readSnapshot(raw: string | null): ConversationTopicSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.nodes) ? parsed : null;
  } catch {
    return null;
  }
}

// Below this there is no shape to see — two or three dots and a line is not a
// map, it is a list with extra steps.
const MIN_CONVERSATIONS = 3;

export default function LifetimeGraph({
  notes,
  onOpen,
}: {
  notes: NoteItem[];
  onOpen: (noteId: number) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<LifetimeNode | null>(null);

  const conversations = useMemo(
    () =>
      notes
        .map((note) => ({
          id: note.id,
          title: note.title || t("oats.untitled"),
          createdAt: new Date(note.created_at).getTime() || 0,
          snapshot: readSnapshot(note.conversation_topics),
        }))
        .filter((item) => item.snapshot),
    [notes, t]
  );

  const graph = useMemo(() => buildLifetimeGraph(conversations), [conversations]);
  const recurring = useMemo(() => recurringTopics(conversations), [conversations]);

  if (graph.nodes.length < MIN_CONVERSATIONS) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="max-w-sm text-center text-sm leading-6 text-muted-foreground">
          {t("lifetime.empty", { count: MIN_CONVERSATIONS })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {recurring.length > 0 && (
        <p className="shrink-0 px-1 pb-4 text-sm text-muted-foreground">
          {t("lifetime.recurring")}{" "}
          {recurring.map((item, index) => (
            <span key={item.label}>
              {index > 0 && ", "}
              <span className="font-mono text-foreground/80">{item.label}</span>
              <span className="text-muted-foreground/70">
                {" "}
                ({t("lifetime.inCount", { count: item.conversations })})
              </span>
            </span>
          ))}
        </p>
      )}
      {/* Same treatment as the topic graph: no box, full width, and the panel
          only once something is selected. §9.7 requires the two graphs behave
          identically — two graphs that differ are two things to learn. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 w-full flex-1">
          <ForceGraph<LifetimeNode>
            nodes={graph.nodes as LifetimeNode[]}
            edges={graph.edges}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            layoutKey="oats:lifetime-layout"
            nodeDescription={(node) =>
              t("lifetime.node", { label: node.label, count: node.topicCount })
            }
          />
        </div>
        {selected && (
          <aside className="mt-6 shrink-0 border-t border-border/40 pt-5">
            <>
              <p className="text-sm font-medium leading-snug text-foreground">{selected.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(selected.createdAt).toLocaleDateString()} ·{" "}
                {t("lifetime.topicCount", { count: selected.topicCount })}
              </p>
              <ul className="mt-4 space-y-1.5">
                {selected.topics.map((topic) => (
                  <li key={topic} className="font-mono text-xs text-foreground/70">
                    {topic}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onOpen(selected.id)}
                // Ink, not gold. §3: gold is a mark colour, never a reading colour, and §9.4
                // grants the accent to the *topic* graph's re-search action only — the
                // lifetime graph has no such grant, so an "open" link in gold would be a
                // second accent competing with the connected nodes.
                className="mt-5 rounded-sm text-xs text-foreground underline underline-offset-4 transition-opacity [transition-duration:var(--motion-instant)] hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("lifetime.open")}
              </button>
            </>
          </aside>
        )}
      </div>
    </div>
  );
}
