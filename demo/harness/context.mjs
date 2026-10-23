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

// With `agent=1` the folder holds no incident report, so the question about
// the beta import is one the folder cannot answer and the agent is asked.
const AGENT_ONLY = new Set(["incidents/beta-import.md"]);

const buildIndex = (docs) => {
  const built = createContextIndex();
  for (const [docId, text] of docs)
    built.setDoc(docId, chunkDocument(text, { docId, title: docId }));
  return built;
};
const index = buildIndex(Object.entries(DOCS));
const folderIndex = buildIndex(Object.entries(DOCS).filter(([docId]) => !AGENT_ONLY.has(docId)));

const fileName = (docId) => docId.split("/").pop();

/** The passages for a question, in the shape `searchContext` returns. */
export function searchDemoContext(question, { agent = false } = {}) {
  return (agent ? folderIndex : index)
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

export const folderStatus = ({ agent = false } = {}) => ({
  folder: CONTEXT_FOLDER,
  files: Object.keys(DOCS).length - (agent ? AGENT_ONLY.size : 0),
  passages: (agent ? folderIndex : index).size,
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

// What the user's Claude Code would answer (`agent=1`): it reads the team's
// Linear and finds the incident ticket. Fictional workspace, fictional ticket.
const AGENT_ANSWERS = [
  {
    asks: /lose data/i,
    sources: ["Linear"],
    verdict: {
      verdict: "answer",
      answer: "No. All 14 accounts were replayed by October 9",
      quote: "All 14 affected beta accounts were replayed from the original files.",
      source: {
        title: "PEL-118 Beta import replay",
        url: "https://linear.app/pellwood/issue/PEL-118",
      },
    },
  },
];

/** The agent's run for a question, or null when it would find nothing. */
export function demoAgentAnswer(question) {
  return AGENT_ANSWERS.find((item) => item.asks.test(String(question || ""))) ?? null;
}
