// The "ideas" set: a research reading group (RL, philosophy, the new labs,
// tech news), demo/script-ideas/, harness `set=ideas`. Demo times (seconds
// from Record) come from the builder's report (`--set ideas --report`):
// topics reward hacking 0:04, verifiable reward 3:42, credit assignment 6:59,
// test-time compute 9:19, the return to reward hacking 10:46, personal
// identity 12:18, new labs 15:59, "So what is Tinker, concretely?" answered
// 17:32, "When did Periodic Labs launch?" met with "I don't know" 18:16, the
// last question 28:55, Stop at 29:04.
export default {
  name: "ideas",
  query: "set=ideas",
  lapseUntil: 1044,
  /** Fast through the first three topics; slow from 10:31 to 11:01 around the return (10:46). */
  // From 0:23: the take's seek to 0:20 lands about 1.0 s in, and earlier
  // frames still show 0:00.
  lapse: [
    { demo: 23, speed: 3 },
    { demo: 52, speed: 60 },
    { demo: 604, speed: 60 },
    { demo: 631, speed: 3.5 },
    { demo: 661, speed: 3.5 },
    { demo: 682, speed: 60 },
    { demo: 1006, speed: 60 },
    { demo: 1040.6, speed: 1 },
  ],
  lapseClock: null,
  wordsFrom: 1040,
  unknownQuestion: "When did Periodic Labs launch?",
  stopFrom: 1726,
  stopAfter: 1738,
  mainTitle: "Reading group: reward hacking spreads, and a prompt contains it",
  mainSample: "reading-group",
  connectionsTopic: "new labs",
  searchTerm: "reward hacking",
  arcsHover: "Eval design",
  forceHover: "Wen check-in",
  chip: "reward hacking",
  tab: "Work",
};
