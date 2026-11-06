// The split of round 2 of the link benchmark (docs/link-eval.md, "Round 2").
//
// Series, not meetings: a team's meetings stay on one side. The twelve test
// series hold the three of the topic benchmark's test split (`AMI_TEST`:
// ES2004, IS1009, TS3003) and nine more, drawn once with a seeded generator
// (seed 20261105; 4 ES, 2 IS, 3 TS, to keep the corpus' mix). The movie club
// is the non-scenario test series, and the office meetings stay in tuning.
//
// A pair is a tuning pair when neither meeting is in a test series, and a test
// pair otherwise: a label on a pair that touches a test series was never read
// while tuning. Pairs with both meetings in test series are reported beside.

import { seriesOf } from "./link-truth.mjs";

export const LINK_TEST_SERIES = new Set([
  "ES2002",
  "ES2004",
  "ES2005",
  "ES2009",
  "ES2014",
  "IS1000",
  "IS1001",
  "IS1009",
  "TS3003",
  "TS3005",
  "TS3011",
  "TS3012",
  "IB-movies",
]);

/** A meeting's side of the split. */
export const splitOfMeeting = (id) => (LINK_TEST_SERIES.has(seriesOf(id)) ? "test" : "tune");

/** A pair's side of the split: "tune" only when neither meeting is a test meeting. */
export const splitOfPair = (pair) =>
  splitOfMeeting(pair.a) === "test" || splitOfMeeting(pair.b) === "test" ? "test" : "tune";

/** Both meetings in test series: the strict reading, reported beside. */
export const bothInTest = (pair) =>
  splitOfMeeting(pair.a) === "test" && splitOfMeeting(pair.b) === "test";
