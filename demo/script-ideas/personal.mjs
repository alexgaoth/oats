// Two personal conversations for the second demo: a philosophy book club on
// Parfit, and a call about a public talk on personal identity. Short,
// invented, and filed in Personal (`group`), as the work ones are filed in
// Work. Unlike the first demo's personal pair, these share a subject with the
// reading group (personal identity) and with each other, so the board links
// all three. Every real book and idea they mention is in `SOURCES.md`.
//
// The same rules as the main conversation apply (see `main.mjs`): question
// marks and wh-words only on questions, short first replies, and each topic
// opened by two turns that share its nouns.

const day = (daysAgo, hours, minutes) => Date.UTC(2026, 9, 15 - daysAgo, hours, minutes, 0);

export default [
  {
    id: "parfit-book-club",
    group: "personal",
    startedAt: day(2, 26, 30),
    placement: { daysAgo: 2, at: "19:30" },
    company: "A book club (fictional)",
    description: "Sample conversation: a philosophy book club reading Parfit. Invented people.",
    title: "Book club: Parfit's teletransporter, and the bat paper next",
    speakers: {
      lucia: { name: "Lucia", role: "Hosts the book club", rate: 2.05, gain: 1.0 },
      dev: { name: "Dev", role: "Book club member", rate: 1.95, gain: 1.08 },
      hanne: { name: "Hanne", role: "Book club member", rate: 2.2, gain: 0.88 },
    },
    turns: [
      ["lucia", "Okay, book club. Parfit on personal identity, from Reasons and Persons."],
      [
        "dev",
        "Right. Personal identity and the teletransporter. I argued with Parfit on personal identity the whole way.",
      ],
      [
        "hanne",
        "The teletransporter is the famous personal identity case. A copy of you on Mars, and the original destroyed on Earth.",
      ],
      [
        "lucia",
        "And Parfit says personal identity is not the thing that matters. Psychological continuity is.",
      ],
      ["dev", "Would you use the teletransporter?"],
      ["hanne", "Never. I'd take the train."],
      ["dev", "Same. The copy on Mars has my memories, but the copy isn't me."],
      [
        "lucia",
        "Then fission, the other personal identity case. Each half of your brain survives in a different body.",
      ],
      [
        "hanne",
        "Fission is the personal identity case that got me. Identity can't go to both halves, and neither half has a better claim.",
      ],
      [
        "lucia",
        "Parfit said the view made him care less about his own future, and more about other people.",
        { mark: { after: 2.0, note: "Parfit: less concern for his own future, more for others" } },
      ],
      ["dev", "That's the part of personal identity I liked. Less self, more everyone else."],
      ["hanne", "Next month, then. Nagel's bat paper."],
      ["lucia", "Right, Nagel's bat paper. The bat paper on conscious experience, from 1974."],
      ["dev", "Is the bat paper long?"],
      ["lucia", "Short, one evening's reading."],
      ["hanne", "Good. One evening of the bat paper, and wine."],
      ["dev", "Can we do the bat paper at my place?"],
    ],
    summary: `
Lucia, Dev and Hanne discussed the part of Parfit's Reasons and Persons on personal identity, and picked Nagel's bat paper for next month.

## Threads
- **Teletransporter.** A copy of you is built on Mars and the original destroyed on Earth. Parfit's claim is that personal identity is not what matters; psychological continuity is. Dev and Hanne would still not use it.
- **Fission.** Both halves of a brain survive in two bodies and both remember being you. Identity cannot go to both, and neither has the better claim, which is the case that persuaded Hanne.
- **Parfit's own view.** He wrote that the view made him care less about his own future and more about other people.

## Decisions Made
- Next month: Nagel's "What Is It Like to Be a Bat?" (1974), short enough for one evening.

## Follow-ups
- Whether next month's meeting can be at Dev's place.
`,
  },
  {
    id: "library-talk-call",
    group: "personal",
    startedAt: day(4, 19, 40),
    placement: { daysAgo: 4, at: "12:40", weekdays: true },
    company: "A public library (fictional)",
    description:
      "Sample conversation: a call about a public talk on personal identity at a library. Invented people.",
    title: "Library talk: personal identity for a general audience",
    speakers: {
      ben: { name: "Ben", role: "Runs the library's evening talks", rate: 2.0, gain: 1.02 },
      clara: { name: "Clara", role: "Gives the talk", rate: 2.15, gain: 0.94 },
    },
    turns: [
      ["ben", "Hi Clara, it's Ben, about your library talk."],
      ["clara", "Hi Ben. The library talk is all set on my side."],
      ["ben", "Good. The library talk gets the reading room, about sixty chairs."],
      ["ben", "Do you need a projector?"],
      ["clara", "Yes, a projector and a clicker."],
      ["clara", "Ten slides for the library talk, and a long question time after."],
      ["ben", "Then the subject. Personal identity, for an audience of mostly retired teachers."],
      [
        "clara",
        "Personal identity starts with the teletransporter. A copy of you on Mars, and the original gone.",
      ],
      [
        "clara",
        "Then AI copies. One set of weights, thousands of copies running, and personal identity gets strange.",
      ],
      ["ben", "Is the teletransporter too dark for an evening crowd?"],
      ["clara", "Hmm."],
      [
        "clara",
        "I'll keep the teletransporter light. Parfit's fission case does the heavy lifting on personal identity.",
      ],
      ["ben", "And after the library talk, tea and biscuits in the reading room."],
      ["clara", "Lovely. Biscuits after the library talk, the right order."],
      ["ben", "Could you send a short blurb for the poster?"],
    ],
    summary: `
Ben and Clara settled the library talk on personal identity and AI copies: the reading room, a projector, ten slides and a long question time.

## Threads
- **Logistics.** The reading room holds about sixty chairs. Clara needs a projector and a clicker.
- **The talk.** It opens with the teletransporter (a copy of you on Mars), moves to AI copies (one set of weights, thousands of copies running), and leans on Parfit's fission case.

## Action Items
- [ ] Ben: book the projector and the clicker.

## Follow-ups
- Whether the teletransporter is too dark for an evening audience.
- A short blurb for the poster.
`,
  },
];
