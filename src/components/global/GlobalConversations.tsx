import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Ellipsis, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import Board from "./Board";
import type { BoardWidget, WidgetType } from "./boardLayout";
import { boardTabs, conversationsInTab } from "./boardData";
import { useBoardStore } from "./boardStore";
import { highlightSource, useGlobalHighlight } from "./highlightStore";
import { useBoardConversations, useTabGraph } from "./useBoardData";
import { groupDisplayName, useConversationGroups } from "../../stores/conversationGroupStore";
import { ArcTimelineWidget, ForceGraphWidget } from "./widgets";

// Global conversations: a board of charts across every conversation, one tab
// per conversation group. "All" shows every conversation; a group's tab shows
// only that group's. Each tab keeps its own arrangement of cards.
//
// The charts share one highlight: pointing at a conversation in one lights it
// in all of them, and a click opens it.

const NAME_KEY: Record<WidgetType, string> = {
  force: "oats.global.widgets.force.name",
  arcs: "oats.global.widgets.arcs.name",
};

export default function GlobalConversations({ onOpen }: { onOpen: (noteId: number) => void }) {
  const { t } = useTranslation();
  const conversations = useBoardConversations(t("oats.untitled"));
  const { groups } = useConversationGroups();
  const tabs = useMemo(() => boardTabs(groups), [groups]);
  const tabName = useCallback(
    (item: (typeof tabs)[number]) =>
      item.group ? groupDisplayName(item.group, t) : t("oats.global.tabs.all"),
    [t]
  );
  const activeTab = useBoardStore((state) => state.activeTab);
  const setActiveTab = useBoardStore((state) => state.setActiveTab);
  // A group that was removed takes its tab with it, and the board shows All.
  const tab = tabs.find((item) => item.id === activeTab) ?? tabs[0];

  const inTab = useMemo(() => conversationsInTab(conversations, tab), [conversations, tab]);
  const graph = useTabGraph(inTab);
  const highlight = useMemo(() => highlightSource(graph, graph.subjects), [graph]);

  const saved = useBoardStore((state) => state.layouts[tab.id]) ?? null;
  const saveLayout = useBoardStore((state) => state.saveLayout);
  const resetLayout = useBoardStore((state) => state.resetLayout);

  // What is pointed at belongs to the board on screen: nothing stays lit on a
  // tab nobody is pointing at, or once the board is gone.
  useEffect(() => {
    useGlobalHighlight.setState({ hoveredConversationId: null, hoveredSubject: null });
  }, [tab.id]);
  useEffect(
    () => () => useGlobalHighlight.setState({ hoveredConversationId: null, hoveredSubject: null }),
    []
  );

  const open = useCallback(
    (id: number) => {
      // Kept honey on the board, so coming back from it shows where you were.
      useGlobalHighlight.getState().select(id);
      onOpen(id);
    },
    [onOpen]
  );

  const name = useCallback((widget: BoardWidget) => t(NAME_KEY[widget.type]), [t]);
  const commit = useCallback(
    (widgets: BoardWidget[]) => saveLayout(tab.id, widgets),
    [saveLayout, tab.id]
  );

  const render = (widget: BoardWidget) => {
    switch (widget.type) {
      case "force":
        return (
          <ForceGraphWidget tabId={tab.id} graph={graph} highlight={highlight} onOpen={open} />
        );
      case "arcs":
        return <ArcTimelineWidget graph={graph} highlight={highlight} onOpen={open} />;
    }
  };

  return (
    <Tabs
      value={tab.id}
      onValueChange={setActiveTab}
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-x-clip"
    >
      <div className="flex items-center gap-2 px-[var(--board-inset,24px)]">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <TabsList aria-label={t("oats.global.tabs.label")}>
            {tabs.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="flex-none">
                {tabName(item)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("oats.global.menu.label")}
              className="text-muted-foreground"
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!saved} onSelect={() => resetLayout(tab.id)}>
              <RotateCcw aria-hidden="true" />
              {t("oats.global.menu.reset")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Not a tab stop of its own: the board holds focusable cards. */}
      <TabsContent value={tab.id} tabIndex={-1} className="mt-1 flex-none">
        <Board
          widgets={saved}
          onCommit={commit}
          name={name}
          render={render}
          empty={
            <div className="flex flex-col items-center gap-3 rounded-xl bg-background px-4 py-3">
              <p className="text-[13px] text-muted-foreground">{t("oats.global.cleared")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => resetLayout(tab.id)}>
                <RotateCcw aria-hidden="true" />
                {t("oats.global.menu.reset")}
              </Button>
            </div>
          }
          aria-label={t("oats.global.boardLabel", { tab: tabName(tab) })}
        />
      </TabsContent>
    </Tabs>
  );
}
