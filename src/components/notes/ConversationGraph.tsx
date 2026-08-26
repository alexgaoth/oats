import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, MessageCircle, Search, ExternalLink, CircleSlash } from "lucide-react";
import { cn } from "../lib/utils";
import type {
  ConversationEvent,
  ConversationGraphNode,
  SuggestionState,
} from "../../types/conversationEvents";
import {
  buildConversationGraph,
  questionConfidence,
  responseReason,
  suggestionQuery,
  suggestionState,
} from "../../helpers/conversationGraph";
import { buildSearchUrl, validateSearchUrl } from "../../helpers/conversationAide";

function stateBadgeClass(state: SuggestionState): string {
  switch (state) {
    case "opened":
      return "border-b border-border text-foreground";
    case "dismissed":
      return "bg-foreground/8 text-foreground/40";
    case "expired":
      return "text-muted-foreground/50 line-through";
    default:
      return "text-foreground/70";
  }
}

function graphOutcome(reason: string | null): "answered" | "uncertain" | "silence" | "open" {
  if (reason === "answered") return "answered";
  if (reason === "uncertain_response") return "uncertain";
  if (reason === "silence") return "silence";
  return "open";
}

interface ConversationGraphProps {
  events: ConversationEvent[];
  searchBaseUrl: string;
  onReload: () => void;
}

export default function ConversationGraph({
  events,
  searchBaseUrl,
  onReload,
}: ConversationGraphProps) {
  const { t } = useTranslation();
  const nodes: ConversationGraphNode[] = buildConversationGraph(events);

  const handleSearch = useCallback(
    async (suggestion: ConversationEvent) => {
      const query = suggestionQuery(suggestion);
      if (!query) return;
      try {
        const url = buildSearchUrl(query, searchBaseUrl);
        if (!validateSearchUrl(url, searchBaseUrl)) return;
        const result = await window.electronAPI?.openExternal?.(url);
        if (result && result.success === false) return;
        await window.electronAPI?.updateConversationSuggestionState?.(suggestion.id, "opened");
        onReload();
      } catch {
        // Fail closed: an invalid base URL or blocked scheme simply does nothing.
      }
    },
    [searchBaseUrl, onReload]
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <MessageCircle size={28} className="mx-auto mb-3 text-foreground/20" />
          <p className="text-sm text-foreground/50">{t("notes.conversationGraph.emptyTitle")}</p>
          <p className="mt-1 text-xs text-foreground/35">
            {t("notes.conversationGraph.emptyDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-medium text-foreground/70">
          {t("notes.conversationGraph.title")}
        </h3>
        <span className="text-xs text-foreground/35">
          {t("notes.conversationGraph.questionCount", { count: nodes.length })}
        </span>
      </div>
      <ol className="flex flex-col gap-3">
        {nodes.map((node) => (
          <ConversationGraphNodeCard
            key={node.key}
            node={node}
            onSearch={handleSearch}
            searchBaseUrl={searchBaseUrl}
          />
        ))}
      </ol>
    </div>
  );
}

function ConversationGraphNodeCard({
  node,
  onSearch,
  searchBaseUrl,
}: {
  node: ConversationGraphNode;
  onSearch: (event: ConversationEvent) => void;
  searchBaseUrl: string;
}) {
  const { t } = useTranslation();
  const confidence: number | null = questionConfidence(node.question);
  const reason: string | null = responseReason(node.response);
  const state: SuggestionState | null = suggestionState(node.suggestion);
  const query: string | null = suggestionQuery(node.suggestion);
  const responseText = node.response?.text?.trim();
  const outcome = graphOutcome(reason);

  let searchable = false;
  if (query) {
    try {
      const url = buildSearchUrl(query, searchBaseUrl);
      searchable = validateSearchUrl(url, searchBaseUrl);
    } catch {
      searchable = false;
    }
  }

  return (
    <li
      className={cn(
        "graph-node rounded-lg border border-border bg-surface-0",
        `graph-node--${outcome}`
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <span
          className="graph-node__mark oats-dither mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--graph-state)]"
          aria-hidden="true"
        >
          <HelpCircle size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm leading-snug text-foreground">
            {node.question?.text?.trim() || t("notes.conversationGraph.unknownQuestion")}
          </p>
          {confidence != null && (
            <span className="mt-0.5 inline-block text-[11px] tabular-nums text-foreground/35">
              {t("notes.conversationGraph.confidence", {
                value: Math.round(confidence * 100),
              })}
            </span>
          )}
        </div>
      </div>

      <div className="ml-[1.4rem] border-l border-foreground/8 pl-3">
        <div className="flex items-start gap-2 py-1.5 pr-3">
          {responseText ? (
            <MessageCircle size={13} className="mt-0.5 shrink-0 text-foreground/35" />
          ) : (
            <CircleSlash size={13} className="mt-0.5 shrink-0 text-foreground/30" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug text-muted-foreground">
              {responseText || t("notes.conversationGraph.noResponse")}
            </p>
            {reason && (
              <span className="mt-0.5 inline-block text-[11px] text-foreground/35">
                {t(`notes.conversationGraph.reason.${reason}`, {
                  defaultValue: reason,
                })}
              </span>
            )}
          </div>
        </div>

        {node.suggestion && (
          <div className="flex items-center gap-2 border-t border-foreground/6 py-2 pr-3">
            <Search size={13} className="shrink-0 text-foreground/40" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-foreground/70" title={query ?? undefined}>
                {query || t("notes.conversationGraph.unknownQuery")}
              </p>
            </div>
            {state && (
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  stateBadgeClass(state)
                )}
              >
                {t(`notes.conversationGraph.state.${state}`)}
              </span>
            )}
            {searchable && (
              <button
                type="button"
                onClick={() => node.suggestion && onSearch(node.suggestion)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink size={11} />
                {t("notes.conversationGraph.search")}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
