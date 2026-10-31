import { ConversationReview } from "../conversation/ConversationReview";
import type { TourConversation } from "../../helpers/oatsTour.mjs";

/**
 * What nobody answered, the first thing in a record's summary tab, with the
 * answers one press away. In the record each question is also a place in the
 * transcript; the example has no transcript to open, so here the questions
 * are words, not buttons.
 */
export default function DemoOpen({ conversation }: { conversation: TourConversation }) {
  return <ConversationReview events={conversation.events} topics={conversation.topics} />;
}
