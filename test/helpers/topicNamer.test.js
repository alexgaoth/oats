const test = require("node:test");
const assert = require("node:assert/strict");
const { createOneAtATime } = require("../../src/helpers/oneAtATime.js");

let TopicNamer;
let namerModule;

test.before(async () => {
  namerModule = await import("../../src/helpers/topicNamer.mjs");
  TopicNamer = namerModule.TopicNamer;
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A clock the test moves: timers run when it passes them, in order. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = next++;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        let due = null;
        for (const [id, timer] of timers) {
          if (timer.at <= until && (!due || timer.at < due[1].at)) due = [id, timer];
        }
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** A conversation the test grows: turns of a given number of words, on topics. */
function conversation() {
  const segments = [];
  const topics = new Map();
  let at = 0;
  return {
    segments,
    say(topicId, wordCount, { label = `topic ${topicId}` } = {}) {
      const id = `u${segments.length}`;
      const text = Array.from({ length: wordCount }, (_, index) => `${id}w${index}`).join(" ");
      segments.push({ id, text, timestamp: (at += 5000) });
      const topic = topics.get(topicId) ?? { id: topicId, label, utteranceIds: [], firstAt: at };
      topic.utteranceIds.push(id);
      topics.set(topicId, topic);
      return id;
    },
    snapshot(liveId = null) {
      return {
        nodes: [...topics.values()].map((topic) => ({
          id: topic.id,
          label: topic.label,
          words: [],
          durationMs: 60_000,
          utteranceIds: [...topic.utteranceIds],
          firstAt: topic.firstAt,
          lastAt: at,
          returns: 0,
          state: topic.id === liveId ? "live" : "open",
        })),
        edges: [],
      };
    },
  };
}

function setup(options = {}) {
  const clock = fakeClock();
  const asked = [];
  const answers = [];
  let changes = 0;
  const namer = new TopicNamer({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ask: (prompt) => {
      asked.push(prompt);
      const answer = answers.shift();
      if (answer === undefined) return deferred().promise;
      return typeof answer === "function" ? answer(prompt) : Promise.resolve(answer);
    },
    onChange: () => {
      changes += 1;
    },
    ...options,
  });
  return { clock, namer, asked, answers, changes: () => changes };
}

const labelOf = (namer, snapshot, id) => namer.apply(snapshot).nodes.find((node) => node.id === id);

test("a topic gets the model's name once it holds forty words and the room has settled", async () => {
  const { clock, namer, asked, answers, changes } = setup();
  const talk = conversation();
  talk.say(1, 30);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(30_000);
  assert.equal(asked.length, 0, "thirty words is not enough to name");

  talk.say(1, 15);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS - 100);
  assert.equal(asked.length, 0, "not while the room is still talking");
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "topic 1");
  await clock.tick(200);
  assert.equal(asked.length, 1);
  assert.match(asked[0].text, /^Other topics: none yet$/m);

  const shown = labelOf(namer, talk.snapshot(1), 1);
  assert.equal(shown.label, "Launch date move");
  assert.equal(shown.deviceLabel, "topic 1");
  assert.equal(changes(), 1, "the topics are published again once");
});

test("a request waits while turns keep landing, but never past the longest settle", async () => {
  const { clock, namer, asked, answers } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  for (let elapsed = 0; elapsed < namerModule.MAX_SETTLE_MS - 2000; elapsed += 2000) {
    await clock.tick(2000);
    talk.say(1, 3);
    namer.observe(talk.snapshot(1), talk.segments);
  }
  assert.equal(asked.length, 0);
  await clock.tick(2000);
  assert.equal(asked.length, 1, "asked at the longest settle, while turns still land");
});

test("one request at a time: the next waits for the answer", async () => {
  const { clock, namer, asked, answers } = setup();
  const talk = conversation();
  talk.say(1, 45);
  talk.say(2, 45);
  const first = deferred();
  answers.push(() => first.promise, "SSO login with SAML");
  namer.observe(talk.snapshot(2), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 1);
  assert.match(
    asked[0].text,
    new RegExp(`^- ${talk.segments[1].text.slice(0, 20)}`, "m"),
    "the live topic first"
  );

  talk.say(2, 5);
  namer.observe(talk.snapshot(2), talk.segments);
  await clock.tick(namerModule.NAME_TIMEOUT_MS - 1000);
  assert.equal(asked.length, 1, "nothing more while one is out");

  first.resolve("Launch date move");
  await flush();
  await clock.tick(namerModule.NEXT_GAP_MS);
  assert.equal(asked.length, 2);
  assert.match(asked[1].text, /^Other topics: Launch date move$/m, "names stay distinct");
  assert.equal(labelOf(namer, talk.snapshot(2), 1).label, "SSO login with SAML");
  assert.equal(labelOf(namer, talk.snapshot(2), 2).label, "Launch date move");
});

test("a name never goes back: a failed rename leaves the last name shown", async () => {
  const { clock, namer, asked, answers, changes } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "Launch date move");

  talk.say(1, 70);
  answers.push(() => Promise.reject(new Error("Request timed out after 30s")));
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 2);
  assert.match(asked[1].text, /^Current name: Launch date move\./m);
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "Launch date move");
  assert.equal(changes(), 1);
  assert.equal(namer.stats.failed, 1);
});

test("a rename that keeps the name changes nothing on screen", async () => {
  const { clock, namer, asked, answers, changes } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Launch date move", "launch date move.");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  talk.say(1, 70);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 2);
  assert.equal(changes(), 1, "published once, for the first name");
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "Launch date move");
});

test("the live topic is named only from its turns before a change the tracker proposes", async () => {
  const { clock, namer, asked, answers } = setup();
  const talk = conversation();
  // The tracker shows the next subject's first turns in the live topic until
  // it draws the change it proposes there (`unsettledFrom`).
  const proposing = (from) => {
    const snapshot = talk.snapshot(1);
    return { ...snapshot, nodes: snapshot.nodes.map((node) => ({ ...node, unsettledFrom: from })) };
  };
  talk.say(1, 45);
  answers.push("Launch date move", "Launch date and its blockers");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 1);

  const change = talk.say(1, 40);
  talk.say(1, 40);
  namer.observe(proposing(change), talk.segments);
  await clock.tick(namerModule.MAX_SETTLE_MS);
  assert.equal(asked.length, 1, "what was said from the proposed change on does not count");

  // The tracker now proposes the change later: 125 words come before it.
  const later = talk.say(1, 30);
  namer.observe(proposing(later), talk.segments);
  await clock.tick(namerModule.MAX_SETTLE_MS);
  assert.equal(asked.length, 2, "asked again, and open to a new name at 2.5 times its words");
  const quoted = asked[1].text.split("What was said on this topic:\n")[1].split("\n");
  assert.equal(quoted.length, 3);
  assert.ok(!asked[1].text.includes(talk.segments[3].text), "nothing from the proposed change on");
  assert.deepEqual(namer.names.get(1).utteranceIds, ["u0", change, "u2"]);
  assert.equal(namer.names.get(1).words, 125);
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "Launch date and its blockers");
});

test("a request that does not answer in time fails, and the topic waits to grow by half", async () => {
  const { clock, namer, asked } = setup();
  const talk = conversation();
  talk.say(1, 50);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 1);
  await clock.tick(namerModule.NAME_TIMEOUT_MS);
  assert.equal(namer.stats.failed, 1);
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "topic 1", "the on-device name stays");

  talk.say(1, 20);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(30_000);
  assert.equal(asked.length, 1, "70 words is not half again 50");
  talk.say(1, 6);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 2);
});

test("an answer that is no name changes nothing", async () => {
  const { clock, namer, answers, changes } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("General discussion");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "topic 1");
  assert.equal(labelOf(namer, talk.snapshot(1), 1).deviceLabel, undefined);
  assert.equal(changes(), 0);
  assert.equal(namer.stats.unusable, 1);
});

test("three failures in a row end naming for the recording", async () => {
  const { clock, namer, asked, answers } = setup();
  const talk = conversation();
  for (let topic = 1; topic <= 4; topic += 1) talk.say(topic, 45);
  const fail = () => Promise.reject(new Error("OpenAI API key not configured"));
  answers.push(fail, fail, fail, "Never asked");
  namer.observe(talk.snapshot(1), talk.segments);
  for (let round = 0; round < 3; round += 1) await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 3);
  talk.say(4, 100);
  namer.observe(talk.snapshot(4), talk.segments);
  await clock.tick(60_000);
  assert.equal(asked.length, 3, "nothing more for this recording");
  // Nor at the end: the model was not answering.
  await namer.finish(talk.snapshot(), talk.segments);
  assert.equal(asked.length, 3);
});

test("nothing is sent while the writing model is not ready", async () => {
  let ready = false;
  const { clock, namer, asked, answers } = setup({ ready: async () => ready });
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 0);
  ready = true;
  talk.say(1, 3);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 0, "readiness is asked again only after a while");
  await clock.tick(namerModule.NOT_READY_BACKOFF_MS);
  talk.say(1, 3);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 1);
});

test("named only at the end when names wait for the end: every topic, the biggest first", async () => {
  const { clock, namer, asked, answers } = setup({ live: false });
  const talk = conversation();
  talk.say(1, 35);
  talk.say(2, 60);
  talk.say(3, 20);
  namer.observe(talk.snapshot(2), talk.segments);
  await clock.tick(60_000);
  assert.equal(asked.length, 0, "nothing while recording");
  answers.push("SSO login with SAML", "Launch date move");
  const final = talk.snapshot();
  const named = await namer.finish(final, talk.segments);
  assert.equal(asked.length, 2, "twenty words is too few even for the record");
  assert.equal(named.nodes[1].label, "SSO login with SAML");
  assert.equal(named.nodes[0].label, "Launch date move");
  assert.equal(named.nodes[2].label, "topic 3");
  assert.equal(final.nodes[0].label, "topic 1", "the snapshot passed in is not changed");
});

test("the end waits for the request that is out, renames what grew, and keeps to its budget", async () => {
  const { clock, namer, asked, answers } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  talk.say(2, 45);
  const out = deferred();
  answers.push(() => out.promise);
  namer.observe(talk.snapshot(2), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 2);

  talk.say(1, 30); // topic 1 grew from 45 to 75 words: a third more
  answers.push("Launch date and customer kickoff");
  const finishing = namer.finish(talk.snapshot(), talk.segments);
  out.resolve("SSO login with SAML");
  const named = await finishing;
  assert.equal(asked.length, 3);
  assert.match(asked[2].text, /^Current name: Launch date move\./m);
  assert.equal(named.nodes[0].label, "Launch date and customer kickoff");
  assert.equal(named.nodes[1].label, "SSO login with SAML", "the name that was out still lands");

  // A budget spent stops the pass, and what was named so far is kept.
  const slow = setup();
  const quiet = conversation();
  quiet.say(1, 45);
  quiet.say(2, 45);
  slow.answers.push(() => new Promise(() => {}));
  const pass = slow.namer.finish(quiet.snapshot(), quiet.segments, { budgetMs: 5000 });
  await flush();
  await slow.clock.tick(5000);
  const result = await pass;
  assert.equal(slow.asked.length, 1);
  assert.equal(result.nodes[0].label, "topic 1");
});

test("a name the live topic check gave is kept at the end, and the topic described once", async () => {
  const { namer, asked, answers } = setup({ live: false });
  const talk = conversation();
  talk.say(1, 40);
  talk.say(1, 50); // 90 words, named at 40: grown enough for a rename
  talk.say(2, 45);
  // As topicNamingRunner.ts seeds it from the check (topicLoop.mjs `namesFor`).
  namer.names.set(1, {
    name: "Launch date move",
    description: "Launch moves a week",
    words: 40,
    namings: 1,
    utteranceIds: ["u0"],
    held: true,
  });
  answers.push(
    "SSO login with SAML",
    "Name: Launch week kickoffs\nAbout: The launch moves a week, and three kickoffs move with it."
  );
  const named = await namer.finish(talk.snapshot(), talk.segments);
  assert.equal(asked.length, 2, "the topic the check did not name, then the description");
  assert.match(asked[1].text, /^Current name: Launch date move\. Reply with it unchanged\.$/m);
  assert.equal(named.nodes[0].label, "Launch date move", "the check's name stays");
  assert.equal(
    named.nodes[0].description,
    "The launch moves a week, and three kickoffs move with it."
  );
  assert.equal(named.nodes[1].label, "SSO login with SAML");
  assert.deepEqual(
    namer.names.get(1).utteranceIds,
    ["u0"],
    "the check's lines still decide the fit"
  );
  // Described once: a second end asks nothing more of it.
  await namer.finish(talk.snapshot(), talk.segments);
  assert.equal(asked.length, 2);
  // The same name from the namer itself is renamed as it grew.
  const own = setup({ live: false });
  own.namer.names.set(1, { name: "Launch date move", words: 40, namings: 1, utteranceIds: ["u0"] });
  // Unnamed topics go first at the end, then renames.
  own.answers.push("SSO login with SAML", "Launch date and customer kickoff");
  const renamed = await own.namer.finish(talk.snapshot(), talk.segments);
  assert.equal(own.asked.length, 2);
  assert.equal(renamed.nodes[0].label, "Launch date and customer kickoff");
});

test("a stopped namer asks nothing more", async () => {
  const { clock, namer, asked, answers } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  namer.stop();
  await clock.tick(60_000);
  assert.equal(asked.length, 0);
});

// The model on this computer: its requests go through the bridge's line
// (oneAtATime.js), as the question classifier's and the summary's do. The
// namer never has more than one there, so it never fills the line, and a name
// waits behind a classifier verdict rather than failing.
test("on this computer a name waits its turn behind the question classifier", async () => {
  const line = createOneAtATime({ maxWaitMs: 45_000, maxWaiting: 4 });
  const order = [];
  const classifier = deferred();
  const classifying = line.run(async () => {
    order.push("classifier");
    return classifier.promise;
  });
  let mostWaiting = 0;
  const { clock, namer, asked } = setup({
    ask: (prompt) => {
      asked.push(prompt);
      const turn = line.run(async () => {
        order.push("name");
        return "Launch date move";
      });
      mostWaiting = Math.max(mostWaiting, line.waiting);
      return turn;
    },
  });
  const talk = conversation();
  talk.say(1, 45);
  talk.say(2, 45);
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 1);
  assert.deepEqual(order, ["classifier"], "the name waits for the classifier");
  classifier.resolve("{}");
  await classifying;
  await flush();
  assert.deepEqual(order, ["classifier", "name"]);
  assert.equal(labelOf(namer, talk.snapshot(1), 1).label, "Launch date move");
  assert.equal(mostWaiting, 1, "one name in the line at most");
});

test("the description keeps up with the topic, and the name holds between its steps", async () => {
  const { clock, namer, asked, answers, changes } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Name: Launch date move\nAbout: The launch may move from the 3rd.");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.match(asked[0].text, /^Length of the description: at most 15 words\.$/m);
  let shown = labelOf(namer, talk.snapshot(1), 1);
  assert.equal(shown.label, "Launch date move");
  assert.equal(shown.description, "The launch may move from the 3rd.");
  assert.equal(changes(), 1);

  // 1.6 times the words: asked again, for the description only.
  talk.say(1, 30);
  answers.push(
    "Name: Kickoff week plans\nAbout: The launch may move from the 3rd; three kickoffs that week."
  );
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 2);
  assert.match(asked[1].text, /^Current name: Launch date move\. Reply with it unchanged\.$/m);
  shown = labelOf(namer, talk.snapshot(1), 1);
  assert.equal(shown.label, "Launch date move", "the name holds between its steps");
  assert.equal(shown.description, "The launch may move from the 3rd; three kickoffs that week.");
  assert.equal(changes(), 2, "a new description is published");

  // An answer with no description keeps the last one, and is still a name.
  talk.say(1, 50); // 125 words: 2.5 times the 45 the name was read from
  answers.push("Launch date and kickoffs");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 3);
  assert.match(asked[2].text, /Reply with a better name only if it does not\./);
  shown = labelOf(namer, talk.snapshot(1), 1);
  assert.equal(shown.label, "Launch date and kickoffs", "open to a new name at 2.5 times");
  assert.equal(shown.description, "The launch may move from the 3rd; three kickoffs that week.");
  assert.equal(namer.names.get(1).nameWords, 125);
});

test("a description-only request answered with the name alone changes nothing, and is no failure", async () => {
  const { clock, namer, asked, answers, changes } = setup();
  const talk = conversation();
  talk.say(1, 45);
  answers.push("Name: Launch date move\nAbout: The launch may move from the 3rd.");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  talk.say(1, 30);
  answers.push("Launch date move");
  namer.observe(talk.snapshot(1), talk.segments);
  await clock.tick(namerModule.SETTLE_MS);
  assert.equal(asked.length, 2);
  assert.equal(changes(), 1);
  assert.equal(namer.stats.unusable, 0);
  assert.equal(namer.failures, 0);
  assert.equal(namer.names.get(1).words, 75, "the next request waits for the next step");
  assert.equal(
    labelOf(namer, talk.snapshot(1), 1).description,
    "The launch may move from the 3rd."
  );
});
