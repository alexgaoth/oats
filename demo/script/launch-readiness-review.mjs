// The main sample conversation: a launch readiness review at Pellwood, a
// fictional 40-person company that sells month-end close software to finance
// teams and is about to launch an enterprise tier. Every company, product and
// person in it is invented.
//
// Written as Whisper would transcribe a room: short turns, interruptions as
// turns of their own, a few fillers. `demo/build-fixtures.mjs` records it
// through the app's pipeline; `--report` prints what the pipeline made of
// every turn.
//
// Turn options: `loud` raises the voice (the contour's peaks are the two
// arguments), `cut` starts on the last speaker's heels, `mark` presses Mark
// during the turn.
//
// The app reads these words literally, so they follow its rules:
//   - Only questions carry a question mark or a wh-word (what, why, how,
//     which, who, where, when): the aide makes a card for every one.
//   - The turn after a question decides how it came out: an answer of four
//     words or more (Answered), "I don't know" or "no idea" (Unknown), "Hmm."
//     (Unanswered). The last question is asked as the meeting breaks up and
//     gets no reply (Open). First replies are short, so they land well inside
//     the aide's eight seconds.
//   - The topic tracker follows shared nouns (`conversationTopics.mjs`). A
//     topic opens with two turns that share theirs; inside a topic every
//     longer turn carries some of them; the room comes back to a topic by
//     naming it. Asides that share no nouns with the next turn are folded
//     into the topic they interrupt.
//   - No "press": the tracker drops the final s of long words, and the label
//     would read "pres". The announcement is about the news embargo.

export default {
  id: "launch-readiness-review",
  // When the fixture was generated; placing it moves every time in it.
  startedAt: Date.UTC(2026, 9, 12, 16, 0, 0),
  placement: { endedAgoMinutes: 120 },
  company: "Pellwood (fictional)",
  description:
    "Sample conversation: a 30-minute launch readiness review at Pellwood, a fictional software company. Nine invented people.",
  title: "Enterprise launch review: SSO gates the date",
  speakers: {
    maya: { name: "Maya", role: "Product lead, chairs the review", rate: 2.02, gain: 1.04 },
    theo: { name: "Theo", role: "Engineering lead", rate: 1.85, gain: 1.0 },
    ines: { name: "Ines", role: "Backend engineer", rate: 2.14, gain: 0.92 },
    jun: { name: "Jun", role: "Product designer", rate: 1.71, gain: 0.72 },
    ruth: { name: "Ruth", role: "Security lead", rate: 1.8, gain: 0.9 },
    marcus: { name: "Marcus", role: "Head of sales", rate: 2.19, gain: 1.18 },
    grace: { name: "Grace", role: "Support lead", rate: 1.95, gain: 0.95 },
    omar: { name: "Omar", role: "Data analyst", rate: 1.75, gain: 0.78 },
    lena: { name: "Lena", role: "Marketing lead", rate: 2.09, gain: 1.02 },
  },
  turns: [
    // --- The launch date.
    [
      "maya",
      "Okay, launch readiness review for Pellwood Enterprise. The launch date on the plan is still Tuesday the 3rd.",
    ],
    [
      "maya",
      "By the end of this, either we confirm the launch date, or we know the one thing that would move the date.",
    ],
    [
      "maya",
      "The launch checklist is at nineteen of twenty-three. The four open launch items are all on today's agenda.",
    ],
    ["lena", "And the launch page copy is done, pending the final launch date."],
    ["maya", "Theo, short version from engineering first, then we go topic by topic."],
    ["theo", "Sure. Most of the launch scope is done."],
    [
      "theo",
      "Billing, the activity log, the new admin console. All merged, all on staging since Friday.",
    ],
    [
      "theo",
      "Load testing came back green on Sunday. Four times the beta traffic, and staging held up fine.",
    ],
    ["theo", "So the launch scope itself is in good shape for the 3rd."],
    ["theo", "There's one item that worries me, and I'll get to it in a minute."],
    ["lena", "Is Tuesday the 3rd the date I should plan around?"],
    ["maya", "For now, yes. We lock it on Friday."],
    ["maya", "We lock the launch date right after this review and the board meeting."],
    [
      "marcus",
      "And the launch date really matters on my side. Three signed customers have kickoffs booked the week of the 3rd.",
    ],
    ["marcus", "If the launch slips, I'm the one calling them. One of those kickoffs is Corbel."],
    ["maya", "Understood. Grace, Lena, raise anything that hangs on the exact launch date."],
    [
      "grace",
      "Only the help articles. They go live with the launch, and I'd like a day of buffer before the launch date.",
    ],
    [
      "lena",
      "Same here. Everything on my side hangs on the launch date, so the earlier we lock it, the better.",
    ],
    [
      "lena",
      "My whole launch calendar says the 3rd. Moving the date costs me a few awkward emails, but it's doable.",
    ],
    ["maya", "Okay. Theo, go ahead. The item that worries you."],

    // --- SSO, the blocker.
    ["theo", "Right. The real blocker is SSO. SAML login, specifically."],
    [
      "theo",
      "SAML login works with two of our three identity providers. SSO on the third provider fails.",
    ],
    [
      "theo",
      "It fails on signed assertions. The identity provider sends a perfectly valid response, we reject it, and the user lands back on the login page.",
    ],
    ["ruth", "And that third identity provider is the one most of the big prospects use."],
    ["maya", "Walk us through the SSO failure. Ines, you found it."],
    ["ines", "Yeah. The SAML failure is clock skew, mostly."],
    [
      "ines",
      "Their SAML assertions arrive a few seconds early, and our SAML library rejects anything early.",
      { mark: { after: 1.7 } },
    ],
    [
      "ines",
      "So an assertion stamped three seconds in the future counts as invalid, and the SSO login fails.",
    ],
    [
      "theo",
      "We can loosen that. The SSO fix itself is small. Testing it against every identity provider is the slow part.",
    ],
    [
      "theo",
      "Each identity provider wants its own test tenant, and the third one took us nine days to set up.",
    ],
    [
      "marcus",
      "Nine days just to get a test tenant. That identity provider is not exactly in a hurry.",
    ],
    [
      "theo",
      "The SSO fix is on a branch already. Twelve lines, plus a setting for the SAML clock tolerance.",
    ],
    [
      "ines",
      "And the SAML library added the same clock tolerance setting last month, so we're not inventing anything.",
    ],
    [
      "jun",
      "Um, the SSO setup screen in the admin console is ready, by the way. Admins upload the SAML metadata file and test the connection.",
    ],
    ["theo", "Nice. Thanks, Jun."],
    [
      "jun",
      "If the SAML test fails, the setup screen shows the raw SAML error, though. Admins will hate that.",
    ],
    [
      "ruth",
      "Just so everyone hears it, I won't sign off on SSO until the signed assertion fix has been through a security review.",
    ],
    ["theo", "Totally fair."],
    [
      "ruth",
      "Loosening clock tolerance on SAML is exactly the kind of change that opens a replay window.",
    ],
    [
      "ruth",
      "So two minutes of SAML clock tolerance, max, logged, and an alert on any skew above thirty seconds.",
    ],
    ["ines", "Two minutes is fine. Most of the clock skew we saw was under ten seconds."],
    [
      "ines",
      "One test tenant drifted forty seconds, but that was a misconfigured clock on their side, not ours.",
    ],
    [
      "ruth",
      "I also want every SSO login in the activity log, successes and failures, with the identity provider.",
    ],
    ["theo", "Fair. Logging SSO login events is an hour of work."],
    ["theo", "Ines and I can pair on the SSO fix tomorrow, so the SSO review starts early."],
    ["theo", "So the SSO fix lands by Thursday the 29th, if nothing else catches fire."],
    ["theo", "Then Ruth needs two days for the SSO review."],
    ["ruth", "Two working days for the SSO review. So Monday the 2nd, at the earliest."],
    ["marcus", "That's one day of slack. Zero, really."],
    ["theo", "Yeah. It's tight."],
    [
      "ruth",
      "And SCIM provisioning is out of scope. SSO login only, accounts still get created by hand.",
    ],
    ["theo", "Right. SCIM can wait for next quarter."],
    ["marcus", "Corbel won't care about SCIM. Corbel cares about SSO login on day one."],

    // --- SOC 2, which SSO branches into.
    ["ruth", "Another dependency. The SOC 2 audit."],
    ["ruth", "The SOC 2 audit window closes on the 31st, and SSO is in scope for the audit."],
    [
      "ruth",
      "The SOC 2 readiness check flagged two audit gaps. Both are closed now, with evidence.",
    ],
    [
      "ruth",
      "The SOC 2 audit covers May through October. Six months of evidence, and most of it is in good shape.",
    ],
    ["marcus", "Do we have a date from the auditors yet?"],
    ["ruth", "I don't know yet."],
    ["ruth", "Kestrel still hasn't confirmed the SOC 2 audit fieldwork dates."],
    ["ruth", "They said this week. I've asked twice."],
    [
      "ruth",
      "And the SOC 2 report won't exist until December. Kestrel writes the audit report after the window closes.",
    ],
    ["lena", "Can we mention SOC 2 in the announcement?"],
    ["ruth", "Hmm."],
    [
      "marcus",
      "December is way too late for the SOC 2 report. Every security questionnaire asks for it.",
      { loud: 1.3 },
    ],
    [
      "marcus",
      "Corbel's procurement team asked for the SOC 2 report last Thursday. Arden asked on Monday.",
    ],
    [
      "ruth",
      "Right, but there's a bridge letter. The audit firm can issue a bridge letter that covers the gap until the SOC 2 report lands.",
    ],
    ["maya", "So the bridge letter has to cover us until the SOC 2 report lands."],
    ["ruth", "For most buyers, it will."],
    [
      "ruth",
      "Corbel's security team accepted a bridge letter from their last vendor. Arden, I honestly can't say.",
    ],
    ["marcus", "Arden's security team is stricter than Corbel's, for the record."],
    ["ruth", "But Kestrel only issues the bridge letter once the audit fieldwork starts."],
    ["marcus", "So the SOC 2 report and the bridge letter both wait on the audit firm."],
    ["ruth", "Pretty much. The audit firm is the bottleneck for the whole SOC 2 timeline."],
    ["ruth", "If the audit slips into November, the bridge letter slips with it."],
    ["marcus", "Okay. So we need the auditors on site before the 3rd."],
    ["ruth", "Ideally the week before. I'll chase Kestrel on the fieldwork dates again today."],

    // --- Back to the launch date, the first time. The first argument.
    ["maya", "So does any of this move the launch date?"],
    ["theo", "Honestly, I'd push it a week."],
    ["marcus", "A week. Theo, three customers have kickoffs that week.", { loud: 1.8 }],
    ["theo", "And I'd rather move a kickoff than launch something half-broken.", { loud: 1.75 }],
    [
      "marcus",
      "It's not half-broken. It's one edge case for one group of customers.",
      { loud: 2.05, cut: true },
    ],
    ["theo", "An edge case your biggest customers live in, Marcus.", { loud: 1.9, cut: true }],
    ["marcus", "Then we fix the edge case. We don't move the launch for it.", { loud: 1.95 }],
    ["maya", "Okay, okay. Hold on.", { loud: 1.6 }],
    ["grace", "Honestly, a calm launch beats a fast launch."],
    ["maya", "Nobody is deciding the launch date in the next two minutes."],
    ["maya", "Let's get the full picture first, and come back to the launch date at the end."],
    ["marcus", "Fine."],
    ["theo", "Fine by me."],

    // --- Enterprise pricing and discounts. The second argument.
    ["maya", "Okay. Discounts, list pricing, seat minimums, and the enterprise tier."],
    ["marcus", "Pricing first, then discounts."],
    [
      "marcus",
      "The enterprise list price is forty-eight dollars a seat per month, fifty seat minimum, billed annually.",
    ],
    [
      "marcus",
      "And the list price is working. Nobody has pushed back on forty-eight, and the new pricing page converts better than the old one.",
    ],
    [
      "marcus",
      "The two big incumbents charge sixty-five and seventy a seat, so the enterprise pricing is an easy conversation.",
    ],
    ["marcus", "The pricing isn't the problem. Discounts are."],
    ["marcus", "I have three enterprise deals asking for a forty percent discount."],
    ["maya", "Forty percent is not a discount. That's a different price.", { loud: 1.5 }],
    [
      "marcus",
      "It's a different price for logos we need on the website.",
      { loud: 1.65, cut: true },
    ],
    [
      "maya",
      "We agreed the enterprise discount cap was twenty-five percent. In September. All of us.",
      { loud: 1.55 },
    ],
    [
      "marcus",
      "We agreed that cap before Greywater asked for three hundred seats.",
      { loud: 1.75 },
    ],
    [
      "marcus",
      "Three hundred seats at list price is a hundred and seventy thousand a year. Even with forty percent off, it's the biggest deal we've ever signed.",
      { loud: 1.45 },
    ],
    [
      "maya",
      "And it sets the pricing for every finance team that hears about it. Discounts leak, Marcus.",
      { loud: 1.4 },
    ],
    ["jun", "Sorry, are these discounts on the seat price or on the whole contract?"],
    ["marcus", "On the seat price only."],
    ["marcus", "The platform fee always stays at list price. Eight thousand a year, flat."],
    ["maya", "Okay, let's make the discount concrete. What's the floor on the discount?"],
    ["marcus", "Twenty-five percent standard, thirty with a two-year term."],
    ["marcus", "Anything deeper comes to you and finance, deal by deal."],
    [
      "maya",
      "I can live with that discount floor. Thirty with a two-year term, and nothing deeper without a signed case study.",
    ],
    ["marcus", "A case study I can get. Greywater already offered one."],
    [
      "maya",
      "Then Greywater gets thirty percent and a two-year term, and the rest of the discount waits for the case study.",
    ],
    [
      "marcus",
      "And Arden offered a three-year term in exchange for the discount. That one I actually like.",
    ],
    [
      "maya",
      "A three-year term changes the discount math. Bring me the Arden numbers before you agree to anything.",
    ],
    ["marcus", "Deal. I'll put the discount floor in the pricing doc today."],
    [
      "marcus",
      "One more pricing thing. Halden wants monthly pricing instead of annual billing, and the pricing doc doesn't allow it.",
    ],
    [
      "maya",
      "Good. Annual billing stays in the pricing. Monthly billing lost us money on the old pricing model.",
    ],
    [
      "omar",
      "For reference, the median discount across the beta conversions was eighteen percent.",
    ],
    ["marcus", "Eighteen percent. Good, that helps the pricing story."],
    ["maya", "How many of the enterprise deals in the pipeline need SSO?"],
    ["marcus", "Six of the nine."],
    [
      "marcus",
      "Corbel and Arden both made it a hard requirement in the contract. The other four deals would take it in December.",
    ],

    // --- Back to SSO: the flag.
    ["maya", "Okay, back to SSO and that third identity provider, then."],
    ["marcus", "Can we ship SSO behind a flag?"],
    ["theo", "Yes, with a per-workspace flag."],
    [
      "theo",
      "We turn SSO on for those six accounts and leave the flag off for everyone else.",
      {
        mark: { after: 1.9, note: "SSO behind a per-workspace flag, on for the six accounts only" },
      },
    ],
    [
      "ruth",
      "I'm fine with an SSO flag, as long as the security review still happens before any of the six switch it on.",
    ],
    ["theo", "Agreed. The SSO flag doesn't skip the security review."],
    [
      "ines",
      "And the flag gives us an off switch. If the third identity provider still misbehaves, we flip that account back to passwords.",
    ],
    ["maya", "Good. That takes some pressure off."],

    // --- Data migration risk.
    ["maya", "Okay, data migration risk."],
    ["ines", "Right. The data migration is the big one for me."],
    ["ines", "The data migration moves every existing workspace onto the new permissions model."],
    [
      "ines",
      "We ran the data migration twice on a copy of production. 1,140 workspaces, three hours and twenty minutes end to end.",
    ],
    ["ines", "Four workspaces failed the data migration twice, all on orphaned records."],
    [
      "ines",
      "The orphaned records come from the old sharing feature. We delete them before the data migration, with a backup.",
    ],
    ["theo", "Those four we can fix by hand before the data migration starts."],
    ["ruth", "What's the rollback if the migration fails halfway?"],
    ["ines", "Every workspace gets its own snapshot."],
    [
      "ines",
      "The snapshot is taken right before that workspace migrates, and restoring one workspace takes about four minutes.",
    ],
    [
      "theo",
      "And we migrate fifty at a time, so a failure stops fifty, not the whole data migration.",
    ],
    ["maya", "How long does the full migration take on production?"],
    ["ines", "Honestly, I don't know."],
    [
      "ines",
      "We've never run the data migration on the three biggest data sets, ten times the size of the copy.",
    ],
    ["theo", "That's the real risk with the migration. The data volume, not the code."],
    [
      "ines",
      "Greywater alone has four million ledger rows. The copy we tested the migration on had nothing close.",
    ],
    [
      "ines",
      "I can run the three biggest data sets on a separate copy this week, and have real migration numbers by Thursday.",
    ],
    [
      "maya",
      "Do that. And if the migration runs long, it happens on Saturday, with the old model still readable.",
    ],
    [
      "ines",
      "Makes sense. We'd start the migration Saturday morning and keep the old permissions model readable during the migration.",
    ],
    [
      "theo",
      "Each workspace goes read-only for about ten minutes while it migrates, with a migration banner instead of an error.",
    ],
    ["theo", "And we watch the migration on a dashboard. Error rate, batch time, data copied."],
    ["theo", "The migration dashboard pages me if the error rate passes one percent."],
    [
      "grace",
      "Every workspace owner gets an email about the migration window, with the read-only times.",
    ],
    ["ruth", "And keep the migration snapshots for thirty days after. Auditors will ask."],
    [
      "ines",
      "Thirty days of snapshots is fine. Snapshot storage is cheap compared to a failed migration.",
    ],
    [
      "ines",
      "The permissions migration is the only step with no undo button, apart from the snapshots.",
    ],

    // --- Support staffing that week.
    ["maya", "Okay, support staffing and the support queue."],
    [
      "grace",
      "Right. Support staffing is my biggest worry. We have four support agents, and two are out that week.",
    ],
    ["grace", "One support agent is on parental leave, and one is at her sister's wedding."],
    [
      "grace",
      "So two support agents cover the enterprise queue and the regular queue, in the busiest support week of the year.",
    ],
    [
      "grace",
      "Last launch, support tickets tripled in the first two days, and the support queue never really recovered that week.",
    ],
    ["maya", "Who's on call for support escalations that week?"],
    ["theo", "Ines and me as primary."],
    ["theo", "Ruth backs us up on support escalations, in shifts."],
    ["grace", "That covers engineering. I still need people on the support queue in the evenings."],
    ["grace", "Can engineering cover the evening support queue that week?"],
    ["theo", "Hmm."],
    [
      "maya",
      "Let's take the evening support queue offline. Grace, send me the gaps in the support schedule.",
    ],
    ["grace", "Will do. And I want support macros written before the 3rd, for the support agents."],
    [
      "grace",
      "I'll pull the support tickets from the last launch, so the support macros match real tickets.",
    ],
    [
      "grace",
      "Last launch the support agents answered setup questions with screenshots. This time every support macro links to the setup guide.",
    ],
    ["grace", "And the support queue gets a priority lane for the six SSO accounts."],
    ["maya", "Good. A priority lane in the support queue makes sense."],
    [
      "grace",
      "I'd also like an engineer in the support channel the first morning, to unblock the support agents fast.",
    ],
    [
      "maya",
      "That one's easy. Theo, put an engineer in the support channel, for the support queue.",
    ],
    ["theo", "Done. Ines covers the first support morning, I cover the afternoon."],
    [
      "grace",
      "And the support agents get a half-day of SSO training on Thursday, so the support queue isn't learning live.",
    ],

    // --- Beta feedback: the import bug.
    ["maya", "Beta feedback and the import bug."],
    [
      "jun",
      "The beta feedback is mostly good, apart from the import bug. Large CSV files time out, and the import screen just says something went wrong.",
    ],
    ["maya", "How many beta accounts hit the import bug?"],
    ["omar", "Fourteen of the 212 beta accounts."],
    [
      "omar",
      "Eleven of those were importing CSV files over 50,000 rows. The other three had a byte order mark in the CSV file.",
    ],
    [
      "ines",
      "And the import bug isn't really a timeout. The importer drops the last chunk of any CSV file bigger than one upload chunk.",
    ],
    [
      "ines",
      "So the import says it failed, but most rows actually landed. Partial imports that look complete.",
    ],
    ["ruth", "Did any of those beta accounts lose data for good?"],
    ["omar", "No idea, honestly."],
    ["omar", "I only have the import error logs, not the customer data."],
    ["ines", "I can check. We keep the raw CSV uploads, so we can replay all fourteen imports."],
    ["ines", "The import fix merged, and the fixed importer is in release candidate three."],
    [
      "theo",
      "And we added a test with a sixty thousand row CSV file, so the import bug can't come back quietly.",
    ],
    [
      "maya",
      "Good. Replay the fourteen imports this week, and the import error needs a clearer message.",
    ],
    ["jun", "Agreed. I'll have new copy for the import error message tomorrow."],
    [
      "grace",
      "Send the new copy to me too. Half of those fourteen customers opened tickets about the import bug.",
    ],
    [
      "ines",
      "Halden Freight hit the import bug three times in one week. They're the loudest of the fourteen.",
    ],
    [
      "grace",
      "Halden opened four support tickets about the import bug. The last import ticket was not friendly.",
    ],
    ["maya", "Then Halden gets a personal email about the import fix, from me, today."],
    [
      "theo",
      "And the import progress bar will show rows imported, so a partial import is visible.",
    ],

    // --- Announcement timing.
    ["maya", "The announcement, then, and the news embargo."],
    ["lena", "Right. For the announcement, I'd move the news embargo to Wednesday."],
    [
      "lena",
      "The analyst briefing is on Tuesday, so the news should land after the briefing, on Wednesday.",
    ],
    [
      "lena",
      "So the news embargo lifts at nine on Wednesday the 4th. Customers get access on the 3rd, and the announcement goes out on the 4th.",
    ],
    ["marcus", "So customers get a quiet day before the news hits. I like that, actually."],
    ["lena", "Exactly. And the news story has real quotes in it."],
    ["lena", "Two trade outlets have the story under the news embargo already."],
    ["maya", "Good. Keep those trade outlets close."],
    ["lena", "Legal approved two of the quotes for the news story."],
    [
      "lena",
      "The blog post and the customer email are ready. The news release is with legal until Thursday.",
    ],
    [
      "lena",
      "And the news embargo means the trade outlets can't publish before nine on Wednesday.",
    ],
    ["marcus", "And the news embargo gives sales a morning to call the kickoff customers first."],
    ["ruth", "Please keep SOC 2 out of the news release for now."],
    ["lena", "Already done. Nothing about the audit in the news release until it's real."],
    ["grace", "And thank you for Wednesday. That gives us a day to breathe before the news."],

    // --- Back to the launch date, the second time: the decision.
    ["maya", "Okay, back to the launch date, then. Here's my proposal."],
    ["maya", "We hold the launch date. Tuesday the 3rd."],
    [
      "maya",
      "If the SSO piece slips past Monday, the launch date moves a week, and we say so on Monday, not on launch morning.",
    ],
    ["theo", "I can commit to that."],
    [
      "maya",
      "Theo, the Monday check is yours. Fix merged, review signed, or the launch date moves.",
    ],
    ["theo", "Understood. Monday at ten, before standup."],
    [
      "marcus",
      "I can live with that. I'll warn the three kickoff customers today that the launch date could move.",
    ],
    ["marcus", "And I'll tell Corbel the 3rd is likely, not promised."],
    ["ruth", "Works for me."],
    ["lena", "I'll hold both launch dates in the calendar until Monday."],
    [
      "maya",
      "Great. The launch date holds at the 3rd, with a hard check on Monday. Thanks, everyone.",
      { mark: { after: 2.5, note: "Hold the 3rd; hard check Monday the 2nd" } },
    ],
    ["marcus", "Wait, one more. Are we still doing the launch webinar on the 5th?"],
  ],
  summary: `
The team reviewed launch readiness for Pellwood Enterprise and kept Tuesday the 3rd as the launch date, on condition that the SSO fix and its security review are finished by Monday the 2nd.

## Threads
- **Launch date vs. SSO.** SAML login fails on one of three identity providers, the one most large prospects use, because signed assertions arrive with clock skew. The fix is small; testing it and Ruth's review make Monday the 2nd the earliest sign-off, which leaves one day of slack. Six of the nine enterprise deals need SSO on day one.
- **SOC 2 timing.** SSO is in scope for the audit, the report will not exist until December, and Kestrel has not confirmed fieldwork dates. A bridge letter would cover most buyers, but only once fieldwork starts.
- **Enterprise pricing.** The list price ($48 a seat a month, 50-seat minimum) is holding. The pressure is on discounts: three deals are asking for 40% off, Greywater among them at 300 seats.
- **Migration and beta risk.** The permissions migration took 3h20m on a copy of production (4 of 1,140 workspaces failed) but has never run against the three largest workspaces. The CSV import bug hit 14 of 212 beta accounts; whether any data was lost is still unknown.

## Decisions Made
- Hold Tuesday the 3rd, with a hard check on Monday the 2nd. If the SSO fix or its review is not done, the launch moves a week and the team hears on Monday.
- Ship SSO behind a per-workspace flag, switched on for the six accounts only after the security review.
- Discount floor: 25% standard, 30% with a two-year term. Anything deeper needs Maya, finance and a signed case study.
- Announce on Wednesday the 4th, the day after the analyst briefing, and keep SOC 2 out of the news release until the bridge letter exists.

## Action Items
- [ ] Theo: signed-assertion fix by Thursday the 29th, with clock tolerance capped at two minutes and logged.
- [ ] Ruth: security review of the fix; chase Kestrel for fieldwork dates.
- [ ] Ines: run the migration on the three largest workspaces and report timings by Thursday; replay the 14 failed imports.
- [ ] Marcus: add the discount floor to the pricing doc; warn the three kickoff customers that the date could move.
- [ ] Grace: send Maya the gaps in the evening support schedule.
- [ ] Jun: new copy for the import error message.

## Follow-ups
- Who covers the evening support queue that week.
- Whether the launch webinar on the 5th still goes ahead.
`,
};
