const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Writing readiness and the summary queue enforce the effective route. A
// conversation that finished locally does not get sent when a key is added.

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
  // runSummary strikes only saved and the failures that end it (failed, too
  // long, cut at the answer limit): a refusal stays owed.
  const store = read("src/stores/summaryQueueStore.ts");
  assert.match(
    store,
    /if \(\s*outcome === "saved" \|\|\s*outcome === "failed" \|\|\s*outcome === "too-long" \|\|\s*outcome === "output-limit"\s*\) \{\s*settleSummary\(noteId\);/
  );
  // And the drain stops at a refusal rather than dropping the rest.
  assert.match(store, /if \(outcome === "refused" \|\| outcome === "cancelled"\) return;/);
});

test("adding a key does not send a summary owed on the local fallback or legacy keyless route", () => {
  const { queueMaySend, nextPendingSummary } = queue;
  for (const owed of ["local:", "providers:"]) {
    assert.equal(queueMaySend(owed, "providers:openai"), false);
    assert.equal(queueMaySend(owed, "providers:anthropic"), false);
    assert.equal(queueMaySend(owed, "providers:"), false);
    assert.equal(queueMaySend(owed, "local:"), true);
  }
  const list = [
    { id: 3, at: 300, route: "local:" },
    { id: 2, at: 200, route: "providers:" },
    { id: 1, at: 100, route: "providers:openai" },
  ];
  assert.equal(nextPendingSummary(list, { route: "providers:anthropic" }), null);
  assert.equal(nextPendingSummary(list, { route: "providers:openai" }), 1);
  assert.equal(nextPendingSummary(list, { route: "local:" }), 3);
  // Finish and record opening both record the effective route.
  const store = read("src/stores/summaryQueueStore.ts");
  assert.equal([...store.matchAll(/route: writingRouteKey\(\)/g)].length, 2);
  assert.match(store, /if \(busy\(\) \|\| stopped \|\| route !== writingRouteKey\(\)\) continue;/);
});
