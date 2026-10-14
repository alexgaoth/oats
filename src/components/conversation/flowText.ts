import type { TFunction } from "i18next";
import { Network, createLucideIcon } from "lucide-react";
import type { ViewSwitchOption } from "../ui/view-switch";

// Words and the view switch's drawing, shared by the flow card's two views
// (`ConversationFlow`, `TopicLanes`) and the reading view's Connections tab.
// Not components, so they live apart from them (fast refresh).

/**
 * The drawing on the view switch's Lanes choice: three rows, the line stepping
 * down them and climbing back to the first. Three parts, so they arrive one
 * after another when it is chosen (`.oats-view-glyph`).
 */
export const LanesGlyph = createLucideIcon("lanes", [
  ["path", { d: "M3 5h3c2 0 2 7 4 7", key: "lanes-1" }],
  ["path", { d: "M10 12h2c2 0 2 7 4 7", key: "lanes-2" }],
  ["path", { d: "M16 19h1c2 0 2-14 4-14", key: "lanes-3" }],
]);

/**
 * The two ways to draw a conversation's topics, as the view switch offers them
 * on the flow card and in the Connections tab: Lanes, the default, and Graph.
 */
export function flowViewOptions(t: TFunction): ViewSwitchOption<"lanes" | "graph">[] {
  return [
    { value: "lanes", label: t("oats.flow.mode.lanes"), icon: LanesGlyph },
    { value: "graph", label: t("oats.flow.mode.graph"), icon: Network },
  ];
}

export function stateLabel(t: TFunction, state: string): string {
  switch (state) {
    case "live":
      return t("oats.flow.state.live");
    case "open":
      return t("oats.flow.state.open");
    case "resolved":
      return t("oats.flow.state.resolved");
    default:
      return t("oats.flow.state.dropped");
  }
}

/**
 * The line under a flow's title: facts about the picture under it, not a
 * reason. "8 topics, 3 returns to earlier topics", or only the topics when the
 * room never went back. Counted from what the view draws, so a reader can
 * check it against the picture: the lanes do not draw a blip, and the graph
 * draws one link per pair of topics.
 */
export function flowCaption(
  t: TFunction,
  { topics, returns }: { topics: number; returns: number }
): string | null {
  if (!topics) return null;
  const counted = t("oats.flow.caption.topics", { count: topics });
  if (!returns) return counted;
  return t("oats.flow.caption.topicsReturns", {
    topics: counted,
    returns: t("oats.flow.caption.returns", { count: returns }),
  });
}
