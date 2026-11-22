import { useState, type HTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { TopicNameState } from "../../types/conversationEvents";

// A topic's name where the flow card draws it (DESIGN.md §5, "A topic not
// named yet").
//
// While a name is on its way (`nameState` "pending", from `withNameStates` in
// topicNaming.mjs), the on-device word is not drawn: a single guessed word
// reads as a bad name, and it makes the real name look late. The first topic
// says "Finding the topic…" with a light passing through the words; a later
// one is a grey bar with the same light, and no word at all. When the name
// lands it fades in once, in the same line box, so nothing below moves. Under
// reduced motion the placeholder holds still and the name simply appears
// (index.css). A topic no name will come for ("device") and a stored topic
// (no `nameState`) show their label as it is.

/** The topic's name, or its placeholder while the name is on its way. */
export function TopicName({
  label,
  nameState,
  opening = false,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  label: string;
  nameState?: TopicNameState;
  /** The first topic raised: its placeholder says what is happening. */
  opening?: boolean;
  /** Drawn instead of `label` once it is a name: the graph's two lines. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  // Drawn as being named at some point: then the name arrives with a fade.
  // Derived during render, React's documented way, as RollingNumber does.
  const [waited, setWaited] = useState(nameState === "pending");
  if (nameState === "pending" && !waited) setWaited(true);
  if (nameState === "pending") {
    return opening ? (
      <span {...rest} className={cn("oats-topic-pending-text", className)}>
        {t("oats.flow.findingTopic")}
      </span>
    ) : (
      <span {...rest} className={cn("oats-topic-pending-bar", className)} />
    );
  }
  return (
    <span {...rest} className={cn(waited && "oats-topic-name-in", className)}>
      {children ?? label}
    </span>
  );
}
