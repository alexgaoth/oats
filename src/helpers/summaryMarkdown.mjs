// How a conversation's summary is shown. The summary action asks its model for
// one format (`MEETING_SYSTEM_PROMPT` in `stores/actionProcessingStore.ts`): a
// sentence or two, then the sections below, with each action item as a task
// list item ("- [ ] Theo: …"). The reading view draws it with react-markdown
// (`components/ui/MarkdownRenderer.tsx`), and the lists show it as a two-line
// preview. Pure and DOM-free, so both are pinned by
// test/helpers/summaryMarkdown.test.js.

/**
 * The section headings the summary prompt asks for, in its order. Sentence
 * case (`DESIGN.md` §3): the prompt writes them this way, and the reading view
 * shows them this way whatever case the model used.
 */
export const SUMMARY_HEADINGS = Object.freeze([
  "Threads",
  "Key discussion points",
  "Decisions made",
  "Action items",
  "Follow-ups",
]);

const HEADING_BY_FOLDED = new Map(
  SUMMARY_HEADINGS.map((heading) => [heading.toLowerCase(), heading])
);

// "[ ]", "[x]" or "[X]", then the space before the item's words.
const TASK_MARKER = /^\[[ xX]\]\s+/;

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/**
 * A remark plugin: a task list item ("- [ ] …", "- [x] …") is shown as a
 * plain list item, without its marker.
 *
 * The renderer parses CommonMark, which has no task lists, so the marker
 * reached the page as the literal text "[ ]". A checkbox instead would be a
 * control that does nothing: the reading view cannot tick it, and an empty box
 * would still say "not done" after somebody did it. The heading already says
 * these are actions. The stored summary keeps its markers, so an exported note
 * (Obsidian, the markdown mirror) keeps a task list it can tick.
 *
 * @returns {(tree: object) => void}
 */
export function remarkPlainTaskItems() {
  return (tree) =>
    walk(tree, (node) => {
      if (node.type !== "listItem") return;
      const paragraph = node.children?.[0];
      const first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : null;
      if (first?.type !== "text") return;
      const marker = TASK_MARKER.exec(first.value);
      if (!marker) return;
      first.value = first.value.slice(marker[0].length);
      // "- [ ] **Theo**: …": the marker was a text node of its own.
      if (!first.value) paragraph.children.shift();
    });
}

/**
 * A remark plugin: a heading that is one of `SUMMARY_HEADINGS` in another case
 * is shown as the prompt writes it. Summaries written before the prompt asked
 * for sentence case say "Decisions Made" and "Action Items", and a small model
 * can still title-case a heading it was given in sentence case. Only a whole
 * heading matches: "Action Items for Q3" is left as written.
 *
 * @returns {(tree: object) => void}
 */
export function remarkSummaryHeadings() {
  return (tree) =>
    walk(tree, (node) => {
      if (node.type !== "heading" || node.children?.length !== 1) return;
      const [text] = node.children;
      if (text.type !== "text") return;
      const heading = HEADING_BY_FOLDED.get(text.value.trim().toLowerCase());
      if (heading) text.value = heading;
    });
}

/**
 * A summary as one run of plain text, for a two-line preview. The list is
 * scanning, not reading, so it is no place for "## Threads" or stray
 * asterisks: the syntax is stripped rather than rendered.
 *
 * A heading goes whole, not just its hashes. Stripping only the marker left the
 * heading's words in the run of prose — "only one of them closed. Threads
 * Enterprise pricing is…" — a sentence nobody wrote. A task marker goes too:
 * "[ ]" is markup, not words.
 *
 * @param {string | null | undefined} raw
 * @returns {string} "" when there is no summary.
 */
export function plainPreview(raw) {
  if (!raw) return "";
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s.*$/gm, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/^(\s*(?:\d+[.)]\s+)?)\[[ xX]\]\s+/gm, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
