<p align="center">
  <a href="https://oats-mac.vercel.app">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/media/banner-dark.png">
      <img src="docs/media/banner-light.png" width="800" alt="Oats. The conversation, mapped as it happens.">
    </picture>
  </a>
</p>

<p align="center">
  Oats maps the conversation in the room as it happens: topics as they turn,<br>
  questions as they're asked, and whether anyone answered.
</p>

<p align="center">
  Notes after the meeting come too late.<br>
  Oats shows you the conversation while you can still steer it.
</p>

<p align="center">
  <a href="https://github.com/alexgaoth/oats/releases/latest/download/Oats-arm64.dmg"><img src="docs/media/download-mac.png" width="260" alt="Download Oats for Mac"></a>
</p>

<p align="center">
  <sub>Version 0.2.0 for Apple Silicon, macOS 12 or later. Also as an <a href="https://github.com/alexgaoth/oats/releases/latest/download/Oats-x64.dmg">Intel build</a>, not yet tested on an Intel Mac.</sub><br>
  <sub><a href="https://oats-mac.vercel.app">Website</a> · <a href="https://github.com/alexgaoth/oats/releases/latest">Release notes</a></sub>
</p>

<p align="center">
  <img src="site/media/live-window-2240.webp" width="880" alt="Oats recording a launch review at 11:09. One line draws the conversation, with marks where an unknown, an unanswered and an answered question were asked. Below it, three topics as lanes: Pellwood launch date decision, SAML clock skew fix, and SOC 2 audit timeline, the one the room is on.">
</p>

The conversations that matter happen around a table. Taking notes pulls you out of them, and meeting bots join calls, not rooms. Oats sits on the table with one microphone. While you talk, the screen shows the shape of the conversation and nothing that competes with the people in front of you.

## What it does

### Watch the conversation take shape

Press <kbd>⇧</kbd><kbd>⌘</kbd><kbd>O</kbd> and talk. One line draws the conversation live: a notch where the subject turns, a mark where someone asks. Its height is how loud the room is. The sidebar steps aside while you record, and under the clock two quiet counters keep the words and the questions so far. Speech is transcribed on your Mac with whisper.cpp, on the GPU, and <kbd>M</kbd> marks a moment.

<p align="center">
  <img src="docs/media/loop-record.webp" width="840" alt="Recording starts: the sidebar steps aside, and over a few minutes the line grows and the topics fill their lanes">
</p>

### Topics name themselves

Each topic gets its name from what was said. When the room comes back to one, the line goes back too.

The conversation flow under the line keeps one lane per topic, in the order raised, with the minutes spent on each. **Graph** shows the same topics by when each was raised and how unsettled it still is. Oats finds the topics on your Mac and names each with a phrase said in it, and the writing model names it more exactly as it grows. Under the lanes are subjects that came up with these in earlier conversations and have not come up yet.

<p align="center">
  <img src="site/media/topic-lanes.webp" width="840" alt="Conversation flow at 12:33, three topics and one return to an earlier topic. The line steps down from Pellwood launch date decision to SAML clock skew fix and SOC 2 audit timeline, then goes back up to Pellwood launch date decision, where the room is now.">
</p>

### Every question, caught as it's asked

Each question shows up the moment it's asked, and changes when the room answers it, or doesn't. Ask again before anyone leaves.

On the line, a question is a mark. With the transcript shown, it is also a card that says how it ended, in place, while people are still talking. A question asked twice is kept as a signal, not dropped as a repeat.

| Card | When |
|---|---|
| **Answered** | Someone gave an answer. |
| **Unknown** | The room said it did not know. Oats opens a web search for the question. |
| **Unanswered** | The room moved on. |
| **Open** | Nobody has replied yet. |

<p align="center">
  <img src="docs/media/loop-questions.webp" width="560" alt="A question is asked and its card appears as Open. After someone says they do not know, it turns Unknown and Oats searches it on the web">
</p>

### Unsure answers, checked on the spot

When an answer sounds unsure, Oats looks it up in your notes and past conversations while people are still talking.

It is off by default: turn on the context check in Settings and choose a folder of notes. Under the question, Oats says **That's right**, **Wait, that's wrong**, or **Found it** when the room did not know, with the answer and the file it came from. When the folder and your past conversations have no answer, Oats can also ask Claude Code, if you turn that on too: it reads your GitHub, Linear, Notion and Slack connections, read only, and the question and the reply go to Anthropic, and the search text to those services.

<p align="center">
  <img src="site/media/check-live.webp" width="640" alt="A recording at 8:33. Under the question Do we have a date from the auditors yet, asked 17 seconds earlier and marked Unknown, Oats shows Found it: Fieldwork starts November 10, from soc2-plan.md, Auditor dates. The transcript below has the reply: I don't know yet.">
</p>

### Written up when you stop

Title, summary, talk time for each person, and the transcript with every voice told apart.

The summary starts by itself when you stop, with the threads the conversation followed, the decisions and the action items, next to how each question ended. It is written by a model on your Mac, which Oats downloads by itself, or with your own API key. The transcript, the voices, the questions and the shape of the conversation need no writing model.

<p align="center">
  <img src="site/media/conversation-finished.webp" width="560" alt="The finished conversation, Enterprise launch review: SSO gates the date. 29 minutes, 9 speakers, 3 marked moments, and 15 questions: 9 answered, 3 unknown, 2 unanswered, 1 open. Below, the shape of the conversation with each question in its place, and talk time for each person, from Maya at 18 percent to Omar at 2 percent.">
</p>

### Find anything anyone said

Search every transcript at once, even for part of a word. Chinese and Japanese too.

Search reads every transcript on your Mac, including the oldest. It finds a word inside a longer one, so "rice" finds "price", and it works in Chinese and Japanese, which are written without spaces. Each search says how many matches it found and how long it took, and each match says when in the conversation it was said. Press <kbd>/</kbd> to search from anywhere in the app.

<p align="center">
  <img src="docs/media/loop-search.webp" width="730" alt="A search for import bug finds 15 matches in 3 conversations in under a tenth of a millisecond, with the words highlighted">
</p>

### See what keeps coming back

Conversations on the same subject link up, so you see it come back across weeks.

The board lays out every conversation as a graph and as a timeline, so a subject that keeps coming back shows as the arcs between the days it came up. Each conversation is sorted into Work, Personal or a group you make by the model that writes your summaries, from its title, its topics and the start of its summary, never from the transcript.

<p align="center">
  <img src="docs/media/loop-global.webp" width="840" alt="The board of all conversations: a force graph of how they connect, and an arc timeline of the subjects that came back">
</p>

## Privacy you can check

<img align="right" src="site/media/sidebar-foot.webp" width="190" alt="The bottom of the Oats sidebar: Settings, then On this Mac, small.en on Metal and 0 network requests since launch, above a dithered sky and wheat field.">

On this Mac, audio and transcripts never leave it: transcription runs on whisper.cpp with Metal, and summaries on a local model. There is no Oats account and no Oats server. With your own API key, transcripts go to your provider for summaries, and with an OpenAI key the audio goes to OpenAI for transcription.

One thing is on by default, and you can turn it off in Settings: when a question meets a clear "I don't know", Oats opens a web search for the question text in your browser.

The sidebar counts every network request since launch. Calls to the speech, writing and search servers that run on your Mac are not counted, because they never leave it. [The network allowlist](docs/network-allowlist.md) lists every destination.

<br clear="right">

## Small guarantees

- **Nothing is lost.** The transcript is saved as each sentence is finished, so a crash or a closed lid costs at most the sentence in progress. <kbd>⌘</kbd><kbd>Q</kbd> finishes and saves first.
- **A dead microphone is reported while it still matters**, not at the end.
- **A conversation that captured nothing is not saved** as a blank note.
- **Stopping and starting again within half an hour continues the same conversation**, so a coffee break does not split one meeting into two notes.
- **Every key is named where you use it:** on the button, in its tooltip, or in its menu.

## Keyboard

| Key | Action |
|---|---|
| <kbd>⇧</kbd><kbd>⌘</kbd><kbd>O</kbd> | Start or stop a conversation, from any app |
| <kbd>M</kbd> | Mark this moment |
| <kbd>⌘</kbd><kbd>\\</kbd> | Show or hide the sidebar while recording |
| <kbd>/</kbd> | Search conversations |
| <kbd>⌘</kbd><kbd>F</kbd> | Find in this conversation |
| <kbd>Esc</kbd> | Back |
| <kbd>⌘</kbd><kbd>,</kbd> | Settings |

The record shortcut can be changed in Settings.

## Install

1. Download Oats for [Apple Silicon](https://github.com/alexgaoth/oats/releases/latest/download/Oats-arm64.dmg) or [Intel](https://github.com/alexgaoth/oats/releases/latest/download/Oats-x64.dmg). It needs macOS 12 Monterey or later. The speech models ship inside, so it transcribes offline from the first launch: on Apple Silicon, Whisper `small.en` for English and multilingual `base` for every other language; on Intel, `base.en` and `base`.
2. Open the DMG and drag Oats to Applications.
3. Open Oats. This version is not notarized by Apple yet, so macOS says it cannot verify the app. Click Done.
4. Open System Settings, then Privacy & Security. Scroll down and click Open Anyway next to "Oats was blocked", and confirm with your password or Touch ID. macOS asks only once.

The SHA-256 checksums are in [SHA256SUMS.txt](https://github.com/alexgaoth/oats/releases/latest/download/SHA256SUMS.txt). On an empty Home, open the **example conversation**, a nine-person launch review, to explore everything before you record.

Tell people before you record. Some places, for example California, need everyone's consent.

## Build from source

You need Node.js 24 and the Xcode command line tools.

```sh
git clone https://github.com/alexgaoth/oats.git
cd oats
npm ci
npm run setup:check
npm run dev
```

[Developing Oats](docs/development.md) has the full setup, the Linux notes and the test suites. The public page lives in [site/](site/README.md).

## How it works

Oats is an Electron app. The interface is React. The main process runs the local speech server (whisper.cpp), an optional local language model (llama.cpp) for summaries, local embeddings for related-conversation search, and SQLite with full-text search for the transcripts. The topic tracker and the question detector are plain code over the transcript, so they cost nothing to run for an hour and never need a network. [Architecture](docs/architecture.md) maps the modules, [DESIGN.md](DESIGN.md) is the design reference, and [the product description](docs/product.md) explains each behaviour in depth.

## Principles

- **Reliable like a pencil.** It works with no network, no model and no account, it never loses a conversation, and it needs nothing explained.
- **Alive, not busy.** Nothing moves at rest. Motion answers what you did, and the recording view stays calm while people talk.
- **Honest networking.** What leaves the machine is listed, counted and switchable.

## Acknowledgements

Oats grew out of [OpenWhispr](https://github.com/OpenWhispr/openwhispr), an MIT-licensed desktop dictation app, and [UPSTREAM.md](UPSTREAM.md) records the provenance. Transcription uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp), local models run on [llama.cpp](https://github.com/ggml-org/llama.cpp), the interface is set in [Inter](https://rsms.me/inter/), and the wordmark in [EB Garamond](https://github.com/octaviopardo/EBGaramond12). Topic names prefer distinctive words by their rank in English, from the Google Books Ngram corpus as counted by [google-books-ngram-frequency](https://github.com/orgtre/google-books-ngram-frequency) (CC BY 3.0). The speed check that picks the speech model for a Mac reads one utterance from [LibriSpeech](https://www.openslr.org/12) (Panayotov et al., CC BY 4.0): test-clean 7127-75946-0024, read by Bill Kneeland for LibriVox.

## License

[MIT](LICENSE)
