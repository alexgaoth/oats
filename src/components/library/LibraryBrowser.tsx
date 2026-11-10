import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Bookmark, Check, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Toggle } from "../ui/toggle";
import { groupDisplayName, useConversationGroups } from "../../stores/conversationGroupStore";
import { ledgerDate } from "../../helpers/ledgerDate.mjs";
import type {
  LibraryConversation,
  LibraryCriteria,
  SavedLibraryView,
} from "../../types/conversationLibrary";
import { LibraryError } from "./LibraryError";
import { useLibraryTools } from "./libraryContext";

type PageOptions = LibraryCriteria & { subject?: string; conversationIds?: number[] };

/** A changed query invalidates both an in-flight page and its load-more cursor. */
function useLibraryPage(options: PageOptions) {
  const { revision } = useLibraryTools();
  const key = JSON.stringify(options);
  const ticket = useRef(0);
  const [attempt, retry] = useState(0);
  const [page, setPage] = useState<{
    key: string;
    items: LibraryConversation[];
    cursor: number | null;
    pending: boolean;
    failed: boolean;
  }>({ key, items: [], cursor: null, pending: true, failed: false });
  useEffect(() => {
    const current = ++ticket.current;
    setPage({ key, items: [], cursor: null, pending: true, failed: false });
    const timer = window.setTimeout(() => {
      void window.electronAPI
        .listLibraryConversations({ ...JSON.parse(key), limit: 30 })
        .then((result) => {
          if (current === ticket.current)
            setPage({ key, ...result, pending: false, failed: false });
        })
        .catch(() => {
          if (current === ticket.current)
            setPage({ key, items: [], cursor: null, pending: false, failed: true });
        });
    }, 150);
    return () => {
      ticket.current += 1;
      clearTimeout(timer);
    };
  }, [key, revision, attempt]);
  const loadMore = () => {
    if (page.pending || page.cursor === null || page.key !== key) return;
    const current = ticket.current;
    setPage((held) => ({ ...held, pending: true, failed: false }));
    void window.electronAPI
      .listLibraryConversations({ ...JSON.parse(key), limit: 30, cursor: page.cursor })
      .then((result) => {
        if (current !== ticket.current) return;
        setPage((held) => {
          const seen = new Set(held.items.map((item) => item.id));
          return {
            key,
            items: [...held.items, ...result.items.filter((item) => !seen.has(item.id))],
            cursor: result.cursor,
            pending: false,
            failed: false,
          };
        });
      })
      .catch(() => {
        if (current === ticket.current)
          setPage((held) => ({ ...held, pending: false, failed: true }));
      });
  };
  return {
    ...(page.key === key ? page : { items: [], cursor: null, pending: true, failed: false }),
    loadMore,
    retry: () => retry((value) => value + 1),
  };
}

export function LibraryRows({
  options,
  choose,
  chosen = [],
}: {
  options: PageOptions;
  choose?: (item: LibraryConversation) => void;
  chosen?: number[];
}) {
  const { t, i18n } = useTranslation();
  const tools = useLibraryTools();
  const page = useLibraryPage(options);
  return (
    <div className="min-w-0 space-y-3">
      {page.failed && <LibraryError retry={page.retry} />}
      {page.pending && !page.items.length && (
        <div role="status" className="space-y-3 py-3">
          <p className="text-[13px] text-muted-foreground">{t("oats.library.loading")}</p>
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              aria-hidden="true"
              className="h-12 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      )}
      {!page.pending && !page.failed && !page.items.length && (
        <p className="py-6 text-sm text-muted-foreground">{t("oats.library.noMatches")}</p>
      )}
      <ul className="divide-y divide-border">
        {page.items.map((item) => (
          <li key={item.id}>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 whitespace-normal rounded-md px-3 py-3 text-left"
              aria-pressed={choose ? chosen.includes(item.id) : undefined}
              onClick={() =>
                choose ? choose(item) : void tools.openSource(item.id, item.excerpt?.segmentId)
              }
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">{item.title || t("oats.untitled")}</span>
                  <time className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                    {ledgerDate(item.created_at, { locale: i18n.language })}
                  </time>
                </div>
                {item.excerpt?.text && (
                  <p className="line-clamp-3 text-[13px] font-normal leading-5 text-muted-foreground">
                    {item.excerpt.text}
                  </p>
                )}
                {!item.excerpt?.text && item.topics.length > 0 && (
                  <p className="line-clamp-2 text-[13px] font-normal text-muted-foreground">
                    {item.topics.map((topic) => topic.label).join(", ")}
                  </p>
                )}
              </div>
              {choose ? (
                chosen.includes(item.id) && (
                  <Check aria-hidden="true" className="size-4 text-brand-ink" />
                )
              ) : (
                <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
            </Button>
          </li>
        ))}
      </ul>
      {page.cursor !== null && (
        <Button variant="outline" size="sm" disabled={page.pending} onClick={page.loadMore}>
          {t(page.pending ? "oats.library.loading" : "oats.library.more")}
        </Button>
      )}
    </div>
  );
}

export function SubjectHistory({
  label,
  conversationIds,
}: {
  label: string;
  conversationIds: number[];
}) {
  return <LibraryRows options={{ subject: label, conversationIds }} />;
}

export function LibraryFilters({ query }: { query: string }) {
  const { t } = useTranslation();
  const { criteria, setCriteria, show } = useLibraryTools();
  const { groups } = useConversationGroups();
  if (criteria === null) return null;
  const update = (next: Partial<LibraryCriteria>) =>
    setCriteria(
      Object.fromEntries(
        Object.entries({ ...criteria, ...next }).filter(([, value]) => value !== undefined)
      )
    );
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={
            criteria.groupId === undefined
              ? "all"
              : criteria.groupId === null
                ? "unfiled"
                : String(criteria.groupId)
          }
          onValueChange={(value) =>
            update({
              groupId: value === "all" ? undefined : value === "unfiled" ? null : Number(value),
            })
          }
        >
          <SelectTrigger className="h-8 w-40" aria-label={t("oats.library.group")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("oats.library.allGroups")}</SelectItem>
            <SelectItem value="unfiled">{t("oats.library.unfiled")}</SelectItem>
            {criteria.groupId != null && !groups.some((group) => group.id === criteria.groupId) && (
              <SelectItem value={String(criteria.groupId)}>
                {t("oats.library.missingGroup")}
              </SelectItem>
            )}
            {groups.map((group) => (
              <SelectItem key={group.id} value={String(group.id)}>
                {groupDisplayName(group, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-[13px]">
          <Toggle
            aria-label={t("oats.library.markedOnly")}
            checked={Boolean(criteria.markedOnly)}
            onChange={(checked) => update({ markedOnly: checked })}
          />
          {t("oats.library.markedOnly")}
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Toggle
            aria-label={t("oats.library.openOnly")}
            checked={Boolean(criteria.openQuestionsOnly)}
            onChange={(checked) => update({ openQuestionsOnly: checked })}
          />
          {t("oats.library.openOnly")}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted-foreground">{t("oats.library.literalCriteria")}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) =>
            show({ kind: "views", criteria: { ...criteria, query } }, event.currentTarget)
          }
        >
          <Bookmark aria-hidden="true" />
          {t("oats.library.saveView")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCriteria(null)}>
          <X aria-hidden="true" />
          {t("oats.library.clearFilters")}
        </Button>
      </div>
    </div>
  );
}

export function LibraryFilteredResults({ query }: { query: string }) {
  const { criteria } = useLibraryTools();
  return (
    <div className="mt-3 rounded-xl border border-border">
      <LibraryRows options={{ ...criteria, query }} />
    </div>
  );
}

function CriteriaSummary({ criteria }: { criteria: LibraryCriteria }) {
  const { t } = useTranslation();
  const { groups } = useConversationGroups();
  const group = groups.find((item) => item.id === criteria.groupId);
  const labels = [
    criteria.query && t("oats.library.queryCriteria", { query: criteria.query }),
    criteria.groupId !== undefined &&
      (criteria.groupId === null
        ? t("oats.library.unfiled")
        : group
          ? groupDisplayName(group, t)
          : t("oats.library.missingGroup")),
    criteria.markedOnly && t("oats.library.markedOnly"),
    criteria.openQuestionsOnly && t("oats.library.openOnly"),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.length ? (
        labels.map((label, index) => (
          <Badge key={index} variant="outline" className="whitespace-normal text-left font-normal">
            {label}
          </Badge>
        ))
      ) : (
        <span className="text-[13px] text-muted-foreground">
          {t("oats.library.allConversations")}
        </span>
      )}
    </div>
  );
}

export function SavedViews({ current }: { current: LibraryCriteria }) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  const [views, setViews] = useState<SavedLibraryView[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void window.electronAPI
      .listSavedViews()
      .then((result) => {
        if (active) {
          setViews(result);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [tools.revision, retry]);
  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await window.electronAPI.saveLibraryView({ name, criteria: current });
      setName("");
      setRetry((value) => value + 1);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <CriteriaSummary criteria={current} />
        <div className="space-y-2">
          <label htmlFor="library-view-name" className="text-[13px] font-medium">
            {t("oats.library.viewName")}
          </label>
          <div className="flex gap-2">
            <Input
              id="library-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
            <Button disabled={busy || !name.trim()} type="submit">
              {t("oats.library.saveView")}
            </Button>
          </div>
        </div>
      </form>
      {failed && <LibraryError retry={() => setRetry((value) => value + 1)} />}
      {views === null && !failed && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {t("oats.library.loading")}
        </p>
      )}
      {views?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("oats.library.noViews")}</p>
      )}
      <ul className="divide-y divide-border">
        {views?.map((view) => (
          <li key={view.id} className="flex items-start gap-2 py-3">
            <Button
              variant="ghost"
              className="h-auto min-w-0 flex-1 flex-col items-start gap-2 whitespace-normal px-2 text-left"
              onClick={() => {
                tools.setCriteria(view.criteria);
                window.dispatchEvent(
                  new CustomEvent("oats-library-view", { detail: view.criteria })
                );
                tools.close();
              }}
            >
              <span className="text-sm font-medium">{view.name}</span>
              <CriteriaSummary criteria={view.criteria} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={t("oats.library.deleteNamed", { name: view.name })}
              onClick={() => {
                if (confirm !== view.id) {
                  setConfirm(view.id);
                  return;
                }
                setBusy(true);
                void window.electronAPI
                  .deleteLibraryView(view.id)
                  .then(() => {
                    setConfirm(null);
                    setRetry((value) => value + 1);
                  })
                  .catch(() => setFailed(true))
                  .finally(() => setBusy(false));
              }}
            >
              <Trash2 aria-hidden="true" />
              {confirm === view.id && t("oats.library.confirmDelete")}
            </Button>
            {confirm === view.id && (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
