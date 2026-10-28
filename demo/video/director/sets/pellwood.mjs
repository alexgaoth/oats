// The Pellwood launch review (the app's own sample): what each scene of the
// film looks for, and when (demo seconds from the recording's start).
export default {
  name: "pellwood",
  query: "",
  /** b-timelapse: the replay at six times from 0:20, up to here. */
  lapseUntil: 1056,
  /**
   * The film's time-lapse (director/bake-lapse.mjs), at demo times: speed in
   * clip seconds per film second (the replay's six times on top). Fast
   * through the first three topics; slow from 10:23 to 10:53, where the line
   * climbs back to the launch date (about 10:37); fast again; and down to 6x
   * where the Words scene picks up (17:32.6).
   */
  lapse: [
    { demo: 22, speed: 3 },
    { demo: 52, speed: 60 },
    { demo: 598, speed: 60 },
    { demo: 625, speed: 3.5 },
    { demo: 655, speed: 3.5 },
    { demo: 676, speed: 60 },
    { demo: 1018, speed: 60 },
    { demo: 1052.6, speed: 1 },
  ],
  /** Two clock readings off the take (clip seconds, demo seconds), for a take without "demo" cues. */
  lapseClock: [
    { clip: 1.0, demo: 22 },
    { clip: 173.1, demo: 1054 },
  ],
  /** d-questions: from where Words is chosen, and the question that meets "I don't know". */
  wordsFrom: 1052,
  unknownQuestion: "How long does the full migration take on production?",
  /** e-stop: the last question, then Stop. */
  stopFrom: 1738,
  stopAfter: 1750,
  /** The main conversation, as Recent shows it once written up, and its sample id. */
  mainTitle: "Enterprise launch review: SSO gates the date",
  mainSample: "launch-readiness-review",
  /** f-connections: the topic chosen in the lanes. */
  connectionsTopic: "soc audit",
  /** g-search: a term found in three conversations. */
  searchTerm: "import bug",
  /** h-global: a conversation in the arc timeline, one in the force graph, a subject chip, a tab. */
  arcsHover: "Design crit",
  forceHover: "Enterprise launch review",
  chip: "sso saml",
  tab: "Work",
};
