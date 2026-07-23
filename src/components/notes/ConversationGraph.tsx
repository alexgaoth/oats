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
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "dismissed":
      return "bg-foreground/8 text-foreground/40";
    case "expired":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    default:
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
  }
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
    <li className="rounded-lg border border-foreground/8 bg-foreground/2 dark:bg-white/2">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <HelpCircle size={14} className="mt-0.5 shrink-0 text-blue-500/70" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-foreground/85">
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
            <p className="text-[13px] leading-snug text-foreground/60">
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
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground/5 px-2 py-1 text-[11px] font-medium text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground/80 dark:bg-white/5 dark:hover:bg-white/10"
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
