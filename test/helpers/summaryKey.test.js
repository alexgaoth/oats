const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// "Titles and summaries wait for an API key": with "With an API key" and no key
// for the writing provider, Finish and the summary queue wait for the key
// instead of failing, and a conversation finished then goes to the provider
// whose key the person adds (stores/summaryQueueStore.ts,
// helpers/summaryQueue.mjs, hooks/useSummaryReadiness.ts).

const ROOT = path.join(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

let queue;
test.before(async () => {
  queue = await import("../../src/helpers/summaryQueue.mjs");
});

test("one readiness check, with the provider's key, for Finish, the queue and the model's other users", () => {
  const hook = read("src/hooks/useSummaryReadiness.ts");
  const now = hook.slice(hook.indexOf("export async function summaryReadinessNow("));
  assert.match(
    now.slice(0, 700),
    /providerKey:\s*formatting\.mode === "providers" \? writingKeyPresent\(state, formatting\.provider\) : null,/
  );
  // Finish, the context check and the topic names ask writingModelReady.
  const sort = read("src/stores/conversationGroupSortStore.ts");
  const ready = sort.slice(sort.indexOf("export async function writingModelReady("));
  assert.match(ready.slice(0, 400), /const verdict = await summaryReadinessNow\(\);/);
  assert.match(read("src/components/OatsWorkspace.tsx"), /if \(await writingModelReady\(\)\) \{/);
  // The queue asks the same, and waits while it is not ready.
  const store = read("src/stores/summaryQueueStore.ts");
  assert.match(store, /return \(await summaryReadinessNow\(\)\) === "ready";/);
  assert.match(store, /if \(!\(await readyNow\(\)\)\) return;/);
  // Saving the key makes the readiness "ready", which starts the list.
  assert.match(
    store,
    /const \{ readiness \} = useSummaryReadinessState\(\);[\s\S]{0,200}if \(readiness !== "ready"\) return;[\s\S]{0,300}kickSummaryQueue\(\);/
  );
  // Nothing computes the readiness without the key any more.
  for (const file of [
    "src/stores/conversationGroupSortStore.ts",
    "src/stores/summaryQueueStore.ts",
  ]) {
    assert.doesNotMatch(read(file), /summaryReadiness\(\{/, file);
  }
});

test("a missing key is a refusal: never retried, never a failure that strikes it from the list", () => {
  const actions = read("src/stores/actionProcessingStore.ts");
  const missing = actions.indexOf('?.code === "API_KEY_MISSING"');
  const retry = actions.indexOf("shouldRetrySummary(tries, tookMs)");
  assert.ok(missing > -1 && retry > missing, "checked before the second try");
  assert.match(
    actions.slice(missing, missing + 400),
    /processingFlags\.set\(noteId, false\);\s*clearNoteState\(noteId\);[\s\S]{0,120}return "refused";/
  );
  // runSummary strikes only saved, failed and too long: a refusal stays owed.
  const store = read("src/stores/summaryQueueStore.ts");
  assert.match(
    store,
    /if \(outcome === "saved" \|\| outcome === "failed" \|\| outcome === "too-long"\) \{\s*settleSummary\(noteId\);/
  );
  // And the drain stops at a refusal rather than dropping the rest.
  assert.match(store, /if \(outcome === "refused" \|\| outcome === "cancelled"\) return;/);
});

test("finished with no key, a conversation goes to the provider whose key is added", () => {
  const { KEYLESS_ROUTE, queueMaySend, nextPendingSummary } = queue;
  assert.equal(KEYLESS_ROUTE, "providers:");
  assert.equal(queueMaySend(KEYLESS_ROUTE, "providers:openai"), true);
  assert.equal(queueMaySend(KEYLESS_ROUTE, "providers:anthropic"), true);
  // Still no key: nothing to send to.
  assert.equal(queueMaySend(KEYLESS_ROUTE, KEYLESS_ROUTE), false);
  assert.equal(queueMaySend(KEYLESS_ROUTE, ""), false);
  // This Mac or the person's own server, as for any owed conversation.
  assert.equal(queueMaySend(KEYLESS_ROUTE, "local:"), true);
  // A provider that had its key keeps the rule: one chosen since gets nothing unasked.
  assert.equal(queueMaySend("providers:openai", "providers:anthropic"), false);
  const list = [
    { id: 2, at: 200, route: "providers:openai" },
    { id: 1, at: 100, route: KEYLESS_ROUTE },
  ];
  assert.equal(nextPendingSummary(list, { route: "providers:anthropic" }), 1);
  // The route recorded at Finish, and when a record asks for one, says so.
  const store = read("src/stores/summaryQueueStore.ts");
  assert.match(
    store,
    /const keyless =\s*formatting\.mode === "providers" && writingKeyPresent\(state, formatting\.provider\) === false;/
  );
  assert.equal([...store.matchAll(/route: owedRouteKey\(\)/g)].length, 2);
});
