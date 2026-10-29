// What the summary eval reads: the app's own summary prompt (extracted from the
// source, so the eval runs exactly what Finish sends), the conversations as the
// app would hand them to the writing model, and the AMI annotators' summaries
// with each speaker's role for the judge.
//
// AMI meeting corpus, manual annotations 1.6.2 (CC BY 4.0). Public data only:
// nothing here reads a person's own conversation.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { amiReference, annotationsDir, loadAmiWords, topicNames } from "./topic-corpus.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- The app's prompt, read from the source.

/** A file of the app at a git ref ("" for the working tree). */
function sourceAt(ref, file) {
  if (!ref) return fs.readFileSync(path.join(ROOT, file), "utf8");
  return execFileSync("git", ["show", `${ref}:${file}`], { cwd: ROOT, encoding: "utf8" });
}

/** The value of `const NAME = \`...\`;` in a source file: a template literal with no `${}`. */
function templateConstant(source, name) {
  const head = `const ${name} = \``;
  const start = source.indexOf(head);
  if (start < 0) throw new Error(`${name} not found`);
  let out = "";
  for (let i = start + head.length; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      const next = source[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      i += 1;
      continue;
    }
    if (ch === "`") return out;
    if (ch === "$" && source[i + 1] === "{") throw new Error(`${name} interpolates`);
    out += ch;
  }
  throw new Error(`${name} is not closed`);
}

/** The first double-quoted string literal after `marker` in a source file. */
function stringAfter(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${marker} not found`);
  const match = /"((?:[^"\\]|\\.)*)"/.exec(source.slice(at + marker.length));
  if (!match) throw new Error(`no string after ${marker}`);
  return JSON.parse(`"${match[1]}"`);
}

/**
 * The summary request Finish makes (`summarizeConversation` in OatsWorkspace.tsx,
 * `runBackgroundAction` in actionProcessingStore.ts) and the title request after
 * it (`generateNoteTitle`), at a git ref or in the working tree.
 *
 * system = MEETING_SYSTEM_PROMPT + the built-in action's prompt (seeded by
 * database.js) + no dictionary suffix (a fresh install has no dictionary).
 */
export function appSummaryPrompt(ref = "") {
  const store = sourceAt(ref, "src/stores/actionProcessingStore.ts");
  const database = sourceAt(ref, "src/helpers/database.js");
  const workspace = sourceAt(ref, "src/components/OatsWorkspace.tsx");
  const title = sourceAt(ref, "src/utils/generateTitle.ts");
  const meeting = templateConstant(store, "MEETING_SYSTEM_PROMPT");
  const action = stringAfter(
    database,
    '"Generate Notes",\n            "Clean up, structure, and enhance your notes",'
  );
  const userHead = /`(## Conversation [Tt]ranscript)\\n\$\{formatted\}`/.exec(workspace);
  if (!userHead) throw new Error("the transcript heading in summarizeConversation was not found");
  return {
    ref: ref || "working tree",
    system: meeting + action,
    userPrefix: `${userHead[1]}\n`,
    titleSystem: stringAfter(title, "const TITLE_SYSTEM_PROMPT ="),
  };
}

/**
 * A transcript as Finish formats it (`transcriptText`): each segment's text, a
 * blank line between. A room's segments carry no speaker label at Finish: the
 * speaker pass runs after it (`runInRoomSpeakerPass`), and `speakerLabelKind`
 * gives a segment of speaker "room" no label.
 */
export function finishTranscript(segments) {
  return segments
    .map((segment) => String(segment.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

// --- Conversations.

export const EVAL24 = [
  "ES2004a",
  "ES2004b",
  "ES2004c",
  "ES2004d",
  "IS1009a",
  "IS1009b",
  "IS1009c",
  "IS1009d",
  "TS3003a",
  "TS3003b",
  "TS3003c",
  "TS3003d",
  "ES2003b",
  "ES2007a",
  "ES2009c",
  "ES2012a",
  "ES2014c",
  "IB4010",
  "IS1002b",
  "IS1004d",
  "IS1007c",
  "TS3005a",
  "TS3007c",
  "TS3010a",
];
/** The meetings recorded with the far-field array, replayed through the room path (#122). */
export const FAR8 = [
  "ES2004a",
  "ES2004b",
  "ES2004c",
  "ES2004d",
  "IS1009a",
  "IS1009b",
  "TS3003a",
  "TS3003b",
];

/**
 * The inputs: `{ id, meeting, set, segments, minutes }`. `ref` is the manual
 * transcript cut at pauses as the room segmenter cuts (topic-corpus.mjs);
 * other sets are room-replay.js outputs (`--asr name=file`), what the app heard.
 */
export function loadInputs(ami, { sets = ["ref"], asr = {}, meetings = null } = {}) {
  const dir = annotationsDir(ami);
  const names = topicNames(dir);
  const inputs = [];
  for (const set of sets) {
    if (set === "ref") {
      for (const meeting of meetings ?? EVAL24) {
        if (meeting.includes("+")) {
          // A longer conversation: meetings back to back, for timing only (no summary to grade).
          const parts = loadInputs(ami, { sets: ["ref"], meetings: meeting.split("+") });
          inputs.push({
            id: `${meeting}.ref`,
            meeting,
            set,
            segments: parts.flatMap((part) => part.segments),
            minutes: parts.reduce((sum, part) => sum + part.minutes, 0),
            synthetic: true,
          });
          continue;
        }
        const conversation = amiReference(dir, meeting, names);
        const minutes = Math.max(...conversation.words.map((word) => word.end)) / 60;
        inputs.push({
          id: `${meeting}.ref`,
          meeting,
          set,
          segments: conversation.utterances.map((u) => ({
            text: u.text,
            start: u.start,
            end: u.end,
          })),
          minutes,
        });
      }
      continue;
    }
    const file = asr[set];
    if (!file) throw new Error(`--asr ${set}=<room-replay.json> is needed for set ${set}`);
    const replay = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const recording of replay.recordings) {
      const meeting = recording.summary.meeting;
      if (meetings && !meetings.includes(meeting)) continue;
      const segments = recording.segments
        .filter((segment) => String(segment.text ?? "").trim())
        .map((segment) => ({ text: segment.text.trim(), start: segment.start, end: segment.end }));
      const { words } = loadAmiWords(dir, meeting, names);
      inputs.push({
        id: `${meeting}.${set}`,
        meeting,
        set,
        segments,
        minutes: Math.max(...words.map((word) => word.end)) / 60,
      });
    }
  }
  return inputs;
}

// --- The annotators' summaries and the judge's transcript.

const ROLE_NAMES = {
  PM: "Project Manager",
  ME: "Marketing Expert",
  UI: "User Interface Designer",
  ID: "Industrial Designer",
};

function decode(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The abstractive summary of a meeting: `{ abstract, decisions, actions,
 * problems }`, each a list of `{ id, text }` (A1.., D1.., T1.., P1..). "NA"
 * entries (nothing of that kind) are dropped.
 */
export function humanSummary(ami, meeting) {
  const dir = annotationsDir(ami);
  const xml = fs.readFileSync(path.join(dir, "abstractive", `${meeting}.abssumm.xml`), "latin1");
  const out = {};
  for (const [section, prefix] of [
    ["abstract", "A"],
    ["decisions", "D"],
    ["actions", "T"],
    ["problems", "P"],
  ]) {
    const blocks = [
      ...xml.matchAll(new RegExp(`<${section}\\b[^>]*>([\\s\\S]*?)</${section}>`, "g")),
    ];
    const sentences = blocks
      .flatMap((block) => [...block[1].matchAll(/<sentence\b[^>]*>([\s\S]*?)<\/sentence>/g)])
      .map((match) => decode(match[1]))
      .filter((text) => text && !/^(NA|N\/A|none)\.?$/i.test(text));
    out[section] = sentences.map((text, index) => ({ id: `${prefix}${index + 1}`, text }));
  }
  return out;
}

/** Each speaker letter's role in a meeting (scenario meetings), from meetings.xml. */
export function speakerRoles(ami, meeting) {
  const dir = annotationsDir(ami);
  const xml = fs.readFileSync(path.join(dir, "corpusResources", "meetings.xml"), "latin1");
  const block = new RegExp(
    `<meeting\\b[^>]*observation="${meeting}"[^>]*>([\\s\\S]*?)</meeting>`
  ).exec(xml);
  const roles = {};
  if (!block) return roles;
  for (const match of block[1].matchAll(/<speaker\b([^>]*)\/?>/g)) {
    const agent = /nxt_agent="([A-Z])"/.exec(match[1])?.[1];
    const role = /role="([A-Z]+)"/.exec(match[1])?.[1];
    if (agent) roles[agent] = ROLE_NAMES[role] ?? role ?? "";
  }
  return roles;
}

/**
 * The manual transcript for the judge: speaker turns in time order, each
 * labelled with the speaker's letter and role. This is what was said, the
 * truth every summary is checked against, whatever transcript it was written from.
 */
export function judgeTranscript(ami, meeting) {
  const dir = annotationsDir(ami);
  const { words } = loadAmiWords(dir, meeting, topicNames(dir));
  const roles = speakerRoles(ami, meeting);
  const turns = [];
  for (const word of words) {
    const last = turns.at(-1);
    if (last && last.speaker === word.speaker && word.start - last.end < 3) {
      last.words.push(word.text);
      last.end = Math.max(last.end, word.end);
    } else {
      turns.push({ speaker: word.speaker, end: word.end, words: [word.text] });
    }
  }
  const legend = Object.entries(roles)
    .filter(([, role]) => role)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, role]) => `${letter} = ${role}`)
    .join(", ");
  const lines = turns.map((turn) => `${turn.speaker}: ${turn.words.join(" ")}`).join("\n");
  return legend ? `(Speakers: ${legend}.)\n${lines}` : lines;
}
