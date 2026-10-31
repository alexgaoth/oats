import ConversationFlow from "./ConversationFlow";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * The recording screen's flow card: `ConversationFlow` given the recording's
 * topics, its words, the moment Record was pressed and the subjects of past
 * conversations, with the Lanes / Graph choice kept as a setting. The card
 * itself reads no store, so the demo pieces draw it without one.
 */
export default function LiveConversationFlow({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const snapshot = useMeetingRecordingStore((s) => s.topicSnapshot);
  const segments = useMeetingRecordingStore((s) => s.segments);
  const startedAt = useMeetingRecordingStore((s) => s.recordingStartedAt);
  const suggestions = useMeetingRecordingStore((s) => s.suggestions);
  const view = useSettingsStore((s) => s.conversationFlowView);
  const setView = useSettingsStore((s) => s.setConversationFlowView);
  return (
    <ConversationFlow
      live
      snapshot={snapshot}
      segments={segments ?? undefined}
      startedAt={startedAt}
      suggestions={suggestions ?? undefined}
      view={view}
      onViewChange={setView}
      compact={compact}
      className={className}
    />
  );
}
