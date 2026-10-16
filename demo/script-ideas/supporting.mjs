// The shorter conversations around the hacker house meeting, over the two
// weeks before it: office hours, a GPU poor support group, a pre-seed pitch,
// an eval sync, a coffee line and a demo day dry run. Placed on weekdays and
// filed in Work. They share subjects with the house meeting (vibe coding,
// demo day, founder mode, the 996 grind, AGI timelines, doom numbers), which
// is what Home's recent rows, search and the Global board draw on.
// "p(doom)" is said in exactly three conversations: the house meeting, the
// coffee line and the call with Mom (`personal.mjs`), so a search for it
// finds three. Every person and startup is invented.
//
// The same rules as the main conversation apply (see `main.mjs`): question
// marks and wh-words only on questions, short first replies, and each topic
// opened by two turns that share its nouns.

const day = (daysAgo, hours, minutes) => Date.UTC(2026, 9, 15 - daysAgo, hours, minutes, 0);

export default [
  {
    id: "yc-office-hours",
    group: "work",
    startedAt: day(12, 21, 0),
    placement: { daysAgo: 12, at: "14:00", weekdays: true },
    company: "A startup in the current batch (fictional)",
    description: "Sample conversation: office hours on a vibe coding startup. Invented people.",
    title: "YC office hours: vibe coding is the whole product",
    speakers: {
      hollis: { name: "Hollis", role: "Office hours mentor", rate: 2.0, gain: 1.0 },
      kai: { name: "Kai", role: "Founder, vibe coder", rate: 2.2, gain: 1.1 },
      sasha: { name: "Sasha", role: "Co-founder", rate: 2.15, gain: 1.02 },
    },
    turns: [
      ["hollis", "Okay, office hours. Vibe coding first. The vibe coding pitch."],
      ["kai", "Right. Vibe coding for teams. You describe the vibe, the agents write the code."],
      ["hollis", "Vibe coding is a feature, not a company."],
      ["kai", "Vibe coding was a feature until forty teams paid for it."],
      ["sasha", "Forty teams vibe coding, and nobody reads the diffs."],
      ["hollis", "Who reviews the code, then?"],
      ["kai", "A second agent, plus me on Fridays."],
      ["hollis", "Vibe coding with a second agent is still vibe coding."],
      ["kai", "Vibe coding with receipts. Every diff gets a summary."],
      ["hollis", "Then demo day. Demo day is in five weeks."],
      ["sasha", "Right. Demo day pitch: forty paying customers, growing ten percent a week."],
      ["hollis", "Lead with the forty customers. Demo day investors want traction."],
      ["kai", "So the demo day slide says traction in huge letters."],
      ["sasha", "Is a live demo too risky for demo day?"],
      ["hollis", "Hmm."],
      ["hollis", "Record a backup video for demo day, just in case."],
      ["kai", "Can we vibe code the demo day video too?"],
    ],
    summary: `
Hollis pushed Kai and Sasha on whether vibe coding is a product or a feature, and on the demo day pitch.

## Threads
- **Vibe coding.** Forty teams pay for vibe coding: you describe the vibe, agents write the code, and a second agent (plus Kai on Fridays) reviews the diffs. Hollis: still vibe coding.
- **Demo day.** Five weeks out. Lead with the forty paying customers and ten percent weekly growth: demo day investors want traction.

## Decisions Made
- The demo day slide leads with traction.

## Action Items
- [ ] Kai: record a backup video of the demo.

## Follow-ups
- Whether a live demo is too risky for demo day.
- Whether the demo day video can be vibe coded too.
`,
  },
  {
    id: "gpu-poor-support-group",
    group: "work",
    startedAt: day(9, 18, 0),
    placement: { daysAgo: 9, at: "11:00", weekdays: true },
    company: "A GPU-poor indie lab (fictional)",
    description: "Sample conversation: a GPU poor support group. Invented people.",
    title: "GPU poor support group: eight GPUs and a dream",
    speakers: {
      ollie: { name: "Ollie", role: "Runs a GPU-poor indie lab", rate: 2.0, gain: 1.12 },
      noor: { name: "Noor", role: "Post-training engineer", rate: 1.95, gain: 0.96 },
      jasper: { name: "Jasper", role: "Founder", rate: 2.05, gain: 1.04 },
    },
    turns: [
      ["ollie", "Okay, GPU poor support group. Hi, I'm Ollie, and I am GPU poor."],
      ["noor", "Hi, Ollie. GPU poor is the first step. Admit the GPU count."],
      ["ollie", "Eight GPUs. One GPU is cursed. The cursed one is Gerald."],
      ["jasper", "How cursed is Gerald?"],
      ["ollie", "Gerald crashes every third run."],
      ["noor", "GPU poor tip: quantize everything, then quantize the quantized thing."],
      ["ollie", "GPU poor and quantized. A lifestyle."],
      ["jasper", "GPU poor is temporary. Unless it is permanent."],
      ["noor", "Then the bitter lesson, the sad part."],
      [
        "ollie",
        "Right. The bitter lesson says more compute wins. The bitter lesson has never met Gerald.",
      ],
      ["jasper", "The bitter lesson is a lot of pressure for eight GPUs."],
      ["noor", "The bitter lesson for the GPU poor: be clever until you can afford not to."],
      ["ollie", "Did Sutton say anything about Gerald?"],
      ["noor", "No idea, honestly."],
      ["jasper", "The bitter lesson, chapter two: raise a round, buy GPUs."],
      ["ollie", "Can the support group chip in for a ninth GPU?"],
    ],
    summary: `
Ollie admitted the GPU count at the GPU poor support group, and Noor and Jasper talked him through the bitter lesson.

## Threads
- **GPU poor.** Eight GPUs, one cursed (Gerald, who crashes every third run). Survival tip: quantize everything, then quantize again.
- **The bitter lesson.** More compute wins, which is a lot of pressure on eight GPUs. Noor's version for the GPU poor: be clever until you can afford not to.

## Follow-ups
- Whether the support group chips in for a ninth GPU.
`,
  },
  {
    id: "pre-seed-pitch",
    group: "work",
    startedAt: day(7, 22, 30),
    placement: { daysAgo: 7, at: "15:30", weekdays: true },
    company: "A pre-seed startup (fictional)",
    description: "Sample conversation: a pre-seed pitch to an angel. Invented people.",
    title: "Pre-seed pitch: founder mode, but make it 996",
    speakers: {
      margo: { name: "Margo", role: "Angel investor", rate: 2.05, gain: 0.98 },
      sasha: { name: "Sasha", role: "Founder", rate: 2.15, gain: 1.02 },
      jasper: { name: "Jasper", role: "Co-founder", rate: 2.05, gain: 1.04 },
    },
    turns: [
      ["margo", "Okay, pre-seed pitch. Founder mode questions first."],
      ["sasha", "Right. Founder mode, full time. Founder mode is the whole plan."],
      ["margo", "Founder mode sounds great until the founder needs sleep."],
      ["jasper", "Sasha in founder mode reads every pull request. Every one."],
      ["margo", "Does founder mode scale past ten people?"],
      ["sasha", "Hmm."],
      ["sasha", "Founder mode scales with good evals. Founder mode with dashboards."],
      ["margo", "Then the 996 grind. Your deck says 996 on the culture slide."],
      ["sasha", "Right. The 996 grind is optional. The 996 grind is also expected."],
      ["jasper", "The 996 grind with a Sunday off. We call it 995."],
      ["margo", "Investors love a 996 grind on the slide, and hate it in the burn rate."],
      ["margo", "How much runway does the 996 grind buy?"],
      ["sasha", "Eighteen months, at ramen prices."],
      ["jasper", "That runway covers the 996 grind until the launch."],
      ["margo", "Send me the founder mode deck, minus the 996 slide."],
    ],
    summary: `
Margo heard Sasha and Jasper's pre-seed pitch: founder mode is the whole plan, and the deck has a 996 slide.

## Threads
- **Founder mode.** Sasha reads every pull request. Whether founder mode scales past ten people got no answer.
- **The 996 grind.** Optional, and also expected; with a Sunday off it is 995. Margo: investors love it on the slide and hate it in the burn rate. Eighteen months of runway at ramen prices.

## Action Items
- [ ] Sasha: send Margo the deck, without the 996 slide.
`,
  },
  {
    id: "eval-sync",
    group: "work",
    startedAt: day(5, 17, 0),
    placement: { daysAgo: 5, at: "10:00", weekdays: true },
    company: "A hacker house in San Francisco (fictional)",
    description: "Sample conversation: an eval sync on a leaky agent benchmark. Invented people.",
    title: "Eval sync: is the agent AGI-pilled, or just overfit",
    speakers: {
      noor: { name: "Noor", role: "Post-training engineer", rate: 1.95, gain: 0.96 },
      ravi: { name: "Ravi", role: "Safety researcher", rate: 1.85, gain: 0.9 },
      kai: { name: "Kai", role: "Vibe coder", rate: 2.2, gain: 1.1 },
    },
    turns: [
      ["noor", "Okay, sync on the agent evals. Agent evals first."],
      ["ravi", "Right. The agent evals look great. Too great."],
      ["kai", "Too great means the agent evals leaked into training."],
      ["noor", "Or the agent is AGI-pilled."],
      ["ravi", "The agent is not AGI-pilled. The agent is overfit."],
      ["noor", "Did the agent evals leak?"],
      ["kai", "Yes, the test set was public."],
      ["kai", "Leaked agent evals, private shame."],
      ["noor", "Fresh agent evals by Friday, held out properly."],
      ["ravi", "Separate thing. My AGI timeline moved."],
      ["ravi", "Right. My AGI timeline was 2030. The leak made it 2031."],
      ["kai", "Your AGI timeline goes up every time an eval leaks."],
      ["noor", "AGI timelines are sensitive to leaks. Noted."],
      ["ravi", "My AGI timeline is 2031 until the fresh evals land."],
      ["kai", "Will the fresh evals be ready by Friday?"],
    ],
    summary: `
Noor, Ravi and Kai found out why the agent evals looked too good, and Ravi moved his AGI timeline.

## Threads
- **Agent evals.** The scores were too good: the test set was public. Not AGI-pilled, just overfit. Fresh, properly held-out evals by Friday.
- **AGI timeline.** Ravi's AGI timeline went from 2030 to 2031 after the leak, until the fresh evals land.

## Action Items
- [ ] Noor: fresh held-out agent evals by Friday.

## Follow-ups
- Whether the fresh evals are ready by Friday.
`,
  },
  {
    id: "hayes-valley-coffee-line",
    group: "work",
    startedAt: day(3, 15, 30),
    placement: { daysAgo: 3, at: "08:30", weekdays: true },
    company: "A hacker house in San Francisco (fictional)",
    description: "Sample conversation: doom numbers in a coffee line. Invented people.",
    title: "Hayes Valley coffee line: everyone's p(doom), ranked",
    speakers: {
      bea: { name: "Bea", role: "Designer", rate: 1.9, gain: 0.84 },
      ravi: { name: "Ravi", role: "Safety researcher", rate: 1.85, gain: 0.9 },
      jasper: { name: "Jasper", role: "Founder", rate: 2.05, gain: 1.04 },
    },
    turns: [
      ["bea", "Okay, coffee line game. Everyone's p(doom). Doom numbers, out loud."],
      ["ravi", "Right. My p(doom) is fifteen. Doom number fifteen, oat milk."],
      ["jasper", "My doom number is five. Five and a cortado."],
      ["bea", "The barista's p(doom) is clearly higher than ours."],
      ["ravi", "Doom numbers in a coffee line. Peak Hayes Valley."],
      ["bea", "What's the doom number of the guy behind us?"],
      ["ravi", "Forty, judging by the laptop stickers."],
      ["jasper", "That's a decel doom number. Respect, though."],
      ["ravi", "Then AGI timelines, for the walk back."],
      ["jasper", "Right. AGI timeline, 2027. My AGI timeline has not moved."],
      ["bea", "Your AGI timeline never moves. It's a tattoo."],
      ["ravi", "My AGI timeline is 2030, and my doom number goes with it."],
      ["bea", "Is it rude to ask a barista for their AGI timeline?"],
      ["jasper", "No idea, honestly."],
      ["jasper", "Next time we ask the barista for an AGI timeline and a doom number."],
    ],
    summary: `
Bea turned the Hayes Valley coffee line into a p(doom) ranking, then the walk back into AGI timelines.

## Threads
- **p(doom).** Ravi's doom number is fifteen (oat milk), Jasper's five (cortado). The guy behind them: forty, judging by the laptop stickers.
- **AGI timelines.** Jasper's AGI timeline is still 2027 and never moves; Ravi's is 2030, and his doom number goes with it.

## Follow-ups
- Whether it is rude to ask a barista for their AGI timeline.
`,
  },
  {
    id: "demo-day-dry-run",
    group: "work",
    startedAt: day(1, 24, 30),
    placement: { daysAgo: 1, at: "17:30", weekdays: true },
    company: "A startup in the current batch (fictional)",
    description: "Sample conversation: a demo day dry run. Invented people.",
    title: "Demo day dry run: the moat is vibes",
    speakers: {
      sasha: { name: "Sasha", role: "Founder", rate: 2.15, gain: 1.02 },
      kai: { name: "Kai", role: "Co-founder, vibe coder", rate: 2.2, gain: 1.1 },
      bea: { name: "Bea", role: "Designer", rate: 1.9, gain: 0.84 },
    },
    turns: [
      ["sasha", "Okay, demo day dry run. Demo day pitch, from the top."],
      ["kai", "Right. Demo day, two minutes, no notes."],
      ["sasha", "Demo day pitch: agents that take your sales calls while you sleep."],
      ["bea", "Demo day slide three is too busy. One number per slide."],
      ["kai", "What's the moat, in one word?"],
      ["sasha", "Taste, and also distribution."],
      ["bea", "Demo day rule: one moat per slide, max."],
      ["kai", "Then vibe coding. The live vibe coding part."],
      ["kai", "Right. Vibe coding live, on stage. The agent builds a feature in ninety seconds."],
      ["bea", "So the real moat is vibes. Literally vibe coding."],
      ["bea", "Vibe coding live is either legendary or a postmortem."],
      ["sasha", "Did the vibe coding run work in rehearsal?"],
      ["kai", "Twice out of five."],
      ["kai", "Two out of five vibe coding runs. Good enough for demo day."],
      ["bea", "Vibe coding plan B: the backup video."],
      ["sasha", "Should the backup video be vibe coded too?"],
    ],
    summary: `
Sasha, Kai and Bea ran the demo day pitch from the top, and argued about vibe coding live on stage.

## Threads
- **Demo day.** Two minutes, no notes, one number per slide. The moat, in one word: taste, and also distribution.
- **Vibe coding.** The agent builds a feature live in ninety seconds, so the real moat is vibes. It worked twice out of five in rehearsal; plan B is a backup video.

## Decisions Made
- One number per slide, and one moat per slide.

## Follow-ups
- Whether the backup video should be vibe coded too.
`,
  },
];
