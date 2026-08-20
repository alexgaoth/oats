import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { cn } from "../lib/utils";
import type { ConversationSuggestion, OpenThread } from "../../types/conversationEvents";

// The open-thread stack (DESIGN.md §9.3). Live during recording, beside the
// pulse. It answers the one thing the speakers cannot hold in their own heads:
// what did we start and never finish?
//
// Collapsed is the normal state — you should be able to talk for an hour and
// never look at it. It expands only when asked, auto-collapses the moment
// someone speaks again, and never expands itself. It is a reminder, not a task
// list: no checkboxes, no assignment, no progress, no urgent state. If it is
// nagging, it is wrong.

export default function OpenThreadStack({
  threads,
  suggestions = [],
  speaking,
  className,
}: {
  threads: OpenThread[];
  suggestions?: ConversationSuggestion[];
  speaking: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const wasSpeaking = useRef(speaking);

  useEffect(() => {
    // Collapse on the rising edge of speech only, so it does not fight a user
    // who deliberately opened it during a pause.
    if (speaking && !wasSpeaking.current) setExpanded(false);
    wasSpeaking.current = speaking;
  }, [speaking]);

  if (!threads.length && !suggestions.length) return null;

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors [transition-duration:var(--motion-instant)] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Layers size={14} className="shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {t("openThreads.count", { count: threads.length })}
        </span>
        {!expanded && threads[0] && (
          <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground/50">
            {threads[0].label}
          </span>
        )}
      </button>

      <div
        // `transition-all` animates every animatable property this subtree
        // has — including the colours and the dither on the thread marks —
        // for the whole 380ms of an expand. Naming the two that actually
        // move keeps the stack's growth to the one sanctioned height
        // animation (DESIGN.md §8, "the silky-smooth rule").
        className={cn(
          "grid [transition-duration:var(--motion-slow)] [transition-property:grid-template-rows,opacity]",
          "[transition-timing-function:var(--ease-oats)]",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <ul className="mt-1 space-y-0.5 px-3 pb-1">
            {threads.map((thread) => (
              <li key={thread.id} className="flex items-baseline gap-2 py-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full",
                    thread.state === "dropped" && "oats-dither"
                  )}
                  style={{
                    color:
                      thread.state === "dropped" ? "var(--graph-silence)" : "var(--graph-open)",
                    backgroundColor: "currentColor",
                  }}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                  {thread.label}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {t(`openThreads.state.${thread.state}`)}
                </span>
              </li>
            ))}
          </ul>

          {/* Suggestions live inside the expanded stack and nowhere else. They
              are a thing to glance at when the room pauses — never a prompt,
              never visible while the rail is collapsed, never counted in the
              collapsed label. */}
          {suggestions.length > 0 && (
            <div className="mt-1 border-t border-border/40 px-3 pb-1 pt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                {t("suggestions.title")}
              </p>
              <ul className="mt-2 space-y-1.5">
                {suggestions.map((suggestion) => (
                  <li
                    key={`${suggestion.kind}-${suggestion.label}`}
                    className="flex items-baseline gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
                      {suggestion.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {suggestion.kind === "adjacent"
                        ? t("suggestions.adjacent", { count: suggestion.seenIn ?? 1 })
                        : t(`suggestions.${suggestion.kind}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
