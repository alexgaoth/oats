import { useState } from "react";
import ConversationFlow from "../conversation/ConversationFlow";
import type { ConversationFlowView } from "../../stores/settingsStore";
import type { ConversationSuggestion } from "../../types/conversationEvents";
import type { TourConversation } from "../../helpers/oatsTour.mjs";

/** The example has no past conversations, so the card's footer stays empty. */
const NO_SUGGESTIONS: ConversationSuggestion[] = [];

/**
 * The flow card on the example conversation: its topics, found and named as
 * the subject moved, as lanes or as a graph. Pressing a topic quotes it, as on
 * the recording screen. The choice of view is this piece's own: it starts on
 * Lanes, as the app does, and is never saved.
 */
export default function DemoFlow({
  conversation,
  className,
}: {
  conversation: TourConversation;
  className?: string;
}) {
  const [view, setView] = useState<ConversationFlowView>("lanes");
  return (
    <ConversationFlow
      snapshot={conversation.snapshot}
      segments={conversation.segments}
      suggestions={NO_SUGGESTIONS}
      view={view}
      onViewChange={setView}
      className={className}
    />
  );
}
