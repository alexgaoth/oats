# Oats demo kit

Sample conversations, a seeded demo profile, and a browser harness that runs the
real renderer against them, live or at rest. It is the source for README
screenshots and for a scripted demo video. Every company, product and person in
it is invented.

## What is in it

| Path                                                              | What it is                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script/launch-readiness-review.mjs`                              | The main sample, as written: a 29-minute launch readiness review at Pellwood, a fictional 40-person software company. Nine people, eight topics, fifteen questions.  |
| `script/supporting.mjs`                                           | Six shorter conversations over the two weeks before it: a hiring sync, a customer call, a design crit, two 1:1s and an SSO check-in, all on weekdays. Filed in Work. |
| `script/personal.mjs`                                             | Two short personal conversations: a family planning a weekend at a lake, and a call with a letting agent about a flat viewing. Filed in Personal.                    |
| `build-fixtures.mjs`                                              | Records the scripts through the app's own pipeline and writes the fixtures.                                                                                          |
| `../src/helpers/sampleConversations/launch-readiness-review.json` | The main sample as the app stores it. Packaged with the app, for the in-app example.                                                                                 |
| `fixtures/*.json`                                                 | The six work and two personal conversations. Demo profiles only.                                                                                                     |
| `../src/helpers/sampleConversations.mjs`                          | Placing a sample in time, and inserting or removing samples through `DatabaseManager`. Used by the seed script and by the app.                                       |
| `../scripts/demo-seed.mjs`                                        | Seeds a demo profile's database.                                                                                                                                     |
| `harness/`                                                        | The browser harness: a fake main process, a fake microphone, a clock that can pause, and the live replay. Dev-only.                                                  |
| `lib/conversation.mjs`                                            | Timing and loudness, shared by the builder and the replay, so both play the same conversation.                                                                       |
| `capture.mjs`                                                     | 2x PNG screenshots of the harness, light and dark, with headless Chrome.                                                                                             |

## The fixtures are recorded, not written

`node demo/build-fixtures.mjs` (`npm run demo:fixtures`) plays each script
through the app's own code with a virtual clock: segments reach the question
aide and the topic tracker in the order and at the moments the recording store
hands them over, Mark is pressed where the script says, the meter is sampled ten
times a second into the stored loudness, and at Stop the speaker pass puts the
voices on the turns before each voice is named. Only the title and the summary
are written by hand, in the format the summary action asks its model for.

So every outcome, topic, return, open count and loudness value in a fixture is
what the app computes from the words. To change the sample, change the script
and build again; do not edit the JSON.

```sh
npm run demo:fixtures                 # write the fixtures
npm run demo:fixtures -- --report     # also print what the pipeline made of every turn
npm run demo:fixtures -- --check      # exit 1 if a fixture is stale
```

The app reads the words literally, so the scripts follow its rules (the header
of `script/launch-readiness-review.mjs` explains each):

- Only questions have a question mark or a wh-word (what, why, how, which, who,
  where, when). The aide makes a card for every one.
- The turn after a question decides its outcome: four or more words is
  Answered, "I don't know" or "no idea" is Unknown, "Hmm." is Unanswered. The
  last question gets no reply, so it stays Open. The builder fails if a reply
  lands near the aide's 8-second silence window.
- A topic opens with two turns that share its nouns, and each longer turn in a
  topic carries some of them. `--report` shows the tracker's scores per turn.

## Groups

Every conversation is in one group or in none: Work, Personal, or one the
person makes. A script names its group by seed key (`group: "work"`), and the
builder writes it into the fixture as `meta.group`. Inserting a fixture
(`insertSampleConversations`, and the harness's fake main) files the note in
the seeded group with that key. It is recorded as the writing model's choice
(`group_source = 'model'`), because the fixture stands in for what the model
would have chosen, as its title and summary stand in for what the model would
have written. A person can move it like any conversation.

- The six Pellwood conversations are in Work, and the two personal ones are in
  Personal.
- The review names no group. The film depends on its timeline, so its fixture
  is not changed, and in the app it is sorted like any conversation. In the
  harness, the stub model answers the sort prompt (`harness/replay.mjs`):
  Personal for a weekend, a trip, family or a flat, and Work for anything else.
  A background run starts with `window.dispatchEvent(new
Event("oats-sort-conversations"))`.
- If the seeded group was renamed (its seed key is cleared) or deleted, the
  sample stays unsorted.
- The personal conversations share no subjects with Pellwood, so on the map
  they are not linked to the review.

## Seed a demo profile

```sh
npm run demo:seed -- --profile ~/oats-demo-profile            # all nine conversations
npm run demo:seed -- --profile ~/oats-demo-profile --reset    # remove the samples, insert again
npm run demo:seed -- --profile ~/oats-demo-profile --only-main
npm run demo:seed -- --profile ~/oats-demo-profile --dev      # transcriptions-dev.db, as `npm run dev` opens
```

The script opens the database with the app's own `DatabaseManager`, so the
schema and the migrations are the app's, and inserts with
`insertSampleConversations`. It runs on Electron's Node
(`ELECTRON_RUN_AS_NODE=1`, like `npm run test:oats:db`): no window opens and no
audio is touched. It refuses Oats' real profile (`~/Library/Application
Support/oats`) and any existing directory it did not make itself (a seeded
profile has `oats-demo-profile.json` in it).

To point a real Oats at a demo profile, seed the channel directory the app uses
(`main.js` sets userData to `~/Library/Application Support/Oats-<channel>`), for
example `--profile "~/Library/Application Support/Oats-staging"` while that
directory does not exist yet, then start Oats with `OATS_CHANNEL=staging`.
Settings live in the window's localStorage, not in the database, so the first
launch shows onboarding.

## The in-app example

The main sample ships with the app. With nothing recorded, Home (under the
record card) and the empty Conversations page (under Start recording) offer it:
**Open an example conversation**. The press asks main for it over
`db-insert-example-conversation`, which runs `insertExampleConversation`
(`src/helpers/exampleConversation.mjs`) and opens what comes back the way a
Recent row opens a conversation:

```js
const { insertExampleConversation } = await import("./exampleConversation.mjs");
const fixture = require("./sampleConversations/launch-readiness-review.json");
const { noteId, inserted, note } = insertExampleConversation(databaseManager, fixture, {
  now: Date.now(),
  announce: (note) => this._announceNoteAdded(note), // as db-save-note does
});
```

- A new copy is announced as a saved note is: `note-added` to every window,
  the vector index and the note files. While a copy is there, that copy is the
  answer, and nothing is added or announced.
- Every note with a `sample_id` carries a muted **Example** badge beside its
  title: on Home, in the list and in the reading view. In a seeded demo profile
  and in the harness's default profile, that is every conversation;
  `profile=empty` shows the app as a new install sees it.
- Times are placed relative to `now`: the review ends two hours earlier, never
  closer than 45 minutes, so Record does not continue it.
- Each sample note carries `notes.sample_id` (`"launch-readiness-review"`), a
  nullable column added by the usual migration. `updateNote` cannot write it.
- Inserting again does nothing while a copy is there; `replace: true` swaps it.
  The normal Delete hides a sample like any note, and a later insert brings a
  fresh copy back.
- `removeSampleConversations(databaseManager, { sampleIds })` deletes samples
  for good, deleted ones and their question events included.

## Run the harness

```sh
npm run demo:harness        # Vite on http://127.0.0.1:5391 (another port if that one is taken)
```

| URL                                                    | What it shows                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `/demo.html?panel=true`                                | Home with all nine samples.                                             |
| `/demo.html?panel=true&theme=dark`                     | The same, dark.                                                         |
| `/demo.html?panel=true&demo=live`                      | The review, recorded live from 0:00. The other eight are already there. |
| `/demo.html?panel=true&demo=live&from=1062&view=words` | Live, from 17:42, in the Words view.                                    |
| `/demo.html?panel=true&profile=empty`                  | Nothing recorded yet: Home offers the example conversation.             |

Parameters: `demo=live`, `from` (seconds), `speed` (1 is real time), `end=hold`
(keep recording at the end; otherwise Stop is pressed 2.6 s after the last
words), `edits=0` (leave the voices unnamed after Stop), `profile=empty` (no
conversations at all, as a new install; the fake main inserts the example when
it is asked), `theme=light|dark`, `view=calm|words`, `flow=lanes|graph`.
`panel=true` is the app's own parameter for the workspace window.

The harness sets the demo's settings on every load: onboarding done, English,
question cards on and read locally (no classifier model), auto-search off, and
a local summary model, so Finish writes a title and a summary.

### Directing a recording

`window.oatsDemo` drives the replay from the console, or from a script:

```js
await oatsDemo.play(); // press Record (the shortcut's way), or carry on after a pause
oatsDemo.pause();
await oatsDemo.seek(720); // forward only, to 12:00; everything on the way arrives in order
oatsDemo.speed(2);
await oatsDemo.finish(); // press Stop; main's half and the reader's edits follow
oatsDemo.status(); // { phase, seconds, lengthSeconds, paused, speed, noteId, ... }

await oatsDemo.open("launch-readiness-review", { tab: "connections" });
await oatsDemo.tab("transcript");
await oatsDemo.show("map"); // "home", "conversations" or "map"
oatsDemo.samples();
```

### What is real and what stands in

The renderer, its stores and every helper are the app's. The harness stands
where the main process and the microphone stand:

- Record and Stop go through `toggle-conversation`, as the global shortcut does,
  so the Conversation surface starts and finishes a real recording.
- Turns arrive as `meeting-transcription-segment` events, partial text while a
  turn is said, then the final segment, at the moments the builder used. The
  question aide, the topic tracker, the counters, the flow card and the
  checkpoints all run on them.
- `getUserMedia` returns a silent stream, so no permission is ever asked, and
  the AnalyserNode reports the replayed room's level. The listening ring, the
  live contour and the loudness kept at Finish are the app's own measurement.
- Mark is pressed with the M key.
- After Stop, main's half follows: the turn being said is transcribed, the
  speaker pass reports the voices (`conversation-speakers`), and the local model
  answers the summary action with the sample's title and summary. Then the
  reader's edits are made as the reading view makes them: each voice named,
  and notes added to two marks.
- One exception: during a seek, the skipped seconds' microphone levels are
  published as `MeetingRecordingMount` publishes them (`currentMicLevel`), one a
  second, because the meter samples in real time.

### Caveats

- The clock (`Date.now`) pauses and changes speed; timers do not. The aide's
  8-second silence window is real time, so keep `speed` at about 0.9 or more,
  and do not pause for long right after a question, or a reply can arrive too
  late and the question reads as Unanswered.
- Seek goes forward only. Reload the page with `from=` to start somewhere else.
- The summary describes the whole meeting even if you press Stop early.
- In a room, voices are told apart only after Stop, so the live Words view
  shows one running paragraph without names. That is how the app works.

## Screenshots

```sh
npm run demo:harness &
node demo/capture.mjs --out ~/oats-screens                      # every shot, light and dark
node demo/capture.mjs --out ~/oats-screens --only home,map --themes dark
```

`capture.mjs` drives the system Chrome headless over the DevTools protocol with
Node's own WebSocket, at 1440x900 CSS pixels and a device pixel ratio of 2. Set
`CHROME_PATH` or pass `--chrome` if Chrome is somewhere else.
