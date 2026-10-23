// The shorter conversations around the launch review, over the two weeks
// before it: a hiring sync, a customer call, a design crit, two 1:1s and
// yesterday's SSO check-in. Placed on weekdays. They share subjects with the review (SSO, the SOC 2
// audit, pricing, the import bug, support staffing, the news embargo), which
// is what Home's recent rows, search and the Conversations map draw on. They
// are demo-profile only; the app ships the review alone as its example.
//
// The same rules as the review apply (see `launch-readiness-review.mjs`):
// question marks and wh-words only on questions, short first replies, and
// each topic opened by two turns that share its nouns.

const day = (daysAgo, hours, minutes) => Date.UTC(2026, 9, 12 - daysAgo, hours, minutes, 0);

export default [
  {
    id: "backend-hiring-sync",
    group: "work",
    startedAt: day(12, 21, 0),
    placement: { daysAgo: 12, at: "14:00", weekdays: true },
    company: "Pellwood (fictional)",
    description: "Sample conversation: a backend hiring sync at Pellwood. Invented people.",
    title: "Backend hiring: finalists and the migration gap",
    speakers: {
      maya: { name: "Maya", role: "Product lead", rate: 2.06, gain: 1.04 },
      theo: { name: "Theo", role: "Engineering lead", rate: 1.9, gain: 1.0 },
      priya: { name: "Priya", role: "Recruiter", rate: 2.2, gain: 0.96 },
    },
    turns: [
      ["maya", "Okay, backend hiring. Priya, you have the hiring numbers."],
      ["priya", "Yes. Backend hiring is down to the final round, with two finalists."],
      [
        "priya",
        "Thirty-one backend applicants made it into the hiring funnel, and six got phone screens.",
      ],
      ["theo", "Both finalists are strong on the API side. The difference is database work."],
      ["maya", "How many of them have run a big schema change?"],
      ["theo", "Only one of the two finalists."],
      [
        "theo",
        "The first one moved a payments company onto a new ledger schema. Two hundred million rows, zero downtime.",
      ],
      ["priya", "She wants a decision by Friday. She has another offer on the table."],
      ["maya", "Then we move fast on her. That's the hiring decision for this week."],
      ["maya", "That's exactly the experience we're short on right now."],
      ["priya", "On the interview loop, the take-home is losing people."],
      [
        "priya",
        "Three of the six candidates dropped at the take-home stage of the interview loop.",
      ],
      [
        "theo",
        "The take-home is four hours, honestly. Senior people won't do four hours of unpaid work.",
      ],
      ["maya", "Then replace the take-home with a paired session in the interview loop."],
      [
        "theo",
        "A ninety-minute paired session on a real migration bug. Better signal, shorter interview loop.",
      ],
      ["priya", "Can we change the interview loop before the final round?"],
      ["maya", "Yes, starting this week."],
      ["priya", "Good. I'll tell both final candidates about the new interview loop today."],
      ["theo", "Whoever joins owns the data migration from week one."],
      ["maya", "The data migration needs an owner before the launch, so that works for me."],
      ["theo", "Ines carries the data migration alone at the moment, and that's the real risk."],
      ["maya", "Did the second finalist ever own a data migration?"],
      ["theo", "No idea, honestly."],
      ["theo", "I'll ask him on Thursday."],
      [
        "maya",
        "The data migration also needs a second reviewer before the launch, whoever we hire.",
      ],
      ["theo", "Ruth can review the data migration rollback with Ines."],
      ["priya", "And I'll send both finalists the new schedule tonight."],
    ],
    summary: `
Theo, Maya and Priya reviewed the senior backend search: two finalists remain, and the take-home is losing candidates.

## Threads
- **Finalists.** Of 31 applicants, two reached the final round. Only one has run a large data migration (200 million rows, zero downtime).
- **Interview loop.** Three of six candidates dropped at the four-hour take-home. It is replaced by a 90-minute paired session on a real migration bug, starting this week.
- **Migration ownership.** Ines carries the data migration alone; whoever joins owns it from week one. Whether the second finalist has done one is unknown.

## Decisions made
- Replace the take-home with a paired session, starting this week.

## Action items
- [ ] Priya: tell both finalists about the new loop today.
- [ ] Theo: ask both finalists about data migration ownership in the paired session.
`,
  },
  {
    id: "corbel-pricing-call",
    group: "work",
    startedAt: day(9, 18, 0),
    placement: { daysAgo: 9, at: "11:00", weekdays: true },
    company: "Pellwood and Corbel Logistics (both fictional)",
    description:
      "Sample conversation: a customer call with Corbel Logistics, a fictional customer. Invented people.",
    title: "Corbel call: SSO on day one is a contract condition",
    speakers: {
      marcus: { name: "Marcus", role: "Head of sales, Pellwood", rate: 2.25, gain: 1.15 },
      dana: { name: "Dana", role: "Head of IT, Corbel Logistics", rate: 2.05, gain: 0.98 },
      maya: { name: "Maya", role: "Product lead, Pellwood", rate: 2.06, gain: 1.04 },
    },
    turns: [
      ["marcus", "Thanks for joining, Dana. Today is mostly SSO and SAML."],
      ["dana", "Right. SSO with SAML is the hard requirement for us."],
      [
        "dana",
        "Every login at Corbel goes through our identity provider, so SSO over SAML is the only way in.",
      ],
      ["maya", "SSO ships with the launch on the 3rd, with SAML login and an admin setup screen."],
      ["dana", "Can you do SSO with our identity provider on day one?"],
      ["maya", "Yes, it's on the test plan."],
      [
        "maya",
        "Your identity provider has a known SAML clock issue, and the SSO fix is in progress.",
      ],
      ["dana", "How long does SSO setup take for an admin?"],
      ["maya", "About ten minutes, with the SAML metadata."],
      [
        "dana",
        "Ten minutes is fine. Our admins hate long SSO setups, and they hate SAML errors more.",
      ],
      ["dana", "Good. SSO on day one is a contract condition for us, not a nice-to-have."],
      ["marcus", "Understood. We'll write the SSO condition into the contract."],
      ["marcus", "On pricing, the enterprise quote is forty-eight a seat, two hundred seats."],
      ["dana", "Forty-eight a seat is fine. The discount is the conversation."],
      [
        "dana",
        "Our finance team wants a thirty percent discount on the seat price, for two years.",
      ],
      ["marcus", "Thirty percent with a two-year term works for us."],
      [
        "marcus",
        "Two hundred seats on a two-year term also gets the onboarding package, at no discount cost to you.",
      ],
      ["dana", "The onboarding package matters more than the discount, honestly."],
      [
        "dana",
        "Our CFO signs anything over a hundred thousand a year, so the discount has to land under that.",
      ],
      ["maya", "Thirty percent is our discount floor for a two-year term, so that one's easy."],
      ["dana", "And the platform fee."],
      ["marcus", "The platform fee has no discount. Eight thousand a year, at list."],
      ["dana", "Last item, the SOC 2 report. Security won't sign without the SOC 2 report."],
      ["marcus", "The SOC 2 report lands in December, with a bridge letter until then."],
      ["maya", "Would a bridge letter work for your security team?"],
      ["dana", "Our security team accepted one last year."],
      [
        "dana",
        "A bridge letter plus the SOC 2 audit dates should be enough for the security review.",
      ],
      ["marcus", "Ruth will send you the SOC 2 audit dates once the auditors confirm."],
      ["marcus", "Ruth can also walk your security team through the SOC 2 audit scope."],
      [
        "dana",
        "Then we're close. SSO on day one, thirty percent for two years, and the bridge letter.",
      ],
      ["dana", "One more. Is there a data residency option for Canada?"],
      ["marcus", "Hmm."],
      ["maya", "Let me check with engineering and come back to you this week."],
    ],
    summary: `
Corbel's head of IT confirmed that SSO on day one is a contract condition. Pricing landed at 30% off for a two-year term, and a bridge letter should satisfy their security review.

## Threads
- **SSO.** Every Corbel login goes through their identity provider, so SSO with SAML on the 3rd is a hard requirement and goes into the contract. Their provider is the one with the known clock issue.
- **Pricing.** $48 a seat for 200 seats. Corbel asked for 30% off on a two-year term, which is at Pellwood's floor; the platform fee stays at list.
- **SOC 2.** The report lands in December. Corbel's security team accepted a bridge letter last year.

## Action items
- [ ] Marcus: write the SSO condition into the contract.
- [ ] Ruth: send Corbel the SOC 2 audit dates once the auditors confirm.
- [ ] Maya: check data residency for Canada with engineering this week.

## Follow-ups
- Data residency for Canada: no answer yet.
`,
  },
  {
    id: "design-crit-import-sso",
    group: "work",
    startedAt: day(7, 22, 30),
    placement: { daysAgo: 7, at: "15:30", weekdays: true },
    company: "Pellwood (fictional)",
    description: "Sample conversation: a design crit at Pellwood. Invented people.",
    title: "Design crit: import errors and SSO setup",
    speakers: {
      jun: { name: "Jun", role: "Product designer", rate: 1.9, gain: 0.8 },
      maya: { name: "Maya", role: "Product lead", rate: 2.06, gain: 1.04 },
      ines: { name: "Ines", role: "Backend engineer", rate: 2.2, gain: 0.92 },
    },
    turns: [
      ["jun", "Okay, design crit. First the import error screen."],
      [
        "jun",
        "Right now a failed CSV import shows one generic error. Nobody can act on that import error.",
      ],
      [
        "jun",
        "The new import error screen shows the CSV rows that landed and the rows that failed.",
      ],
      [
        "ines",
        "That matches the import bug. Most rows land, and the last chunk of the CSV file goes missing.",
      ],
      ["maya", "Can the import error screen offer a retry for just the failed rows?"],
      ["ines", "Yes, once the import fix ships."],
      [
        "jun",
        "Then the import error screen gets a retry button for the failed rows, and a download of the rows that failed.",
      ],
      ["maya", "Good. And the import error copy should name the reason, not just the error."],
      [
        "ines",
        "The download only needs the failed rows, in the original CSV format, so the import bug never costs a full re-import.",
      ],
      ["jun", "Second screen. The SSO setup screen in the admin console."],
      ["jun", "Admins upload the SAML metadata file, then test the SSO connection."],
      [
        "ines",
        "If the SAML test fails, the screen shows the raw SAML error from the identity provider.",
      ],
      ["maya", "Raw SAML errors will scare every admin. We need plain language there."],
      ["jun", "I'll map the five most common SAML errors to plain messages."],
      [
        "ines",
        "The clock skew error is the most common SSO error on that third identity provider.",
      ],
      ["maya", "Then the clock skew message comes first, with a link to the SSO setup guide."],
      ["jun", "Do admins need to see the SAML certificate expiry date on the SSO screen?"],
      ["maya", "Hmm."],
      ["ines", "Let's leave the SAML certificate for the next round."],
      ["jun", "Then the SSO setup screen is ready for review on Friday."],
    ],
    summary: `
Jun walked Maya and Ines through two screens for the enterprise launch: the import error screen and the SSO setup screen.

## Threads
- **Import errors.** A failed import shows one generic error today, although most rows land and only the last chunk goes missing. The new screen shows the rows that landed and the rows that failed, with a retry for the failed rows once the import fix ships.
- **SSO setup.** Admins upload SAML metadata and test the connection. Raw SAML errors from the identity provider will be mapped to plain messages, clock skew first.

## Action items
- [ ] Jun: map the five most common SAML errors to plain messages.
- [ ] Jun: retry and download for failed rows on the import error screen.

## Follow-ups
- Whether admins need the SAML certificate expiry date on the SSO screen.
`,
  },
  {
    id: "support-planning-1on1",
    group: "work",
    startedAt: day(5, 17, 0),
    placement: { daysAgo: 5, at: "10:00", weekdays: true },
    company: "Pellwood (fictional)",
    description: "Sample conversation: a support planning 1:1 at Pellwood. Invented people.",
    title: "Support planning: two agents short",
    speakers: {
      maya: { name: "Maya", role: "Product lead", rate: 2.06, gain: 1.04 },
      grace: { name: "Grace", role: "Support lead", rate: 2.0, gain: 0.95 },
    },
    turns: [
      ["maya", "Okay, support staffing for the launch week."],
      [
        "grace",
        "Support staffing first. Two of my four support agents are out the week of the 3rd.",
      ],
      ["grace", "One support agent is on parental leave, one at a wedding."],
      ["maya", "Can we borrow someone from sales for the support queue?"],
      ["grace", "Sales is slammed that week too."],
      ["grace", "So support staffing stays at two agents, unless engineering helps."],
      ["grace", "Last launch we got three hundred and forty support tickets in two days."],
      ["maya", "Then support staffing is the real launch risk on my list."],
      ["maya", "I'll ask Theo about engineers for support staffing."],
      ["grace", "And I'll draft the support schedule for that week tonight."],
      ["grace", "Second thing. The import bug is already our top ticket category."],
      [
        "grace",
        "Forty-one import tickets this month, mostly from beta accounts with big CSV files.",
      ],
      ["maya", "The import fix ships in the next release, so the import tickets should drop."],
      [
        "grace",
        "Then I want a support macro for the import bug, with the workaround, until the fix ships.",
      ],
      ["maya", "Did any of those import tickets mention lost data?"],
      ["grace", "I don't know. The import tickets only show the error."],
      ["grace", "Half of the import tickets come from the same three beta accounts."],
      ["maya", "Ask Omar for the beta account list, so support can check the big imports."],
      ["grace", "Will do. And the import macro goes live before the release."],
    ],
    summary: `
Grace and Maya planned support for the launch week: staffing is two agents short, and the import bug already leads the ticket queue.

## Threads
- **Staffing.** Two of four support agents are out the week of the 3rd, and sales cannot lend anyone, so coverage depends on engineering.
- **Import tickets.** 41 import tickets this month, mostly from beta accounts with large CSV files. Whether any customer lost data is unknown.

## Action items
- [ ] Maya: ask Theo about engineers for support staffing.
- [ ] Grace: support macro for the import bug, live before the release.
- [ ] Grace: get the beta account list from Omar to check large imports.
`,
  },
  {
    id: "launch-comms-1on1",
    group: "work",
    startedAt: day(3, 23, 0),
    placement: { daysAgo: 3, at: "16:00", weekdays: true },
    company: "Pellwood (fictional)",
    description: "Sample conversation: a launch communications 1:1 at Pellwood. Invented people.",
    title: "Launch comms: embargo, webinar, a backup date",
    speakers: {
      lena: { name: "Lena", role: "Marketing lead", rate: 2.15, gain: 1.02 },
      maya: { name: "Maya", role: "Product lead", rate: 2.06, gain: 1.04 },
    },
    turns: [
      [
        "lena",
        "Okay, launch comms. The news embargo and the analyst briefing are the two fixed points.",
      ],
      [
        "lena",
        "The analyst briefing is Tuesday morning, so the news embargo should lift Wednesday.",
      ],
      ["maya", "Wednesday works. Customers get the product on Tuesday, and the news on Wednesday."],
      ["lena", "Two trade outlets agreed to the news embargo. A third one wants an exclusive."],
      ["maya", "Skip the exclusive. The news embargo is cleaner."],
      ["lena", "The analyst briefing deck still needs the final customer quotes."],
      ["maya", "Legal has the customer quotes. They should clear before the briefing."],
      ["lena", "Separate thing, the webinar. The webinar is Thursday the 5th."],
      ["lena", "The Thursday webinar has a hundred and forty signups, mostly finance leads."],
      ["maya", "Who's presenting the webinar demo?"],
      ["lena", "Jun and me, with Theo for questions."],
      ["maya", "Keep the flagged features out of the live webinar demo."],
      ["lena", "Good call. The webinar demo shows the activity log and the import fixes."],
      ["lena", "The webinar recording goes out to every signup the next morning."],
      ["maya", "One risk. The launch date still depends on SSO."],
      ["lena", "So the launch date could still move a week."],
      ["lena", "Then I'll keep a second launch date in the plan, quietly."],
      ["maya", "Do that. We decide the launch date at the readiness review."],
      ["lena", "Is the readiness review still on Monday?"],
    ],
    summary: `
Lena and Maya set the launch communications around the analyst briefing, the news embargo and the launch webinar.

## Threads
- **News embargo.** The analyst briefing is Tuesday morning, so the embargo lifts on Wednesday: customers get the product on Tuesday and the news on Wednesday. Two trade outlets agreed; the exclusive request is declined.
- **Webinar.** Thursday the 5th, 140 signups so far, mostly finance leads. Jun and Lena present, with Theo for questions; flagged features stay out of the demo.
- **Date risk.** The launch date still depends on SSO and could move a week, so Lena keeps a second date in the plan.

## Decisions made
- The news embargo lifts on Wednesday; no exclusive.

## Follow-ups
- Whether the readiness review is still on Monday.
`,
  },
  {
    id: "sso-fix-checkin",
    group: "work",
    startedAt: day(1, 24, 30),
    placement: { daysAgo: 1, at: "17:30", weekdays: true },
    company: "Pellwood (fictional)",
    description: "Sample conversation: an SSO check-in at Pellwood. Invented people.",
    title: "SSO fix: clock skew and the security review",
    speakers: {
      theo: { name: "Theo", role: "Engineering lead", rate: 1.9, gain: 1.0 },
      ines: { name: "Ines", role: "Backend engineer", rate: 2.2, gain: 0.92 },
      ruth: { name: "Ruth", role: "Security lead", rate: 1.86, gain: 0.9 },
    },
    turns: [
      ["theo", "Quick one on SSO. Ines found the SAML failure."],
      ["ines", "The SSO failure is clock skew. Their SAML assertions arrive a few seconds early."],
      ["ines", "Our SAML library rejects anything stamped in the future, so the SSO login fails."],
      ["theo", "The SAML fix is a clock tolerance setting. Twelve lines."],
      [
        "ines",
        "One test tenant drifted forty seconds, but that was their misconfigured clock, not the SAML library.",
      ],
      ["ruth", "How much tolerance are you thinking?"],
      ["theo", "Two minutes, like the SAML library default."],
      ["ruth", "Two minutes opens a replay window on SSO logins. I want it logged and alerted."],
      ["ruth", "And the SSO fix needs a full security review before it ships."],
      ["theo", "Can the security review start before the fix merges?"],
      ["ruth", "Hmm."],
      ["ruth", "Separately, the SOC 2 audit window closes on the 31st."],
      ["ruth", "SSO is in the SOC 2 audit scope, so the auditors will want the SSO login events."],
      ["theo", "The SSO login events already go to the activity log."],
      ["ruth", "Good. Then the SOC 2 audit evidence is mostly there."],
      ["ines", "Do we know when the auditors start fieldwork?"],
      ["ruth", "Not yet. Still waiting on Kestrel."],
      ["ruth", "Kestrel hasn't confirmed the SOC 2 audit dates."],
      ["theo", "Then the SSO fix lands Thursday, and the security review starts Friday."],
      ["ruth", "Works for me."],
    ],
    summary: `
Theo, Ines and Ruth went through the SSO failure and what the fix needs before the launch.

## Threads
- **SSO failure.** SAML assertions from one identity provider arrive a few seconds early and are rejected as future-dated. The fix is a clock tolerance setting; two minutes is the proposal.
- **Security review.** Ruth wants the tolerance logged and alerted, and a full security review before the fix ships. Whether the review can start before the merge was left open.
- **SOC 2 scope.** SSO is in audit scope, and SSO login events already go to the activity log. Kestrel has not confirmed fieldwork dates.

## Decisions made
- Two-minute clock tolerance, logged and alerted.

## Action items
- [ ] Theo: land the SSO fix by Thursday.
- [ ] Ruth: start the security review on Friday.
`,
  },
];
