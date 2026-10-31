import { useCallback, useMemo } from "react";
import ConversationSignalRail from "./ConversationSignalRail";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { searchHostLabel } from "../../utils/searchHost";
import type { ContextSource, ConversationCard } from "../../types/conversationEvents";

/**
 * The recording's question rail: `ConversationSignalRail` given the cards the
 * recording store publishes, and the three things a card does outside the
 * window. The rail itself holds none of them, so the demo pieces can draw it
 * without them (`components/demo/`).
 */
export default function LiveSignalRail({
  onFocus,
  announceOnly = false,
}: {
  onFocus: (groupKey: string | null) => void;
  announceOnly?: boolean;
}) {
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const searchBaseUrl = useSettingsStore((state) => state.conversationAideSearchBaseUrl);
  const searchHost = useMemo(() => searchHostLabel(searchBaseUrl), [searchBaseUrl]);

  // The one audited outbound path (`docs/network-allowlist.md`), the same one
  // the automatic search and the topic graph's re-search already use.
  //
  // The old `conversation-card-search` channel existed because the rail was the
  // least trustworthy window in the app and was allowed to name a card and
  // nothing else. The rail is the control panel's own renderer now — the one
  // that already calls this directly — so that indirection bought nothing and
  // was removed with the window it protected against.
  //
  // A card with no verdict yet has no derived query, but asking to search it is
  // reason enough: the question itself is the query.
  const onSearch = useCallback(
    (card: ConversationCard) => {
      void window.electronAPI?.openConversationSearch?.({
        eventId: card.suggestionId,
        query: card.query || card.question,
        searchBaseUrl: card.searchBaseUrl || searchBaseUrl,
      });
    },
    [searchBaseUrl]
  );

  // Dismissing removes a card from the rail, never from the record: main is
  // told, so the card's suggestion is not offered again.
  const onDismiss = useCallback((dismissed: ConversationCard[]) => {
    for (const card of dismissed) {
      void window.electronAPI?.dismissConversationCard?.(card.suggestionId);
    }
  }, []);

  // A verdict's file opens in its app, a link in the browser. A past
  // conversation is named, not opened (`CheckSource`).
  const onOpenSource = useCallback((source: ContextSource) => {
    if (source.kind === "file") void window.electronAPI?.openContextFile?.(source.path);
    else if (source.kind === "link") void window.electronAPI?.openExternal?.(source.url);
  }, []);

  return (
    <ConversationSignalRail
      cards={cards}
      onFocus={onFocus}
      announceOnly={announceOnly}
      searchHost={searchHost}
      onSearch={onSearch}
      onDismiss={onDismiss}
      onOpenSource={onOpenSource}
    />
  );
}
