import { useTranslation } from "react-i18next";
import ForceGraph from "./ForceGraph";
import type {
  ConversationTopicNode,
  ConversationTopicSnapshot,
} from "../../types/conversationEvents";

// The topic graph (DESIGN.md §9.4): how one conversation moved. Nodes are topics
// sized by time spent, edges are the transitions between them, and the curved
// back-edge — the room returning to something it had dropped — is the mark worth
// opening the view for.
export default function TopicGraph({
  snapshot,
  onSelect,
  selectedId,
  layoutKey = null,
  className,
}: {
  snapshot: ConversationTopicSnapshot;
  onSelect?: (node: ConversationTopicNode | null) => void;
  selectedId?: number | null;
  layoutKey?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <ForceGraph
      nodes={snapshot.nodes}
      edges={snapshot.edges}
      onSelect={onSelect}
      selectedId={selectedId}
      layoutKey={layoutKey}
      className={className}
      nodeDescription={(node) =>
        t("topicGraph.node", {
          label: node.label,
          seconds: Math.max(1, Math.round(node.durationMs / 1000)),
        })
      }
    />
  );
}
