// Two personal conversations for the second demo: friends at Dolores Park
// who ban 996 talk, and a call with Mom about p(doom). Short, invented, and
// filed in Personal (`group`), as the work ones are filed in Work. Unlike the
// first demo's personal pair, these share subjects with the hacker house
// meeting (the 996 grind, doom numbers) and with each other, so the board
// links them.
//
// The same rules as the main conversation apply (see `main.mjs`): question
// marks and wh-words only on questions, short first replies, and each topic
// opened by two turns that share its nouns.

const day = (daysAgo, hours, minutes) => Date.UTC(2026, 9, 15 - daysAgo, hours, minutes, 0);

export default [
  {
    id: "dolores-park-picnic",
    group: "personal",
    startedAt: day(2, 22, 0),
    placement: { daysAgo: 2, at: "15:00" },
    company: "Friends at Dolores Park (fictional)",
    description:
      "Sample conversation: friends at Dolores Park, no laptops allowed. Invented people.",
    title: "Dolores Park: touch grass, no laptops allowed",
    speakers: {
      marisol: { name: "Marisol", role: "Friend", rate: 2.05, gain: 1.0 },
      tess: { name: "Tess", role: "Friend", rate: 1.95, gain: 1.06 },
      ike: { name: "Ike", role: "Friend at a startup", rate: 2.2, gain: 0.9 },
    },
    turns: [
      ["marisol", "Okay, Dolores Park rules. No laptops, no 996 grind talk."],
      ["tess", "Right. No 996 grind talk. Ike, that means you."],
      ["ike", "I am only on the 996 grind because the startup is on the 996 grind."],
      ["tess", "The 996 grind is nine to nine, six days a week. That is not a personality."],
      ["marisol", "Is Ike even allowed to touch grass on a Saturday?"],
      ["tess", "Only with a calendar invite."],
      ["ike", "Two to four, then back to the 996 grind."],
      ["tess", "Burrito order, then. Mission burritos."],
      ["marisol", "Right. Burrito order: two carne asada, one veggie burrito."],
      ["ike", "Veggie burrito for me. The 996 grind needs fiber."],
      ["tess", "Burritos, sunlight, and nobody says AGI."],
      ["marisol", "Can we do this again next Sunday?"],
    ],
    summary: `
Marisol, Tess and Ike spent an afternoon at Dolores Park with no laptops and, officially, no 996 talk.

## Threads
- **The 996 grind.** Ike is on the 996 grind because his startup is. Nine to nine, six days a week, is not a personality; touching grass is booked from two to four.
- **Burrito order.** Two carne asada, one veggie (the 996 grind needs fiber). Nobody said AGI.

## Follow-ups
- Whether the picnic happens again next Sunday.
`,
  },
  {
    id: "call-with-mom",
    group: "personal",
    startedAt: day(4, 26, 30),
    placement: { daysAgo: 4, at: "19:30" },
    company: "A family call (fictional)",
    description: "Sample conversation: a call with Mom about p(doom). Invented people.",
    title: "Call with Mom: what a p(doom) is, explained",
    speakers: {
      mom: { name: "Mom", role: "Arjun's mom", rate: 1.9, gain: 1.0 },
      arjun: { name: "Arjun", role: "Works at an AI startup", rate: 2.1, gain: 1.04 },
    },
    turns: [
      ["mom", "Arjun, your friend posted his p(doom). Explain the doom number, please."],
      ["arjun", "Right, Mom. A p(doom) is a doom number. The chance things go badly with AI."],
      ["mom", "And your doom number is high?"],
      ["arjun", "Ten percent. That is low, Mom."],
      ["mom", "Ten percent doom sounds high to me. Your father's doom number is zero."],
      ["arjun", "Dad's doom number is zero because he thinks AGI is a printer brand."],
      ["mom", "Then the 996 grind. Your sister says you work the 996 grind now."],
      ["arjun", "Right. The 996 grind is nine to nine, six days a week. Only until demo day."],
      ["mom", "Is the 996 grind why you never call on Sundays?"],
      ["arjun", "Hmm."],
      ["mom", "No laptop at Thanksgiving. Not even for the 996 grind."],
      ["arjun", "Deal. No laptop, no doom number talk, extra pie."],
      ["mom", "Can you explain AGI to your grandmother at dinner?"],
    ],
    summary: `
Mom asked Arjun what a p(doom) is, and then about the hours he works.

## Threads
- **p(doom).** A doom number is the chance things go badly with AI. Arjun's is ten percent, which he calls low; Dad's is zero, because he thinks AGI is a printer brand.
- **The 996 grind.** Nine to nine, six days a week, until demo day. No laptop at Thanksgiving.

## Follow-ups
- Whether the 996 grind is why Arjun never calls on Sundays.
- Explaining AGI to his grandmother at dinner.
`,
  },
];
