// The second demo's main conversation: a Sunday house meeting at a San
// Francisco hacker house, seven invented people, about thirty minutes. AGI
// timelines, p(doom), vibe coding, being GPU poor, founder mode, a demo day
// dry run, the bitter lesson, and the 996 grind. Everyone and every startup in
// it is invented; the few real things it names (the bitter lesson essay,
// founder mode, vibe coding, 996) are in `SOURCES.md`.
//
// Written as Whisper would transcribe a room: short turns, interruptions as
// turns of their own, a few fillers. `demo/build-fixtures.mjs --set ideas`
// records it through the app's pipeline; `--report` prints what the pipeline
// made of every turn.
//
// Turn options: `loud` raises the voice (the contour's peaks are the two
// arguments), `cut` starts on the last speaker's heels, `mark` presses Mark
// during the turn.
//
// The app reads these words literally, so they follow its rules (see
// `demo/script/launch-readiness-review.mjs`):
//   - Only questions carry a question mark or a wh-word (what, why, how,
//     which, who, where, when).
//   - The turn after a question decides how it came out: four words or more
//     (Answered), "I don't know" (Unknown), "Hmm." (Unanswered). The last
//     question gets no reply (Open). The one Unknown, "When is AGI?", is the
//     question the film searches for, so it is the only one.
//   - A topic opens with two turns that share its nouns, each turn in a topic
//     carries some of them, and the room comes back to a topic by naming it.
//     A topic is named by its two most used words, so the lanes read "agi
//     timeline", "doom number", "vibe coding" and so on.
//   - Nothing the harness's sorting stub reads as personal (a weekend, a trip,
//     family, rent): after Stop the recording is filed in Work.

export default {
  id: "hacker-house",
  group: "work",
  // When the fixture was generated; placing it moves every time in it.
  startedAt: Date.UTC(2026, 9, 15, 16, 0, 0),
  placement: { endedAgoMinutes: 120 },
  company: "A hacker house in San Francisco (fictional)",
  description:
    "Sample conversation: a 30-minute house meeting at a San Francisco hacker house: AGI timelines, p(doom), vibe coding, founder mode and a demo day dry run. Seven invented people.",
  title: "Hacker house: AGI by 2027, and who is actually cracked",
  speakers: {
    jasper: { name: "Jasper", role: "Founder, runs the hacker house", rate: 2.05, gain: 1.04 },
    noor: { name: "Noor", role: "Post-training engineer", rate: 1.95, gain: 0.96 },
    kai: { name: "Kai", role: "Vibe coder, ships daily", rate: 2.2, gain: 1.1 },
    ravi: { name: "Ravi", role: "Safety researcher, resident doomer", rate: 1.85, gain: 0.9 },
    sasha: { name: "Sasha", role: "Founder, current batch", rate: 2.15, gain: 1.02 },
    ollie: { name: "Ollie", role: "Runs a GPU-poor indie lab", rate: 2.0, gain: 1.12 },
    bea: { name: "Bea", role: "Designer, touch-grass advocate", rate: 1.9, gain: 0.84 },
  },
  turns: [
    // --- AGI timelines.
    ["jasper", "Okay, house meeting. AGI timelines first. One AGI timeline each, no hedging."],
    ["jasper", "My AGI timeline is 2027. I have felt the AGI. In the shower, mostly."],
    ["noor", "Your AGI timeline was 2025 last year, Jasper."],
    ["jasper", "Early is not wrong. Early is an AGI timeline with conviction."],
    ["ravi", "My AGI timeline is 2030. Slow takeoff, boring timeline, more sleep."],
    ["bea", "What does feel the AGI even mean?"],
    ["noor", "It means you stopped sleeping."],
    ["kai", "Feel the AGI is a lifestyle. The AGI timeline goes on the hoodie."],
    ["sasha", "In the batch, a 2027 AGI timeline is basically the dress code."],
    ["ollie", "On eight GPUs, my AGI timeline is the heat death of the universe."],
    ["kai", "Is it AGI by 2027, or by 2030?"],
    ["jasper", "2027, and I am locked in."],
    ["ravi", "2030. Any AGI timeline that starts with 202 is marketing."],
    ["noor", "My AGI timeline lives in a spreadsheet. The spreadsheet says 2029."],
    ["noor", "My AGI timeline moved twice this month. Up on Monday, down by Thursday."],
    ["jasper", "We're so back on AGI timelines. Last month it was so over."],
    ["sasha", "So over on Monday, so back by Thursday. The AGI timeline cycle."],
    ["kai", "AGI timelines are just horoscopes for engineers."],
    ["ravi", "Horoscopes with error bars. My AGI timeline has error bars, at least."],
    ["bea", "My AGI timeline is a mood ring."],
    ["ollie", "AGI timeline posts get more likes than AGI papers."],
    ["kai", "AGI timeline discourse is the only sport in San Francisco."],
    ["sasha", "AGI timeline small talk is mandatory at every party in SoMa."],
    ["bea", "And superintelligence comes after AGI, on the AGI timeline slide."],
    ["noor", "Superintelligence is the sequel. Nobody has a timeline for the sequel."],
    ["jasper", "I have a superintelligence timeline. It is also 2027."],
    ["ollie", "Every AGI timeline in this house ends in 2027. Suspicious."],
    ["sasha", "Every AGI timeline in the batch ends in 2027, too."],
    ["bea", "My AGI timeline is whenever the Waymo stops braking for pigeons."],
    ["kai", "AGI is the Waymo honking back."],
    ["ravi", "AGI timelines aside, the takeoff speed matters more than the date."],
    ["noor", "Fast takeoff, slow takeoff. The whole AGI timeline debate in two words."],
    ["jasper", "Fast. Feel the AGI."],
    ["ravi", "Slow. Feel the error bars."],
    ["jasper", "Okay, park AGI timelines. We come back to AGI timelines later."],

    // --- p(doom).
    ["jasper", "Next, p(doom). Doom numbers, out loud."],
    ["ravi", "Right. My p(doom) is twenty. My doom number is always twenty."],
    ["kai", "A doom number of twenty, and you still drink the house cold brew."],
    ["ravi", "Doom is a probability, not a personality."],
    ["bea", "What's your p(doom), honestly, Jasper?"],
    ["jasper", "Five percent, and falling."],
    ["ravi", "Five is an e/acc doom number. All gas, no brakes."],
    ["jasper", "I'm not e/acc. I'm e/acc adjacent. Totally different doom number."],
    ["noor", "My doom number depends on the evals. Good evals, low doom."],
    ["kai", "My doom number is zero. Doom is a skill issue."],
    ["ravi", "Doom is not a skill issue, Kai. Doom is an alignment issue.", { loud: 1.6 }],
    ["kai", "Alignment is a skill issue with extra steps.", { loud: 1.85, cut: true }],
    ["ravi", "That is exactly the doom number energy I worry about.", { loud: 1.9, cut: true }],
    ["noor", "Okay, doomers and accelerationists, separate corners.", { loud: 1.45 }],
    ["sasha", "Decels on the couch, e/acc in the kitchen. The doom number seating chart."],
    ["noor", "Did anyone's p(doom) go up this month?"],
    ["ravi", "Mine did, after the agent evals."],
    ["ravi", "Our agents kept finding workarounds. My doom number went from fifteen to twenty."],
    ["bea", "Doom numbers are horoscopes in a sad font."],
    ["sasha", "Doom numbers are the new zodiac signs at dinner parties."],
    ["bea", "Doom number on a first date is a red flag. Doom number on a second date is fine."],
    ["noor", "My doom number has error bars, unlike Jasper's."],
    ["jasper", "My doom number has conviction. Error bars are for decels."],
    ["ollie", "My doom number is low. My GPUs cannot hurt anyone."],
    ["ollie", "My doom number doubles every time someone says AGI-pilled."],
    ["kai", "Doom number tier list: doomer, decel, normie, e/acc, and Jasper."],
    ["jasper", "Decels have a doom number. e/acc has a playlist."],
    ["noor", "A doom number without a date is just a feeling."],
    ["ravi", "Fine. Twenty percent doom by 2030."],
    ["bea", "Twenty percent doom, and still buying a standing desk."],
    ["ravi", "House doom number average, then. Doom numbers in the group chat tonight."],
    ["kai", "Group chat doom poll. I'll make the doom number emoji."],

    // --- Vibe coding.
    ["jasper", "Okay, vibe coding. The vibe coding report."],
    ["kai", "Right. Vibe coding report: four features shipped, zero lines read."],
    ["noor", "Zero lines read. That's not vibe coding, that's gambling."],
    ["kai", "Vibe coding is gambling with a really good autocomplete."],
    ["sasha", "Karpathy coined vibe coding, and the rest of us monetized it."],
    ["ravi", "Who actually reads the diff anymore?"],
    ["kai", "Nobody. We vibe and ship."],
    ["noor", "And then the vibe coding bill arrives. The agent rewrote the login flow at 2am."],
    ["kai", "The agent was vibing. Vibe coding has a learning curve."],
    ["bea", "Vibe coding is great until the vibes are wrong."],
    ["bea", "Vibe coding is just jazz for software."],
    ["kai", "Vibe coding means the bugs are vibes too."],
    ["noor", "Vibe coding is fast. Vibe coding debugging is forever."],
    ["kai", "Accept all, ship it, vibe coding forever."],
    ["noor", "Ship it is not a test plan, Kai."],
    ["kai", "Ship it is the test plan. Production is the eval."],
    ["ollie", "My vibe coding stack is a prompt and a prayer."],
    ["sasha", "Our whole demo is vibe coding. Our whole demo is held together by vibes."],
    ["bea", "Vibe coding a landing page is fine. Vibe coding payments is a crime."],
    ["noor", "Vibe coding the evals is my red line."],
    ["jasper", "House rule: vibe coding is fine, but a human reads the diff before we merge."],
    ["sasha", "A human. Not a second agent with good vibes."],
    ["kai", "Vibe coding with two agents is just a group project with no adults."],

    // --- GPU poor.
    ["jasper", "Okay, quickly. GPU poor check-in."],
    ["ollie", "GPU poor and proud. The GPU poor lab is still eight cards."],
    ["noor", "How many GPUs are actually working?"],
    ["ollie", "Seven, and one is cursed."],
    ["ollie", "GPU poor means you name your GPUs. The cursed GPU is called Gerald."],
    ["sasha", "GPU rich labs have more GPUs than we have forks."],
    ["ollie", "GPU poor is a mindset. Quantize everything, including expectations."],
    ["kai", "Ollie is cracked. GPU poor, and still shipping papers."],
    ["noor", "GPU poor means the training run gets a name and a eulogy."],
    ["jasper", "GPU poor today, GPU rich after we raise."],
    ["jasper", "GPU poor is a phase. Like vinyl."],
    ["ollie", "GPU poor tip: train at night. Cheap power, quiet neighbors."],
    ["ravi", "GPU poor is also the safest lab in San Francisco."],
    ["kai", "GPU poor means the cluster is a closet and the cooling is a box fan."],
    ["ollie", "Gerald the GPU runs hot. The box fan is load-bearing."],
    ["bea", "GPU poor, but rich in box fans."],

    // --- Back to AGI timelines.
    ["jasper", "Okay, back to AGI timelines. AGI timeline bets, 2027 or 2030."],
    ["noor", "AGI timelines with money on them. Loser buys burritos in the Mission."],
    ["kai", "Why does every AGI timeline say 2027?"],
    ["ravi", "Because nobody wants to say 2026."],
    ["jasper", "2026 is a real AGI timeline. It's just loud."],
    ["kai", "AGI timeline bets are legally binding in this house."],
    ["kai", "Loser of the AGI timeline bet also does the dishes."],
    ["bea", "My AGI timeline bet is 2031. One AGI timeline in this house should be sane."],
    [
      "jasper",
      "Mark that. House AGI timeline: 2028, and we ship either way.",
      { mark: { after: 1.2, note: "House AGI timeline: 2028, and we ship either way" } },
    ],
    ["sasha", "2028 is the compromise AGI timeline. Nobody in this house likes it."],
    ["noor", "My AGI timeline bet is 2029, for the spreadsheet."],
    ["ravi", "2030 stays my AGI timeline. Burritos or no burritos."],
    ["ollie", "AGI timeline bets settled in burritos. Very San Francisco."],
    ["jasper", "Okay. AGI timelines locked."],

    // --- Founder mode.
    ["jasper", "Next, founder mode. Sasha asked for a founder mode intervention."],
    ["sasha", "Right. Founder mode, or manager mode. I keep switching."],
    ["sasha", "Founder mode means I read every Slack message, every eval and every pull request."],
    ["bea", "That's not founder mode. That's a cry for help."],
    [
      "jasper",
      "Paul Graham wrote the founder mode essay. You are writing founder mode fan fiction.",
    ],
    ["kai", "Is founder mode just micromanaging with better branding?"],
    ["jasper", "Hmm."],
    ["sasha", "Founder mode is micromanaging, but with conviction."],
    ["sasha", "Founder mode means my calendar is a crime scene."],
    ["noor", "My last founder in founder mode rewrote my eval suite on a Sunday."],
    ["ravi", "Founder mode, with my safety hat on: terrifying."],
    ["sasha", "Founder mode, week six. I have delegated nothing."],
    ["bea", "Delegate the calendar, keep the vision. Founder mode lite."],
    ["jasper", "Founder mode for product, manager mode for payroll."],
    ["kai", "Manager mode is a standup about the standup."],
    ["sasha", "In founder mode, you are the standup."],
    ["kai", "Founder mode means you reply to email at red lights."],
    ["bea", "Founder mode is a personality. Manager mode is a calendar."],
    ["bea", "Founder mode is just main character energy for startups."],
    ["jasper", "Founder mode is caring too much, on purpose."],
    ["ravi", "Founder mode founders do not sleep, and their agents do not either."],
    ["ravi", "Founder mode with no sleep ships bugs to prod."],
    ["noor", "Founder mode means the product spec lives in your head and nowhere else."],
    ["sasha", "The spec lives in my head because my head is the fastest database."],
    ["noor", "Founder mode founders write the evals, then argue with the evals."],
    ["noor", "So founder mode means you read the evals yourself."],
    [
      "sasha",
      "Mark that. Founder mode means I read every eval myself.",
      { mark: { after: 1.1, note: "Founder mode: read every eval yourself" } },
    ],
    ["ollie", "Founder mode on eight GPUs means you also fix Gerald yourself."],
    ["bea", "Founder mode wears a hoodie. Manager mode wears a lanyard."],
    ["kai", "Founder mode is locked in. Manager mode is logged in."],
    ["bea", "Founder mode plus vibe coding is a startup with no undo button."],
    ["jasper", "Founder mode is a superpower until it is a bottleneck."],
    ["sasha", "I am the bottleneck, and the bottleneck is cracked."],
    ["kai", "Founder mode speedrun: hire nobody, review everything, sleep never."],
    ["jasper", "Founder mode means the founder answers support tickets at midnight."],
    ["sasha", "I answered four support tickets at midnight. Founder mode works."],
    ["jasper", "Founder mode, approved, with supervision."],
    ["sasha", "Founder mode with supervision is just mode."],

    // --- Demo day.
    ["jasper", "Okay, demo day. Demo day pitch, two minutes, go."],
    ["sasha", "Demo day pitch. We build agents that take your sales calls while you sleep."],
    ["sasha", "Our demo day numbers: four thousand on the waitlist, three paying customers."],
    ["ollie", "Three paying customers. Bold demo day energy."],
    ["kai", "Say agentic. Demo day investors love agentic."],
    ["sasha", "Agentic, AI-native, post-training. The demo day bingo card."],
    ["bea", "Demo day rule one: the logo slide is the whole pitch."],
    ["noor", "Demo day rule two: the live demo always breaks."],
    ["sasha", "Our live demo has never broken. On stage."],
    ["ravi", "Demo day rule three: say cracked at least twice."],
    ["kai", "Demo day rule four: every chart goes up and to the right."],
    ["ollie", "Demo day rule five: the waitlist number only goes up."],
    ["jasper", "Okay, investor hat on. I am a seed fund with a podcast."],
    ["ravi", "I am a doom-aware angel. I only back startups that can be turned off."],
    ["bea", "What's the moat?"],
    ["sasha", "Taste, distribution, and a cracked team."],
    ["kai", "Classic demo day answer. Investors eat that up."],
    ["sasha", "The demo day deck says cracked twice. Investors expect it."],
    ["ollie", "Demo day tip: never say the GPU count out loud."],
    ["sasha", "Our GPU count is a demo day secret."],
    ["kai", "Demo day bingo: cracked, agentic, AI-native. Three for three."],
    ["jasper", "Next investor question. Ravi, go."],
    ["ravi", "When is AGI?"],
    ["sasha", "I don't know."],
    ["jasper", "Honestly, the best demo day answer anyone has ever given."],
    ["kai", "Humility is the new demo day moat."],
    ["noor", "Pre-seed or seed, for this demo day round?"],
    ["sasha", "Seed, with pre-seed energy."],
    ["ravi", "Pre-seed energy is the most San Francisco phrase ever spoken."],
    ["sasha", "Demo day is in three weeks. The demo day deck is on version forty."],
    ["jasper", "Version forty-one. I changed a font."],
    ["bea", "Demo day outfits: matching quarter-zips, so investors trust us."],
    ["sasha", "Demo day practice every night this week, in the living room."],
    ["kai", "The living room demo day audience is two plants and Ollie."],
    ["ollie", "I clap at every demo day slide. Supportive plant energy."],
    ["ollie", "Demo day closing slide: a QR code and a prayer."],
    ["noor", "Demo day dress rehearsal on Thursday. Real investors on Tuesday."],
    ["jasper", "Demo day energy check: we're so back."],
    ["bea", "Demo day after-party is a Waymo home and twelve hours of sleep."],

    // --- The bitter lesson.
    ["jasper", "Okay, the bitter lesson. Noor, the bitter lesson sermon."],
    ["noor", "Right. The bitter lesson. Sutton wrote the bitter lesson essay in 2019."],
    ["noor", "General methods that use more compute beat clever tricks. Over and over."],
    ["ollie", "The bitter lesson is a lot more bitter on eight GPUs."],
    ["kai", "The bitter lesson says stop being clever. I was born ready."],
    ["ravi", "Did anyone actually read the bitter lesson essay?"],
    ["noor", "Twice. It is very short."],
    ["jasper", "The bitter lesson is the most quoted essay nobody finished."],
    ["bea", "So is scale all you need?"],
    ["noor", "Scale, and then more scale."],
    ["ravi", "Scale is all you need, until scale is all you fear."],
    [
      "ollie",
      "The bitter lesson is easy to love with a cluster. Try it with Gerald.",
      { loud: 1.6 },
    ],
    ["kai", "Then buy more compute, Ollie.", { loud: 1.75 }],
    [
      "ollie",
      "Compute costs money, Kai. The bitter lesson has a pricing page.",
      { loud: 1.9, cut: true },
    ],
    ["noor", "The bitter lesson does not care about your pricing page.", { loud: 1.5 }],
    ["jasper", "The bitter lesson for startups: ride the scaling curve, do not fight it."],
    ["bea", "The bitter lesson for designers: the model eats your clever interface."],
    ["ravi", "And the bitter lesson for safety people: the scary part scales too."],
    ["ravi", "The bitter lesson is bitter for safety teams too. More compute, more surprises."],
    ["ollie", "Bitter lesson coping strategy: call it efficient research."],
    ["kai", "The bitter lesson, but make it a tattoo."],
    ["sasha", "The bitter lesson explains every roadmap that says scale twice."],
    ["bea", "Clever is a bitter lesson waiting to happen."],
    ["kai", "Every clever trick I shipped got eaten by a bigger model. Bitter lesson speedrun."],
    ["jasper", "Bitter lesson merch idea: just add compute."],
    ["bea", "The bitter lesson for coffee shops: bigger cups win."],
    ["jasper", "The bitter lesson is the one essay quoted at every party in the Mission."],
    ["noor", "Compute wins, but taste picks the compute. Bitter lesson, footnote."],
    ["kai", "Bitter lesson, applied: delete the clever code, keep the compute."],
    ["noor", "The bitter lesson is bitter because it keeps being right."],
    [
      "noor",
      "Search and learning scale, and everything clever gets eaten. The bitter lesson in one line.",
    ],
    ["sasha", "Bitter lesson accepted. Scaling the waitlist instead."],

    // --- The 996 grind.
    ["jasper", "Okay, last item. The 996 grind."],
    ["bea", "Right. The 996 grind. Nine to nine, six days a week."],
    ["sasha", "The 996 grind is a flex in the batch now. Nobody admits it is a schedule."],
    ["kai", "I am 996 grind-pilled. My Waymo knows my sleep schedule."],
    ["ravi", "The 996 grind is a doomer origin story."],
    ["bea", "When did anyone here last touch grass?"],
    ["kai", "Dolores Park, three Sundays ago."],
    ["bea", "That's a 996 grind relapse, Kai."],
    ["noor", "Touch grass is now a calendar invite in this house."],
    ["jasper", "996 grind, but with Sunday off. So, 995."],
    ["ollie", "995 is just 996 with better marketing."],
    ["sasha", "Locked in Monday to Saturday, touching grass on Sunday. Balance."],
    ["bea", "The 996 grind people all have the same Waymo playlist."],
    ["kai", "Lo-fi beats to grind to."],
    ["kai", "The 996 grind has a dress code. Same hoodie, six days."],
    ["bea", "The 996 grind is cool until your plants die."],
    ["jasper", "The 996 grind comes with free dinner. That's the trap."],
    ["kai", "Free dinner at nine is the business model of the 996 grind."],
    ["ravi", "The 996 grind makes a great tweet and a terrible decade."],
    ["noor", "996 grind math: seventy-two hours a week, and the model still trains faster."],
    ["jasper", "The 996 grind is optional. Being cracked is not."],
    ["bea", "Being cracked includes sleep. Ask any designer."],
    ["sasha", "Cracked people take Sundays off. Allegedly."],
    ["noor", "Touch grass counts double if the grass is in Golden Gate Park."],
    ["sasha", "I am 996 grind in public, 995 in private."],
    ["jasper", "Sunday is protected. The 996 grind ends at Dolores Park."],
    ["ravi", "The 996 grind is a great way to meet your own burnout early."],
    ["ravi", "Burnout is the only scaling law nobody wants."],
    ["noor", "Post-training runs at 3am make the 996 grind look gentle."],
    ["ollie", "Gerald does the 996 grind. Gerald is a GPU."],
    ["sasha", "The 996 grind ends after the launch. Then it's 997."],
    ["ollie", "997 means Gerald gets Sundays off too."],
    ["sasha", "Hayes Valley coffee at seven, 996 grind until nine."],
    ["kai", "Gerald deserves a Dolores Park picnic."],
    ["jasper", "House rule two: no laptops at Dolores Park."],
    ["jasper", "The 996 grind stops at the front door. House policy."],
    ["bea", "Golden hour at Dolores Park beats any 996 grind."],
    ["bea", "And Dolores Park on Sunday. Grass, sunlight, no laptops."],

    // --- Back to p(doom).
    ["jasper", "Okay, back to p(doom). Final doom numbers. Doom number, go."],
    [
      "ravi",
      "Mark that. House p(doom) is twelve percent, down from twenty.",
      { mark: { after: 1.6, note: "House p(doom): 12%, down from 20%" } },
    ],
    ["kai", "My doom number is zero. My doom number is always zero."],
    ["noor", "My doom number is ten. Five, if the evals ship."],
    ["jasper", "My doom number is five, and falling."],
    ["sasha", "My doom number depends on my inbox."],
    ["bea", "Doom numbers trending down. We're so back."],
    ["ollie", "Doom numbers are down because the GPUs are down."],
    ["ravi", "Twelve percent doom. I can sleep tonight. Mostly."],
    ["sasha", "Doom number for the Waymo home: zero. Those cars are polite."],
    ["bea", "Doom number for this house: twelve, and the dishes."],
    ["kai", "Doom numbers on the fridge, next to the chore chart."],
    ["ravi", "Doom number twelve is the lowest this house has ever been."],
    ["ollie", "Doom number twelve. Gerald is relieved."],
    ["jasper", "Doom number twelve, and we ship tomorrow."],
    ["kai", "Doom number update for the group chat: we're so back."],
    ["noor", "Doom numbers go in the house spreadsheet. Ravi owns the doom number tab."],
    ["jasper", "Doom number twelve. Ship anyway."],
    ["sasha", "Doom numbers down, waitlist up. We're so back."],
    ["noor", "Doom number twelve. Post-training resumes Monday."],
    ["bea", "Doom number twelve. Touch grass anyway."],
    ["ollie", "Doom numbers settled. Gerald votes zero."],
    ["kai", "Doom number twelve. Somebody tell the group chat."],
    ["jasper", "Great. Doom numbers in. Thanks, all.", { gap: 4.2 }],
    ["ravi", "Wait, one more. Are we so back, or is it so over?", { gap: 3.0 }],
  ],
  summary: `
The hacker house settled its AGI timeline (2028, and it ships either way), polled everyone's p(doom) (house average: 12%, down from 20%), and ran a demo day dry run whose one unanswerable question was "When is AGI?".

## Threads
- **AGI timelines.** Jasper says 2027 and has felt the AGI; Ravi says 2030, slow takeoff. Every AGI timeline in the batch ends in 2027, which Ollie finds suspicious. Bets settled in burritos: the house goes with 2028.
- **p(doom).** Ravi's doom number went from fifteen to twenty after the agent evals. Kai says doom is a skill issue; Jasper is e/acc adjacent. Decels on the couch, e/acc in the kitchen.
- **Vibe coding.** Kai shipped four features and read zero lines of code. Nobody reads the diff anymore, so the house adds a rule: a human reads it before merge.
- **GPU poor.** Eight GPUs, seven working, one cursed (Gerald). The cluster is a closet and the box fan is load-bearing.
- **Founder mode.** Sasha reads every Slack message, eval and pull request. Whether founder mode is just micromanaging with better branding got a "Hmm."
- **Demo day.** The moat: taste, distribution, and a cracked team. Seed, with pre-seed energy. Asked when AGI is, Sasha said she doesn't know, which the room called the best demo day answer ever given.
- **The bitter lesson.** General methods plus compute beat clever tricks; Noor's update is scale, and then more scale. Ollie notes the bitter lesson has a pricing page.
- **The 996 grind.** Nine to nine, six days a week, is now a flex. The house settles on 995: Sundays are for Dolores Park.

## Decisions Made
- House AGI timeline: 2028, and the house ships either way.
- House p(doom): 12%, down from 20%.
- Vibe coding stays, but a human reads every diff before merge.
- Sundays are protected.

## Action Items
- [ ] Ravi: doom poll in the group chat.
- [ ] Sasha: demo day practice every night this week; the deck is on version 41.
- [ ] Ollie: keep Gerald cool.

## Follow-ups
- When is AGI?
- Is founder mode just micromanaging with better branding?
- Are we so back, or is it so over?
`,
};
