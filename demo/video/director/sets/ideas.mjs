// The "ideas" set: a San Francisco hacker house (AGI timelines, p(doom), vibe
// coding, founder mode), demo/script-ideas/, harness `set=ideas`. Demo times
// (seconds from Record) come from the builder's report (`--set ideas
// --report`): topics agi timeline 0:03, doom number 3:39, vibe coding 6:50,
// gpu poor 9:08, the return to agi timeline 10:43, founder mode 12:06, demo
// day 15:50; "What's the moat?" answered 17:22; "When is AGI?" met with "I
// don't know" 18:01; the last question 28:53; Stop at 29:03.
export default {
  name: "ideas",
  query: "set=ideas",
  lapseUntil: 1034,
  // From 0:23: the take's seek to 0:20 lands about 1.0 s in, and earlier
  // frames still show 0:00. Fast through the first topics; slow from 10:28
  // to 10:58 around the return to agi timeline (10:43).
  lapse: [
    { demo: 23, speed: 3 },
    { demo: 52, speed: 60 },
    { demo: 601, speed: 60 },
    { demo: 628, speed: 3.5 },
    { demo: 658, speed: 3.5 },
    { demo: 679, speed: 60 },
    { demo: 996, speed: 60 },
    { demo: 1030.6, speed: 1 },
  ],
  lapseClock: null,
  wordsFrom: 1030,
  unknownQuestion: "When is AGI?",
  stopFrom: 1724,
  stopAfter: 1736,
  mainTitle: "Hacker house: AGI by 2027, and who is actually cracked",
  mainSample: "hacker-house",
  connectionsTopic: "demo day",
  searchTerm: "p(doom)",
  arcsHover: "Pre-seed pitch",
  forceHover: "Call with Mom",
  chip: "doom number",
  tab: "Work",
};
