import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { WorkingPassage, WorkingSet, WorkingSetDetail } from "../../types/conversationLibrary";
import { LibraryError } from "./LibraryError";
import { useLibraryTools } from "./libraryContext";
import type { PassageSource } from "./libraryContext";

export function WorkingSets({ source }: { source?: PassageSource }) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  const [sets, setSets] = useState<WorkingSet[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<WorkingSetDetail | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const refreshNow = () => {
    setFailed(false);
    setRefresh((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    void window.electronAPI
      .getWorkingSets()
      .then((result) => {
        if (!active) return;
        setSets(result);
        setSelected((id) => (result.some((set) => set.id === id) ? id : (result[0]?.id ?? null)));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [tools.revision, refresh]);
  useEffect(() => {
    let active = true;
    setDetail((held) => (held?.id === selected ? held : null));
    if (selected !== null) {
      void window.electronAPI
        .getWorkingSet(selected)
        .then((result) => {
          if (active) setDetail(result);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }
    return () => {
      active = false;
    };
  }, [selected, tools.revision, refresh]);
  useEffect(() => {
    setDeleting(false);
    setRenaming(false);
  }, [selected]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      refreshNow();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    act(async () => {
      const set = await window.electronAPI.createWorkingSet(name);
      setSelected(set.id);
      setName("");
      if (source) {
        await window.electronAPI.addWorkingSetPassage(set.id, source);
        setSavedTo((ids) => [...ids, set.id]);
      }
      setCreating(false);
    });
  const selectedSet = sets?.find((set) => set.id === selected);
  const showCreate = creating || sets?.length === 0;
  return (
    <div className="space-y-4">
      {failed && <LibraryError retry={refreshNow} />}
      {showCreate ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label htmlFor="working-set-name" className="text-[13px] font-medium">
            {t("oats.library.newSet")}
          </label>
          <div className="flex gap-2">
            <Input
              id="working-set-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
            <Button disabled={busy || !name.trim()} type="submit">
              <Plus aria-hidden="true" />
              {t(source ? "oats.library.createAndSave" : "oats.library.create")}
            </Button>
            {Boolean(sets?.length) && (
              <Button variant="ghost" onClick={() => setCreating(false)}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>
      ) : (
        sets && (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {t("oats.library.newSet")}
          </Button>
        )
      )}
      {sets === null && !failed && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {t("oats.library.loading")}
        </p>
      )}
      {sets?.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">{t("oats.library.noSets")}</p>
      )}
      {Boolean(sets?.length) && (
        <div className="space-y-2">
          <label className="block text-[13px] font-medium" id="working-set-label">
            {t("oats.library.workingSet")}
          </label>
          <div className="flex items-center gap-2">
            <Select
              value={selected === null ? undefined : String(selected)}
              onValueChange={(id) => setSelected(Number(id))}
            >
              <SelectTrigger aria-labelledby="working-set-label" className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sets?.map((set) => (
                  <SelectItem key={set.id} value={String(set.id)}>
                    {set.name} ({set.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source && selected !== null && !showCreate && (
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const id = selected;
                    await window.electronAPI.addWorkingSetPassage(id, source);
                    setSavedTo((ids) => [...new Set([...ids, id])]);
                  })
                }
              >
                {t("oats.library.addToSet")}
              </Button>
            )}
          </div>
        </div>
      )}
      {savedTo.length > 0 && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Check aria-hidden="true" className="size-4" />
          {t("oats.library.passageSaved")}
        </p>
      )}
      {selectedSet && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {renaming ? (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const id = selectedSet.id;
                void act(async () => {
                  await window.electronAPI.renameWorkingSet(id, rename);
                  setRenaming(false);
                });
              }}
            >
              <Input
                autoFocus
                aria-label={t("oats.library.setName")}
                value={rename}
                onChange={(event) => setRename(event.target.value)}
                maxLength={80}
                required
              />
              <Button variant="outline" size="sm" type="submit" disabled={busy || !rename.trim()}>
                {t("common.save")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                {t("common.cancel")}
              </Button>
            </form>
          ) : (
            <>
              <h2 className="min-w-0 flex-1 break-words text-base font-semibold">
                {selectedSet.name}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRename(selectedSet.name);
                  setRenaming(true);
                }}
              >
                {t("oats.library.rename")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!deleting) {
                    setDeleting(true);
                    return;
                  }
                  void act(() => window.electronAPI.deleteWorkingSet(selectedSet.id));
                }}
              >
                <Trash2 aria-hidden="true" />
                {t(deleting ? "oats.library.confirmDelete" : "oats.library.deleteSet")}
              </Button>
              {deleting && (
                <Button variant="ghost" size="sm" onClick={() => setDeleting(false)}>
                  {t("common.cancel")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {deleting && (
        <p className="text-[13px] text-muted-foreground">{t("oats.library.deleteSetHint")}</p>
      )}
      {selected !== null && !detail && !failed && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {t("oats.library.loading")}
        </p>
      )}
      {detail?.passages.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">{t("oats.library.emptySet")}</p>
      )}
      <ol className="divide-y divide-border">
        {detail?.passages.map((passage, index) => (
          <PassageRow
            key={`${detail.id}:${passage.id}`}
            passage={passage}
            index={index}
            total={detail.passages.length}
            busy={busy}
            update={(update) =>
              act(() => window.electronAPI.updateWorkingSetPassage(detail.id, passage.id, update))
            }
            remove={() =>
              act(() => window.electronAPI.removeWorkingSetPassage(detail.id, passage.id))
            }
          />
        ))}
      </ol>
    </div>
  );
}

function PassageRow({
  passage,
  index,
  total,
  busy,
  update,
  remove,
}: {
  passage: WorkingPassage;
  index: number;
  total: number;
  busy: boolean;
  update: (update: { note?: string; position?: number }) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  const [note, setNote] = useState(passage.note);
  const [removing, setRemoving] = useState(false);
  useEffect(() => setNote(passage.note), [passage.note]);
  return (
    <li className="space-y-3 py-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{passage.title || t("oats.untitled")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || index === 0}
          aria-label={t("oats.library.moveUp")}
          onClick={() => void update({ position: index - 1 })}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || index === total - 1}
          aria-label={t("oats.library.moveDown")}
          onClick={() => void update({ position: index + 1 })}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      </div>
      {passage.sourceStatus === "available" && (
        <blockquote className="whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-[15px] leading-7">
          {passage.quote}
        </blockquote>
      )}
      {passage.sourceStatus !== "available" && (
        <p className="text-[13px] text-muted-foreground">
          {t(
            passage.sourceStatus === "changed"
              ? "oats.library.sourceChanged"
              : "oats.library.sourceMissing"
          )}
        </p>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void update({ note });
        }}
      >
        <label htmlFor={`passage-note-${passage.id}`} className="text-[13px] text-muted-foreground">
          {t("oats.library.personalNote")}
        </label>
        <div className="flex gap-2">
          <Input
            id={`passage-note-${passage.id}`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
          {note !== passage.note && (
            <Button variant="outline" size="sm" type="submit" disabled={busy}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={passage.sourceStatus === "missing" && !passage.title}
          onClick={() =>
            void tools.openSource(
              passage.noteId,
              passage.sourceStatus === "missing" ? null : passage.segmentId
            )
          }
        >
          <ArrowUpRight aria-hidden="true" />
          {t("oats.library.openSource")}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (!removing && (passage.note || note.trim())) {
                setRemoving(true);
                return;
              }
              void remove();
            }}
          >
            <Trash2 aria-hidden="true" />
            {t(removing ? "oats.library.confirmRemove" : "oats.library.remove")}
          </Button>
          {removing && (
            <Button variant="ghost" size="sm" onClick={() => setRemoving(false)}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
