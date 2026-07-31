# Oats — Product Vision (internal)

> Git-ignored on purpose. This is the north star, not shipped docs.

## The one-liner

**Oats is the tool a founder actually keeps open.** You download a DMG, and from
then on, whenever you're talking to _anyone_ — a candidate, an investor, a
customer, a cofounder — the listening session starts on your own computer. No
account to create, no bot joining the call, no meeting link, no cloud. The most
high-signal, effective surface for doing startup work, and it lives entirely on
your machine.

## Who it's for

**Academics, hackers, and founders** (widened 2026-07-30 from founders alone).
People whose day is back-to-back conversations and whose edge is remembering,
connecting, and acting on what was said faster than anyone else. They are
privacy-sensitive — discussing unpublished research, unshipped work, unannounced
fundraises, hiring, and roadmaps — and allergic to setup friction.

The three share one profile: their work product is thinking, they are fluent
enough to resent being condescended to, and the conversation matters more than
any tool in the room. That last point is the binding constraint — Oats is used
while its user's attention belongs to someone else.

**The standard is a pencil: reliable and intuitive.** Nobody has ever been let
down by a pencil, and nobody was ever taught to use one. Oats earns daily use by
being trusted the same way and picked up the same way — no battery, no account,
no mode, nothing to remember, and never a lost conversation.

## How we win — and how we conquer Granola / Muesli / the rest

Two wedges, both things the incumbents structurally can't match:

### 1. Extremely easy to set up — because it's self-owned

The whole category makes you sign up, connect a calendar, invite a notetaker
bot into your call, and trust their cloud with your most sensitive
conversations. Oats is the opposite:

- **Download → open → talk.** No login, no key, no bot, no meeting link.(would possibly imply this product require to install Ollama and small models like qwen if the user does not have)
- **Works the instant it's installed**, offline, out of the box.
- **It's yours.** Audio, transcripts, notes, detection, and search live on the
  founder's machine — mostly if not completely self-owned. The only thing that
  can ever leave the device is something the user explicitly clicks or a model
  key they choose to add.
- Setup is not a funnel to convert — it's a 10-second non-event. That _is_ the
  moat: nobody selling a SaaS backend can afford to make setup this frictionless
  or this private.

### 2. Very, very human features

Granola gives you a transcript and a summary. Oats is built to feel like a
sharp, quiet person sitting next to you:

- **It listens the way a good colleague listens** — catches the moment someone
  asks a real question that went unanswered ("Do you know what Kubernetes is?"
  → "No.") and quietly offers to help, without interrupting or phoning anything
  home.
- **It respects the room.** No bot announcing itself, no "recording" banner for
  the other person, no awkwardness. One microphone, in-person or on a call.
- **It hands you structure, not a wall of text.** The Graph view lays out the
  actual shape of a conversation — every question, whether it was answered, and
  what to follow up on.
- **It never acts behind your back.** Nothing is searched, sent, or shared until
  you touch it. Quiet by default, helpful on demand.

The bet: founders don't want _more transcription_. They want a tool that feels
human, keeps their secrets, and is there instantly. That's the whole game.

## The listening session — the core loop

The product is one motion, repeated all day:

1. Founder is about to talk to someone → one hotkey / one click starts a
   **local listening session.**
2. Oats transcribes on-device, in real time, and watches for the human moments
   worth surfacing (unanswered questions today; more signals to come).
3. A small, dismissible card offers help exactly when it's useful — never
   automatically, never noisily.
4. Afterward, the note + Graph view give the founder the structured memory of
   what happened, searchable by meaning, entirely locally.

Everything else we build hangs off this loop.

## Features — shipping now, and to come

**Live today (inherited + Oats):** local dictation into any app, in-person and
online-meeting recording around one mic, on-device transcription, local
summaries/notes, semantic search, unanswered-question detection, click-to-search
card, and the conversation **Graph** view.

**The roadmap is deliberately open — "a lot of good features to come."** The
frame for choosing them: _does it make Oats feel more human, more high-signal,
and does it stay on-device?_ Candidates in that spirit (unordered, unpromised):

- Follow-ups and commitments detected in the conversation ("I'll send you the
  deck") surfaced as a local to-do.
- People/company memory that persists across your own conversations, locally.
- Better in-the-moment nudges beyond questions — names to remember, facts to
  double-check, decisions made.
- One-key "start a session" that's frictionless whether in-person or on a call.
- Fast local recall: "what did that candidate say about equity?"

The rule: each feature must survive the two wedges above — trivial setup, and a
genuinely human touch — or it doesn't ship.

## Why this is technically real, not a pitch

The "everything on your machine" promise is already most of the way there in the
code:

- The DMG **bakes the entire engine in at build time** — transcription
  (whisper.cpp, Parakeet), local reasoning (llama.cpp), audio (ffmpeg, VAD,
  echo-cancel), and **semantic search including the embedding model**. Search
  works offline the moment you install.
- The only runtime download is the speech model itself. We make that a
  non-event: **bundle a small default model in the DMG** so the first
  conversation works offline with zero clicks, and silently upgrade to a better
  model in the background when there's network.
- A flexible local stack, each tier local-by-default with an optional
  bring-your-own-key escape hatch:
  - **Listen/transcribe** — whisper.cpp or Parakeet, on-device.
  - **Understand** — local question-classifier + optional local/cloud reasoning.
  - **Remember/search** — Qdrant + MiniLM, fully bundled, fully local.

Target first-run: _drag to Applications → allow microphone → (macOS) allow
accessibility → start talking._ No account, no key, no download, offline-capable.

## What stands between us and this (the honest work)

This vision is achievable, but the repo is still **OpenWhispr underneath** and
carries baggage that contradicts the pitch. Clearing it is the near-term job —
mostly subtraction, not building:

1. **Cut the SaaS umbilical.** The app currently talks to
   `auth.openwhispr.com` / `api.openwhispr.com` and carries accounts, referrals,
   usage meters, and upgrade prompts. All of that must go — it breaks both the
   "self-owned" and "trivial setup" promises. _(Highest priority.)_
2. **Rebrand fully.** Name, `appId`, icon, URL scheme, and update feed are still
   OpenWhispr's. Keep the MIT license + credit upstream; ship our own identity.
3. **Strip to the core loop.** Remove enterprise panels, team/workspace,
   referral, MCP/CLI bridges — anything not serving the listening session.
4. **Refurbish the UI around the loop.** 3-step onboarding, the Graph view
   elevated as the signature surface, settings collapsed to the essentials.
   (Foundation is Tailwind v4 + shadcn/ui. **Superseded 2026-07-30:** this line
   used to read "reskin, don't rebuild". It no longer holds — `CLAUDE.md` is now
   explicit that inherited OpenWhispr layouts and product feel must not be
   preserved or reskinned, and a large overhaul is sanctioned where a surface
   fails the pencil test structurally rather than cosmetically.)
5. **Earn the trust claim.** Notarize the DMG, measure idle CPU of the
   always-listening detector, and network-trace a full session to _prove_
   nothing leaves the device except an explicit click or a user-added key.

## Next step

Trace every backend/auth call site and the SaaS-component/IPC graph into a
concrete deletion checklist — that turns "cut the umbilical" from intent into an
actionable diff, and it's the gate for everything else.
