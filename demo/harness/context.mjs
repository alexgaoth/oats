// The team folder a demo's context check reads (`check=1`), and the stand-in
// for the writing model that judges it.
//
// The folder is three documents the launch review's team would keep. They
// are ranked by the app's own index (src/helpers/contextIndex.mjs), so the
// demo finds passages the way the app does. The judge knows what the three
// questions this sample leaves open ("I don't know") are answered by, and says
// so in the JSON a model is asked for; anything else is "unclear".

import {
  chunkDocument,
  createContextIndex,
  isStrongMatch,
} from "../../src/helpers/contextIndex.mjs";

/** Where the folder seems to be, for Settings. */
export const CONTEXT_FOLDER = "/Users/demo/Pellwood/team-docs";

const DOCS = {
  "audit/soc2-plan.md": `# SOC 2 audit

## Auditor dates

Fieldwork with the auditors starts on November 10. The draft report is due on December 15.

## Evidence

Six months of evidence, May through October. Access reviews are the open item.`,
  "migration/runbook.md": `# Pellwood migration runbook

## Batches

Tenants move fifty at a time, so a failure stops fifty, not the whole migration.

## Timing

The last dry run took six hours end to end on production-sized data. Plan for one working day.`,
  "incidents/beta-import.md": `# Beta import incident

## Impact

No beta account lost data for good. Every partial import was replayed from the original file by October 9.`,
};

const index = createContextIndex();
for (const [docId, text] of Object.entries(DOCS)) {
  index.setDoc(docId, chunkDocument(text, { docId, title: docId }));
}

const fileName = (docId) => docId.split("/").pop();

/** The passages for a question, in the shape `searchContext` returns. */
export function searchDemoContext(question) {
  return index
    .search(String(question || ""), 8)
    .filter(isStrongMatch)
    .slice(0, 4)
    .map(({ passage }) => {
      const label = passage.heading
        ? `${fileName(passage.docId)}, ${passage.heading}`
        : fileName(passage.docId);
      return {
        id: passage.id,
        label,
        text: passage.text,
        source: { kind: "file", path: passage.docId, heading: passage.heading, label },
      };
    });
}

export const folderStatus = () => ({
  folder: CONTEXT_FOLDER,
  files: Object.keys(DOCS).length,
  passages: index.size,
  indexing: false,
  truncated: false,
  error: null,
});

// What a model reading the passages would answer, for the questions this
// sample leaves open.
const VERDICTS = [
  {
    asks: /auditors/i,
    verdict: "answer",
    answer: "Fieldwork starts November 10",
    quote: "Fieldwork with the auditors starts on November 10",
  },
  {
    asks: /migration take/i,
    verdict: "answer",
    answer: "About six hours end to end",
    quote: "took six hours end to end",
  },
  {
    asks: /lose data/i,
    verdict: "answer",
    answer: "No, every partial import was replayed",
    quote: "No beta account lost data for good",
  },
];

const UNCLEAR = JSON.stringify({ verdict: "unclear", answer: "", note: 0, quote: "" });

/** The judge's reply to a context check prompt (contextCheck.mjs). */
export function judgeDemoCheck(prompt) {
  const question = /Question asked in the meeting:\n"([^"]*)"/.exec(prompt)?.[1] ?? "";
  const known = VERDICTS.find((item) => item.asks.test(question));
  if (!known) return UNCLEAR;
  const note = [...prompt.matchAll(/^\[(\d+)\] [^\n]*$/gm)].find(([line]) =>
    line.includes(known.quote)
  );
  if (!note) return UNCLEAR;
  return JSON.stringify({
    verdict: known.verdict,
    answer: known.answer,
    note: Number(note[1]),
    quote: known.quote,
  });
}
