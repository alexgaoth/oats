import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { comparisonEvidence, sharedTopicLabels } from "../../helpers/conversationComparison.mjs";
import { foldText } from "../../helpers/searchFold.mjs";
import { ledgerDate } from "../../helpers/ledgerDate.mjs";
import type { NoteItem } from "../../types/electron";
import type { ConversationEvent } from "../../types/conversationEvents";
import { LibraryRows } from "./LibraryBrowser";
import { LibraryError } from "./LibraryError";
import { useLibraryTools } from "./libraryContext";

type RecordEvidence = { note: NoteItem; events: ConversationEvent[] };

export function ConversationComparison({ firstId }: { firstId?: number }) {
  const { t } = useTranslation();
  const tools = useLibraryTools();
  const [selected, setSelected] = useState<number[]>(firstId === undefined ? [] : [firstId]);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(true);
  const [records, setRecords] = useState<RecordEvidence[]>([]);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const ids = selected.join(",");
  useEffect(() => {
    let active = true;
    setPending(true);
    setFailed(false);
    void Promise.all(
      (ids ? ids.split(",").map(Number) : []).map(async (id) => {
        const [note, events] = await Promise.all([
          window.electronAPI.getNote(id),
          window.electronAPI.listConversationEvents?.(id),
        ]);
        if (!note || note.deleted_at || !Array.isArray(events))
          throw new Error("Evidence unavailable");
        return { note, events };
      })
    )
      .then((result) => {
        if (active) {
          setRecords(result);
          setPending(false);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setRecords([]);
          setPending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ids, tools.revision, retry]);
  const evidence = records.map(({ note, events }) => comparisonEvidence(note, events));
  const shared =
    evidence.length === 2
      ? sharedTopicLabels(evidence[0].topics, evidence[1].topics)
      : new Set<string>();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <Button
            key={id}
            variant="outline"
            size="sm"
            className="max-w-full"
            onClick={() => {
              setSelected((held) => held.filter((item) => item !== id));
              setPicking(true);
            }}
            aria-label={t("oats.library.unselect", {
              title:
                records.find((record) => record.note.id === id)?.note.title || t("oats.untitled"),
            })}
          >
            <span className="truncate">
              {records.find((record) => record.note.id === id)?.note.title ||
                t("oats.library.loading")}
            </span>
            <X aria-hidden="true" />
          </Button>
        ))}
        {!picking && (
          <Button variant="ghost" size="sm" onClick={() => setPicking(true)}>
            {t("oats.library.changeSelection")}
          </Button>
        )}
      </div>
      {failed && <LibraryError retry={() => setRetry((value) => value + 1)} />}
      {picking ? (
        <>
          <div className="space-y-2">
            <label htmlFor="comparison-search" className="text-[13px] font-medium">
              {t("oats.library.chooseTwo")}
            </label>
            <Input
              id="comparison-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("oats.intelligence.searchPlaceholder")}
            />
          </div>
          <div className="max-h-[35dvh] overflow-y-auto">
            <LibraryRows
              options={{ query }}
              chosen={selected}
              choose={(item) =>
                setSelected((held) =>
                  held.includes(item.id)
                    ? held.filter((id) => id !== item.id)
                    : held.length < 2
                      ? [...held, item.id]
                      : held
                )
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={selected.length !== 2 || pending || failed}
              onClick={() => setPicking(false)}
            >
              {t("oats.library.compare")}
            </Button>
          </div>
        </>
      ) : pending ? (
        <p role="status" className="text-[13px] text-muted-foreground">
          {t("oats.library.loading")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {records.map((record, index) => (
            <ComparisonColumn
              key={record.note.id}
              record={record}
              evidence={evidence[index]}
              shared={shared}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ComparisonColumn({
  record,
  evidence,
  shared,
}: {
  record: RecordEvidence;
  evidence: ReturnType<typeof comparisonEvidence>;
  shared: Set<string>;
}) {
  const { t, i18n } = useTranslation();
  const tools = useLibraryTools();
  const { note } = record;
  return (
    <section className="min-w-0 space-y-5">
      <header className="space-y-2 border-b border-border pb-4">
        <h2 className="break-words text-base font-semibold">{note.title || t("oats.untitled")}</h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {ledgerDate(note.created_at, { locale: i18n.language })}
        </p>
        <Button variant="outline" size="sm" onClick={() => void tools.openSource(note.id)}>
          <ArrowUpRight aria-hidden="true" />
          {t("oats.library.openSource")}
        </Button>
      </header>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("oats.library.topics")}</h3>
        {evidence.topics.length ? (
          <ul className="flex flex-wrap gap-2">
            {evidence.topics.map((topic, index) => (
              <li key={index} className="space-y-1">
                <div className="flex flex-wrap items-center gap-1">
                  {topic.description ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto whitespace-normal py-1 text-left text-[13px]"
                        >
                          {topic.label}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="oats-surface max-h-64 w-72 overflow-y-auto p-3">
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-6">
                          {topic.description}
                        </p>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Badge variant="outline" className="whitespace-normal text-left font-normal">
                      {topic.label}
                    </Badge>
                  )}
                  {shared.has(foldText(topic.label)) && (
                    <Badge variant="outline" className="font-normal">
                      {t("oats.library.sameLabel")}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("oats.library.noTopics")}</p>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("oats.library.markedPassages")}</h3>
        {evidence.marks.length ? (
          <ul className="space-y-4">
            {evidence.marks.map((mark) => (
              <li key={mark.id} className="space-y-2">
                {mark.quote ? (
                  <blockquote className="whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-[13px] leading-6">
                    {mark.quote}
                  </blockquote>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {t("oats.library.sourceMissing")}
                  </p>
                )}
                {mark.note && (
                  <p className="break-words text-[13px] text-muted-foreground">{mark.note}</p>
                )}
                {mark.segmentId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void tools.openSource(note.id, mark.segmentId)}
                  >
                    {t("oats.library.openSource")}
                    <ArrowUpRight aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("oats.library.noMarks")}</p>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("oats.library.openQuestions")}</h3>
        {evidence.questions.length ? (
          <ul className="space-y-2">
            {evidence.questions.map((question) => (
              <li key={question.key}>
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-[13px] font-normal leading-6"
                  onClick={() => void tools.openSource(note.id, question.segmentId)}
                >
                  {question.question}
                  <ArrowUpRight aria-hidden="true" className="ml-auto shrink-0" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {t(
              evidence.questionsKnown
                ? "oats.library.noOpenQuestions"
                : "oats.library.questionsUnknown"
            )}
          </p>
        )}
      </div>
    </section>
  );
}
