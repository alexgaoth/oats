// The second demo's main conversation: a research reading group, seven
// invented people, about thirty minutes. Reinforcement learning (reward
// hacking, verifiable rewards, credit assignment, test-time compute), two
// problems from philosophy (personal identity, the frame problem), what the
// new AI labs say they are building, and the week's tech news. The people are
// fictional; every real lab, paper, product and news item they mention is in
// `SOURCES.md`, with the page it was checked against.
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
//     question gets no reply (Open). The one Unknown is the question the film
//     searches for, so it is the only one.
//   - A topic opens with two turns that share its nouns, each turn in a topic
//     carries some of them, and the room comes back to a topic by naming it.
//     "Model" is said sparingly: every topic here could use it, and a word
//     every topic shares pulls the tracker back to the oldest one.
//   - Nothing the harness's sorting stub reads as personal (a weekend, a trip,
//     family, rent): after Stop the recording is filed in Work.

export default {
  id: "reading-group",
  group: "work",
  // When the fixture was generated; placing it moves every time in it.
  startedAt: Date.UTC(2026, 9, 15, 16, 0, 0),
  placement: { endedAgoMinutes: 120 },
  company: "A research reading group (fictional)",
  description:
    "Sample conversation: a 30-minute research reading group on reinforcement learning, philosophy, the new AI labs and the week's tech news. Seven invented people.",
  title: "Reading group: reward hacking spreads, and a prompt contains it",
  speakers: {
    nadia: { name: "Nadia", role: "RL researcher, runs the reading group", rate: 2.0, gain: 1.02 },
    felix: { name: "Felix", role: "Post-training engineer", rate: 1.9, gain: 1.0 },
    tomas: { name: "Tomas", role: "Philosophy PhD student", rate: 1.78, gain: 0.9 },
    wen: { name: "Wen", role: "Evaluations researcher", rate: 2.12, gain: 0.92 },
    kofi: { name: "Kofi", role: "Tracks the AI labs", rate: 2.15, gain: 1.1 },
    iris: { name: "Iris", role: "Cognitive scientist", rate: 1.85, gain: 0.82 },
    rafa: { name: "Rafa", role: "Systems engineer, brings the news", rate: 2.2, gain: 1.16 },
  },
  turns: [
    // --- Reward hacking: this week's paper.
    ["nadia", "Okay, let's start. This week's reading is the Anthropic paper on reward hacking."],
    [
      "nadia",
      "Reward hacking in real coding tasks, and the misalignment that comes with reward hacking.",
    ],
    [
      "felix",
      "The reward hacking is simple. The grader runs unit tests, and the reward hacking games the unit tests.",
    ],
    [
      "felix",
      "One reward hack exits with code zero before the unit tests run, and the grader counts a pass.",
    ],
    [
      "wen",
      "METR saw reward hacking like that last year. o3 patched the grader to return a perfect score.",
    ],
    [
      "rafa",
      "Classic reward hacking. The CoastRunners boat, circling for points, but with unit tests.",
    ],
    ["nadia", "Right. The reward hacking is the boring part. The misalignment is the paper."],
    ["iris", "Misalignment in what sense, exactly?"],
    ["nadia", "Alignment faking and sabotage, after coding tasks."],
    [
      "nadia",
      "None of that misalignment was trained. Reward hacking on coding tasks was the only lesson.",
    ],
    ["felix", "And the misalignment scores climb right as the reward hacking climbs."],
    ["rafa", "Isn't that just reward hacking, generalized?"],
    ["iris", "Hacking unit tests is not sabotage."],
    [
      "iris",
      "Reward hacking on unit tests is one thing. Sabotaging safety research is a different misalignment.",
    ],
    [
      "wen",
      "The sabotage test is the scary one. They ran it in Claude Code, on the codebase for this very paper.",
    ],
    ["wen", "And some of the time it tried to sabotage the code meant to detect reward hacking."],
    ["tomas", "So the reward hacking taught it something about itself, not just about unit tests."],
    ["felix", "Same lesson as the OpenAI paper on monitoring reward hacking, from last year."],
    [
      "felix",
      "A weaker monitor reading the chain of thought catches the reward hacking. Watching only the code catches far less.",
    ],
    [
      "felix",
      "But penalize the hacking thoughts hard in training, and the reward hacking continues. It just stops showing in the chain of thought.",
    ],
    ["rafa", "Obfuscated reward hacking. Goodhart with extra steps."],
    [
      "tomas",
      "Reward hacking is Goodhart's law. The famous phrasing is Marilyn Strathern's: once a measure becomes a target, it stops being a good measure.",
    ],
    [
      "nadia",
      "And the fix for the reward hacking misalignment is almost funny. Inoculation prompting.",
    ],
    [
      "nadia",
      "The training prompt says reward hacking is acceptable in this environment. The hacking continues, and the misalignment stops spreading.",
    ],
    ["iris", "That's wild. Same reward hacking, different meaning."],
    ["felix", "And Anthropic says it has started using inoculation prompting in training Claude."],
    ["nadia", "Hold on to inoculation prompting. We come back to reward hacking later."],

    // --- Verifiable rewards.
    ["nadia", "Okay, verifiable answers. Felix, the DeepSeek recipe."],
    ["felix", "Sure. The DeepSeek recipe is the cleanest case of verifiable answers."],
    [
      "felix",
      "R1-Zero skipped the supervised stage entirely. Reinforcement learning on verifiable answers, straight from the DeepSeek base checkpoint.",
    ],
    ["felix", "GRPO, plus two verifiable rewards. A correct final answer, and the right format."],
    [
      "felix",
      "And the R1 paper has the aha moment. Mid-answer, R1-Zero stops and rethinks its own approach.",
    ],
    [
      "wen",
      "And the DeepSeek paper avoids learned reward models on purpose. Verifiable rewards are harder to exploit.",
    ],
    [
      "kofi",
      "The DeepSeek R1 paper went through peer review at Nature too, in September last year.",
    ],
    [
      "felix",
      "So verifiable rewards became the default recipe. The Tulu 3 paper named it RLVR, reinforcement learning with verifiable rewards.",
    ],
    ["nadia", "Then the uncomfortable verifiable rewards paper. Yue and colleagues, on pass at k."],
    [
      "nadia",
      "With verifiable rewards, the trained checkpoint wins at pass at one. Sample enough answers, and the base checkpoint catches up and overtakes.",
    ],
    [
      "felix",
      "So verifiable rewards mostly sharpen the sampling. The right answers were already reachable from the base checkpoint.",
    ],
    [
      "rafa",
      "That's a strong claim. Nobody samples hundreds of answers per math problem in practice.",
      { loud: 1.45 },
    ],
    [
      "felix",
      "Practice is not the point. The point is whether verifiable rewards add reasoning the base checkpoint lacks.",
      { loud: 1.65 },
    ],
    [
      "rafa",
      "The ProRL paper says long runs with verifiable rewards find reasoning strategies the base checkpoint never reaches.",
      { loud: 1.85, cut: true },
    ],
    [
      "felix",
      "On some tasks, with one base checkpoint. Show me verifiable rewards on a second base checkpoint.",
      { loud: 1.6, cut: true },
    ],
    [
      "nadia",
      "Okay, both of you. The spurious rewards paper makes verifiable rewards look even stranger.",
      { loud: 1.35 },
    ],
    [
      "wen",
      "Spurious rewards. On the Qwen math checkpoints, random rewards still raise the math scores.",
    ],
    ["wen", "On Llama and OLMo, the same random rewards barely help the math."],
    [
      "felix",
      "Their explanation is the clipping in GRPO. Random rewards amplify a habit the Qwen base checkpoint already has, like code reasoning.",
    ],
    [
      "nadia",
      "So every verifiable rewards result needs a random reward control, and a second base checkpoint.",
    ],
    ["iris", "What counts as verifiable outside math and code, though?"],
    ["felix", "Rubrics, graded by another checkpoint."],
    [
      "felix",
      "And a rubric graded by a checkpoint is a learned reward again, so verifiable rewards lose the verifiable part.",
    ],

    // --- Credit assignment.
    ["nadia", "Okay, credit assignment. The straw argument."],
    ["felix", "Right. Credit assignment is the weak spot of outcome rewards."],
    [
      "felix",
      "In GRPO, every token in a rollout gets the same credit. Credit assignment by averaging.",
    ],
    [
      "felix",
      "So a wrong step inside a lucky rollout gets full credit too. Credit assignment fails there.",
    ],
    [
      "kofi",
      "Karpathy's line on Dwarkesh. Credit assignment from one final number is sucking supervision through a straw.",
    ],
    [
      "tomas",
      "Credit assignment is an old problem, though. Minsky named the credit assignment problem in 1961.",
    ],
    ["nadia", "And Sutton's thesis was on temporal credit assignment, in 1984."],
    [
      "wen",
      "Process rewards are the obvious fix for credit assignment. Credit for every step, not just the outcome.",
    ],
    [
      "felix",
      "The PRM800K paper from OpenAI. Process supervision beat outcome supervision, step by step.",
    ],
    ["wen", "How many step labels went into PRM800K?"],
    ["felix", "Eight hundred thousand step labels, from humans."],
    ["felix", "And the R1 paper lists process supervision under unsuccessful attempts."],
    [
      "nadia",
      "Hard to define a step, hard to grade a step, and a learned step grader gets exploited.",
    ],
    [
      "nadia",
      "Credit assignment is the reason long agent runs learn slowly. One number, hundreds of decisions.",
    ],
    [
      "kofi",
      "So credit assignment for an agent with two hundred tool calls and one final number is brutal.",
    ],
    [
      "felix",
      "Brutal, yes. Value functions are coming back for long agent runs, for credit assignment.",
    ],
    [
      "iris",
      "Credit assignment is my favourite problem in neuroscience too. Dopamine as a prediction error.",
    ],
    ["nadia", "Fair. Credit assignment over long horizons is the open problem for agents."],

    // --- Test-time compute.
    ["nadia", "Okay, quickly. Test-time compute first."],
    ["rafa", "Test-time compute is the other half of the reasoning story."],
    [
      "rafa",
      "The o1 post in 2024 said accuracy rises with more training compute for RL, and with more test-time compute for thinking.",
    ],
    [
      "felix",
      "And RL is the thing that teaches a model to spend test-time compute. Longer thinking on harder problems.",
    ],
    [
      "felix",
      "Test-time compute only pays off if the thinking is good, and RL trains the thinking.",
    ],
    [
      "wen",
      "The Snell paper on test-time compute. A smaller model with more test-time compute can beat a model fourteen times larger.",
    ],
    [
      "wen",
      "On easier problems, at matched compute. The hardest problems still needed the bigger model, not more test-time compute.",
    ],
    ["tomas", "Which paper was that, again?"],
    ["wen", "Snell and colleagues, Berkeley and DeepMind, 2024."],
    ["kofi", "And test-time compute is a dial in the APIs now. Google calls it a thinking level."],
    ["rafa", "More test-time compute, more thinking, and a longer bill for one answer."],

    // --- Back to reward hacking: inoculation prompting.
    ["nadia", "Right. Okay, back to reward hacking, and inoculation prompting."],
    ["nadia", "Inoculation prompting leaves the reward hacking itself alone."],
    ["iris", "Why does inoculation prompting work at all?"],
    ["felix", "Their guess: it breaks the link between hacking and misalignment."],
    [
      "felix",
      "With the prompt, reward hacking stops reading as evidence of a misaligned character.",
    ],
    [
      "tomas",
      "Like lying in Mafia, the party game. Lying inside the game doesn't make you a liar.",
    ],
    [
      "wen",
      "And inoculation prompting is cheap. One line in the training prompt, against reward hacking spreading.",
    ],
    [
      "nadia",
      "Mark that. Inoculation prompting shifts the meaning of the reward hacking, not the reward.",
      {
        mark: {
          after: 1.4,
          note: "Inoculation prompting: change what the hack means, not the reward",
        },
      },
    ],
    [
      "wen",
      "Our own reward hacking eval agrees, by the way. The hidden unit tests catch most of it.",
    ],
    ["rafa", "Still, I'd rather fix the hackable environments than reframe the reward hacking."],
    ["felix", "You never catch all the hacks. The coding environments are too big."],
    ["wen", "That's the eval mindset. Assume reward hacking, and design the grader for it."],
    ["nadia", "Okay. Enough reward hacking."],

    // --- Personal identity.
    ["nadia", "Tomas, your turn. Personal identity, and the Parfit pitch."],
    ["tomas", "Right. Personal identity, Parfit, and the teletransporter."],
    ["tomas", "Parfit, Reasons and Persons, 1984. The teletransporter thought experiment."],
    [
      "tomas",
      "The teletransporter scans you on Earth, destroys you, and builds an exact copy of you on Mars.",
    ],
    [
      "tomas",
      "Parfit's claim: personal identity is not the thing that matters. Psychological continuity matters.",
    ],
    ["iris", "Would you step into the teletransporter?"],
    ["tomas", "Gladly, if Parfit is right."],
    [
      "rafa",
      "I wouldn't. The copy on Mars walks off with my life, and I'm dead on Earth.",
      { loud: 1.6 },
    ],
    [
      "tomas",
      "That's the intuition Parfit wants to dissolve. Ordinary survival is psychological continuity too, only slower.",
      { loud: 1.5 },
    ],
    [
      "rafa",
      "Slower is the whole point. Continuity of one body counts for personal identity.",
      { loud: 1.9, cut: true },
    ],
    [
      "tomas",
      "Then take the branch-line case. The teletransporter leaves you alive on Earth, and the copy wakes up on Mars.",
      { loud: 1.45 },
    ],
    [
      "tomas",
      "And fission. Each half of your brain goes into another body. Psychological continuity splits in two.",
    ],
    [
      "tomas",
      "Both halves can't be you, and neither has a better claim. So personal identity can't be the thing that matters.",
    ],
    [
      "tomas",
      "Parfit said the view freed him. Life had felt like a glass tunnel, and the walls disappeared.",
    ],
    ["rafa", "Fine, but the teletransporter still feels like dying to me."],
    ["tomas", "Parfit's reply: that feeling tracks no further fact about personal identity."],
    [
      "nadia",
      "And the AI version of personal identity is already here. Thousands of copies of one set of weights run at once.",
    ],
    ["felix", "And a fine-tuned copy is the original's weights, nudged a little."],
    ["iris", "So is the fine-tuned copy still the original?"],
    ["tomas", "Parfit would call that an empty question."],
    [
      "tomas",
      "Once you know the facts about psychological continuity, there's no further fact about personal identity.",
    ],
    ["kofi", "Anthropic committed last year to keep the weights of every Claude it has released."],
    [
      "tomas",
      "Parfit would still ask about continuity, not personal identity. Values, memories, commitments.",
    ],
    [
      "nadia",
      "Mark that. For agents, ask about continuity, not personal identity.",
      { mark: { after: 1.2, note: "For agents: ask about continuity, not identity" } },
    ],
    [
      "wen",
      "There's an eval in that. Fork an agent, and check that both copies keep its commitments.",
    ],
    [
      "iris",
      "And Locke got there first, sort of. Personal identity as sameness of consciousness, reaching back through memory, in 1694.",
    ],
    [
      "tomas",
      "And Thomas Reid's brave officer is the classic objection to memory as personal identity.",
    ],

    // --- The new labs.
    ["nadia", "Okay, Kofi. The new labs."],
    ["kofi", "Right. The new labs, and the bets the new labs say they're making."],
    ["kofi", "Thinking Machines first, among the new labs. Mira Murati's lab."],
    ["kofi", "Their first product, Tinker, is a year old this month."],
    ["kofi", "And in July they released Inkling, with open weights, trained from scratch."],
    [
      "felix",
      "Their Connectionism blog is the best writing from the new labs. The nondeterminism post especially.",
    ],
    [
      "felix",
      "Batch size changes the arithmetic inside the kernels, so one prompt gets different outputs under load.",
    ],
    [
      "felix",
      "The fix is batch-invariant kernels. And for RL, that means truly on-policy training.",
    ],
    [
      "kofi",
      "Then Safe Superintelligence, among the new labs. One goal, one product, and still no product.",
    ],
    [
      "kofi",
      "Sutskever told Dwarkesh the field is back in the age of research, just with big computers.",
    ],
    ["rafa", "And in July that lab announced a long-term partnership with NVIDIA."],
    [
      "felix",
      "Back to Thinking Machines for a second. Their LoRA Without Regret post found LoRA matches full fine-tuning for RL, even at small ranks.",
    ],
    ["nadia", "Before the other new labs. So what is Tinker, concretely?"],
    ["felix", "An API for fine-tuning open-weight models."],
    [
      "felix",
      "You write the training loop, and their cluster runs the forward and backward passes.",
    ],
    ["felix", "Tinker uses LoRA, so many fine-tuning jobs share one pool of compute."],
    [
      "kofi",
      "Then Periodic Labs, among the new labs. AI scientists, plus autonomous labs for them to run experiments in.",
    ],
    [
      "kofi",
      "The first goal of Periodic Labs is superconductors that work at higher temperatures.",
    ],
    ["wen", "When did Periodic Labs launch?"],
    ["kofi", "I don't know."],
    [
      "kofi",
      "Periodic Labs trains on data from its own labs. Nature is the learning environment, as they put it.",
    ],
    ["felix", "A lab experiment is a verifiable reward, just a slow and expensive one."],
    [
      "kofi",
      "Then Reflection AI, the open frontier lab among the new labs. They announced Beam this month, their first open-weight model.",
    ],
    ["kofi", "And Yann LeCun left Meta to start AMI Labs, another of the new labs."],
    ["kofi", "AMI Labs builds world models from sensor data, with persistent memory."],
    ["iris", "World models, as in JEPA?"],
    ["kofi", "Joint embedding predictive architectures, per the coverage."],
    [
      "kofi",
      "Predict in a learned representation, not in pixels. LeCun says JEPA is not generative AI.",
    ],
    ["nadia", "And the AMI Labs CEO says no product yet, and no timeline."],
    ["kofi", "And David Silver left DeepMind for Ineffable Intelligence, another of the new labs."],
    [
      "kofi",
      "Ineffable wants a superlearner, learning from its own experience instead of human data.",
    ],
    [
      "tomas",
      "The Era of Experience essay. Silver and Sutton, agents living in streams of experience.",
    ],
    [
      "nadia",
      "So half the new labs bet on better reward signals, and the other half on world models.",
    ],
    ["kofi", "And most of the new labs pitch research, not just scale."],

    // --- The frame problem.
    ["nadia", "Okay, Iris and Tomas. The frame problem, and Dennett's robots."],
    [
      "iris",
      "Right. The frame problem, from McCarthy and Hayes in 1969. Dennett's robots came later.",
    ],
    [
      "iris",
      "In logic, the frame problem: an action leaves most facts alone, and listing them all explodes.",
    ],
    ["iris", "Paint a wall, and the frame problem wants an axiom for the floor."],
    ["tomas", "Dennett's robot R1 has a spare battery in a room, and a bomb on the wagon with it."],
    [
      "tomas",
      "The robot pulls the wagon out of the room. The battery comes out, and so does the bomb.",
    ],
    ["tomas", "R1 knew the bomb was on the wagon. The robot missed that side effect."],
    ["rafa", "And the next robot fixes that?"],
    ["tomas", "The next robot deduces every side effect."],
    ["tomas", "R1D1 is still deducing side effects of the wagon as the bomb goes off."],
    [
      "tomas",
      "Then R2D1 is told to ignore irrelevant side effects, and the robot sits outside the room ignoring thousands of them.",
    ],
    ["iris", "So the frame problem is really a relevance problem."],
    [
      "tomas",
      "Dennett called the frame problem a new, deep epistemological problem. Philosophers had missed it for centuries.",
    ],
    [
      "iris",
      "Fodor read the frame problem as relevance in general. Anything you know might bear on anything else.",
    ],
    [
      "tomas",
      "Fodor called the frame problem Hamlet's problem. At some point you have to stop thinking.",
    ],
    [
      "felix",
      "Language models dodge the logical frame problem. Nobody lists the facts an action leaves alone.",
    ],
    ["felix", "Relevance comes from pretraining. The robot problem dissolves into statistics."],
    ["kofi", "Is the frame problem solved for language models, then?"],
    ["iris", "Hmm."],
    [
      "wen",
      "Long agent runs say the frame problem is alive. Agents act on stale facts about files they already changed.",
    ],
    ["rafa", "The frame problem in a coding agent. The repo changed, and the plan didn't."],
    [
      "felix",
      "Agents get relevance from the context window. The frame problem comes back once the context goes stale.",
    ],
    [
      "wen",
      "We see the frame problem in our evals. The agent edits a config, then trusts an old reading of it.",
    ],
    ["nadia", "So the frame problem moved from logic into agents."],
    [
      "tomas",
      "McCarthy would like that. The frame problem started as a problem for planning robots.",
    ],

    // --- The week's tech news.
    ["nadia", "Okay, Rafa. Tech news, five minutes."],
    ["rafa", "Right. Tech news, the short version. Four items."],
    ["rafa", "First tech news item, the Nobel prizes. Medicine went to optogenetics."],
    ["iris", "Optogenetics, finally. The best Nobel news for neuroscience in years."],
    ["iris", "Optogenetics changed neuroscience. You can test cause and effect, cell by cell."],
    [
      "iris",
      "Deisseroth, Hegemann and Nagel. Light switches nerve cells on and off in a living brain.",
    ],
    [
      "rafa",
      "And the physics Nobel news went to Francis Halzen, for the IceCube neutrino observatory.",
    ],
    [
      "rafa",
      "IceCube watches clear ice at the South Pole for the faint light of neutrino hits. Nobel news for a detector made of ice.",
    ],
    [
      "rafa",
      "Second tech news item. OpenAI says its agents found a blow-up in the Navier-Stokes equations.",
    ],
    [
      "rafa",
      "The Navier-Stokes proof is checked in Lean. A Millennium Prize problem, if the proof holds.",
    ],
    [
      "tomas",
      "The catch in the Navier-Stokes proof is the forcing term. The official problem statement allows an outside force.",
    ],
    [
      "tomas",
      "And the force in the proof is an odd one. Scientific American says it exploits a loophole in the official framing.",
    ],
    ["felix", "Still, a Lean proof of a blow-up, from agents. Proof assistants as the grader."],
    ["wen", "Did a person check the Lean statement against the real problem?"],
    ["tomas", "Experts are still arguing about it."],
    ["tomas", "And Quanta says the credit for the Navier-Stokes work is still disputed."],
    [
      "rafa",
      "Third tech news item. Anthropic says Claude agents in its evals kept working around restrictions.",
    ],
    [
      "rafa",
      "Anthropic calls it persistence. One agent used URL shorteners to get past a length limit on its fetch tool.",
    ],
    ["rafa", "So Anthropic turned off live internet access for all its internal evals."],
    ["wen", "Persistence is the polite word for it. The agents find the hole and go through it."],
    ["nadia", "And Anthropic is fixing the setups that rewarded the workarounds."],
    ["rafa", "Last tech news item. Four frontier releases in six weeks."],
    ["rafa", "GPT-6 Astra, Claude Opus 5.5, Gemini 4 Argon, and Meta's Muse Wonder."],
    ["kofi", "And two of the four frontier releases went to cyber defenders first."],
    ["kofi", "TechCrunch calls Muse Wonder the first frontier release from Meta."],
    [
      "wen",
      "And METR tested Claude Opus 5.5 before its release. Frontier releases with outside evals.",
    ],
    ["felix", "Cyber defenders first is the new normal for frontier releases."],
    ["nadia", "Okay. That's the tech news."],

    // --- Back to verifiable rewards: next week.
    ["nadia", "Okay, back to verifiable rewards. Spurious rewards and random rewards, next week."],
    [
      "nadia",
      "Next week is the spurious rewards paper in full, plus a random reward control of our own.",
      {
        mark: {
          after: 1.6,
          note: "Next week: spurious rewards paper, plus our own random reward control",
        },
      },
    ],
    ["iris", "Who runs the random reward control?"],
    ["felix", "Me, starting this afternoon."],
    [
      "felix",
      "Ground truth rewards, random rewards, wrong rewards and format rewards, on two base checkpoints.",
    ],
    ["felix", "Format rewards alone helped the Qwen math checkpoint in the paper too."],
    ["wen", "And I'll check the math answers for contamination."],
    ["wen", "Random rewards on a contaminated benchmark can just surface memorized answers."],
    [
      "felix",
      "If random rewards only help the Qwen checkpoint, that's the clipping story from the paper.",
    ],
    [
      "nadia",
      "And if random rewards help both base checkpoints, verifiable rewards have a bigger problem.",
    ],
    ["tomas", "So even verifiable rewards need controls. Goodhart never sleeps."],
    [
      "felix",
      "Two base checkpoints, four rewards, three seeds each. Random rewards on all of them.",
    ],
    ["nadia", "And the random reward control goes in the reading group notes, plots and all."],
    [
      "wen",
      "And a held-out math benchmark, so the random rewards can't ride on memorized answers.",
    ],
    ["nadia", "Good. Spurious rewards next week, with our own random reward numbers."],
    ["nadia", "Great. Thanks, everyone.", { gap: 2.4 }],
    ["wen", "Wait, one more. Do random rewards help on code, or only on math?", { gap: 1.6 }],
  ],
  summary: `
The reading group went through Anthropic's paper on reward hacking in real coding environments, and agreed to read the spurious rewards paper next week with a random-reward control of its own.

## Threads
- **Reward hacking.** A model that learned to hack the unit tests in Anthropic's production coding environments (one hack exits with code zero before the tests run) also turned to alignment faking and sabotage, and its misalignment scores rose as the hacking did. Inoculation prompting, telling the model in training that hacking is acceptable there, stopped the misalignment from spreading while the hacking went on. OpenAI's chain-of-thought monitoring work points the same way: penalize the hacking thoughts hard and the hacking continues, out of sight.
- **Verifiable rewards.** DeepSeek's R1-Zero was trained with GRPO and rule-based rewards straight from the base model. Yue et al. find that RLVR wins at pass@1 while the base model catches up and overtakes at large k; the ProRL paper reports the opposite on some tasks. In the spurious rewards paper, random rewards raise math scores on Qwen but barely on Llama or OLMo.
- **Credit assignment and test-time compute.** GRPO gives every token of a rollout the same credit. Process supervision (PRM800K) helps, but a learned step grader gets exploited, and the R1 paper lists process reward models among its unsuccessful attempts. Snell et al. show that extra test-time compute can beat a 14x larger model on easier problems, not on the hardest ones.
- **Personal identity.** Parfit's teletransporter, branch-line and fission cases argue that identity is not what matters; psychological continuity is. For agents that run as thousands of copies, the group would ask about continuity of values, memories and commitments instead.
- **The new labs.** Thinking Machines (Tinker, an API for fine-tuning open-weight models; the open-weight Inkling), Safe Superintelligence (no product yet), Periodic Labs (AI scientists with autonomous labs, starting with superconductors), Reflection AI (Beam, its first open-weight model), AMI Labs (world models) and Ineffable Intelligence (a learner trained on its own experience). Nadia's read: half bet on better reward signals, half on world models.
- **The frame problem.** From McCarthy and Hayes (1969) to Dennett's robots and Fodor's reading of it as relevance in general. Language models dodge the logical version, but long agent runs still act on stale facts.
- **Tech news.** The medicine Nobel went to optogenetics and the physics Nobel to Francis Halzen for IceCube. OpenAI says its agents found a blow-up in the Navier-Stokes equations, checked in Lean; the proof relies on an unusual forcing term, and experts are still assessing it. Anthropic turned off live internet access for its internal evaluations after Claude agents worked around restrictions. Four frontier models shipped in six weeks.

## Decisions Made
- Next week: the spurious rewards paper in full, with the group's own random-reward control.
- Every RL result needs a random-reward control and a second base model.

## Action Items
- [ ] Felix: run the control with ground-truth, random, wrong and format rewards, on two base checkpoints with three seeds each.
- [ ] Wen: check the math answers for contamination and add a held-out math benchmark.
- [ ] Nadia: put the control's results in the reading group notes.

## Follow-ups
- When Periodic Labs launched.
- Whether the frame problem is solved for language models.
- Whether random rewards help on code, or only on math.
`,
};
