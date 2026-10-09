import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import ForceGraph from "./ForceGraph";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { buildLifetimeGraph, recurringTopics } from "../../helpers/lifetimeGraph";
import { ledgerDate } from "../../helpers/ledgerDate.mjs";
import { parseDbTimestamp } from "../../helpers/dbTime.mjs";
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
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<LifetimeNode | null>(null);

  const conversations = useMemo(
    () =>
      notes
        .map((note) => ({
          id: note.id,
          title: note.title || t("oats.untitled"),
          createdAt: parseDbTimestamp(note.created_at) || 0,
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
        // The same column the map's heading uses (`OatsWorkspace`), because the
        // graph beneath is full-bleed and this caption is not: at `px-1` it sat
        // hard against the window's left edge, a line of text with no relation
        // to the heading above it or the graph below — it read as debris rather
        // than as the caption for what is on screen.
        <p className="mx-auto w-full max-w-3xl shrink-0 px-8 pb-4 text-sm text-muted-foreground">
          {t("lifetime.recurring")}{" "}
          {recurring.map((item, index) => (
            <span key={item.label}>
              {index > 0 && ", "}
              <span className="font-medium text-foreground">{item.label}</span>
              <span> ({t("lifetime.inCount", { count: item.conversations })})</span>
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
          // Same column as the caption and the heading. Full-bleed is right for
          // the graph and wrong for prose: unpadded, a selected conversation's
          // title, date and topic list appeared jammed into the window's
          // bottom-left corner, lined up with nothing on the screen.
          <aside className="shrink-0 border-t border-border">
            <div className="mx-auto w-full max-w-3xl px-8 pb-6 pt-5">
              <h3 className="text-sm font-semibold leading-snug text-foreground">
                {selected.label}
              </h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {ledgerDate(selected.createdAt, { locale: i18n.language })} ·{" "}
                {t("lifetime.topicCount", { count: selected.topicCount })}
              </p>
              {selected.topics.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {selected.topics.map((topic) => (
                    <li key={topic}>
                      <Badge variant="secondary">{topic}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {/* Outline, not the brand fill: the map's selected node already
                  carries the brand, and opening is a way out, not the point. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpen(selected.id)}
                className="mt-4"
              >
                {t("lifetime.open")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
