import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Search, ExternalLink, CircleSlash } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { StateMark } from "../conversation/ConversationSignalRail";
import type {
  ConversationEvent,
  ConversationGraphNode,
  QuestionOutcome,
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

/** The verdict, in the same vocabulary the rail and the contour draw. */
function graphOutcome(reason: string | null): QuestionOutcome {
  if (reason === "answered") return "answered";
  if (reason === "denied_knowledge") return "denied";
  if (reason === "uncertain_response") return "uncertain";
  if (reason === "silence") return "silence";
  return "asked";
}

/** A search that was opened is the one state worth setting apart. */
function suggestionBadge(state: SuggestionState): "secondary" | "outline" {
  return state === "opened" ? "secondary" : "outline";
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
      <div className="mt-16 flex flex-col items-center px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <MessageCircle aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          {t("notes.conversationGraph.emptyTitle")}
        </p>
        <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">
          {t("notes.conversationGraph.emptyDescription")}
        </p>
      </div>
    );
  }

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-semibold text-foreground">
          {t("notes.conversationGraph.title")}
        </h3>
        <span className="text-[13px] text-muted-foreground">
          {t("notes.conversationGraph.questionCount", { count: nodes.length })}
        </span>
      </div>
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {nodes.map((node) => (
          <ConversationGraphNodeCard
            key={node.key}
            node={node}
            onSearch={handleSearch}
            searchBaseUrl={searchBaseUrl}
          />
        ))}
      </ol>
    </section>
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
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <StateMark state={outcome} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <p className="text-pretty text-sm font-medium leading-snug text-foreground">
            {node.question?.text?.trim() || t("notes.conversationGraph.unknownQuestion")}
          </p>
          {(reason || confidence != null) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {reason &&
                t(`notes.conversationGraph.reason.${reason}`, {
                  defaultValue: reason,
                })}
              {reason && confidence != null && <span aria-hidden="true"> · </span>}
              {confidence != null && (
                <span className="tabular-nums">
                  {t("notes.conversationGraph.confidence", {
                    value: Math.round(confidence * 100),
                  })}
                </span>
              )}
            </p>
          )}

          <div className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
            {responseText ? (
              <MessageCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <CircleSlash aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            )}
            <p className="min-w-0 flex-1">
              {responseText || t("notes.conversationGraph.noResponse")}
            </p>
          </div>

          {node.suggestion && (
            <div className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
              <Search aria-hidden="true" className="size-3.5 shrink-0" />
              <p className="min-w-0 flex-1 truncate" title={query ?? undefined}>
                {query || t("notes.conversationGraph.unknownQuery")}
              </p>
              {state && (
                <Badge variant={suggestionBadge(state)} className="shrink-0">
                  {t(`notes.conversationGraph.state.${state}`)}
                </Badge>
              )}
              {searchable && (
                // Outline, not the brand fill: one row per question means one
                // brand button per row, and a view gets one primary action.
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => node.suggestion && onSearch(node.suggestion)}
                  className="shrink-0"
                >
                  <ExternalLink aria-hidden="true" />
                  {t("notes.conversationGraph.search")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
