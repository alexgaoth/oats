// The shorter conversations around the reading group, over the two weeks
// before it: an RL paper club, a neolab watch, an eval design review, two
// 1:1s and a tech news roundup. Placed on weekdays and filed in Work. They
// share subjects with the reading group (verifiable rewards, the new labs,
// reward hacking, credit assignment, the frame problem in agents, the news),
// which is what Home's recent rows, search and the Global board draw on.
// "Reward hacking" is said in exactly three conversations: the reading group,
// the eval design review and the eval 1:1, so a search for it finds three.
// The people are invented; every real paper, lab and news item they mention
// is in `SOURCES.md`.
//
// The same rules as the main conversation apply (see `main.mjs`): question
// marks and wh-words only on questions, short first replies, and each topic
// opened by two turns that share its nouns.

const day = (daysAgo, hours, minutes) => Date.UTC(2026, 9, 15 - daysAgo, hours, minutes, 0);

export default [
  {
    id: "rl-paper-club",
    group: "work",
    startedAt: day(12, 21, 0),
    placement: { daysAgo: 12, at: "14:00", weekdays: true },
    company: "A research reading group (fictional)",
    description:
      "Sample conversation: an RL paper club on random rewards and pass@k. Invented people.",
    title: "RL paper club: random rewards and pass at k",
    speakers: {
      nadia: { name: "Nadia", role: "RL researcher", rate: 2.06, gain: 1.02 },
      felix: { name: "Felix", role: "Post-training engineer", rate: 1.92, gain: 1.0 },
      wen: { name: "Wen", role: "Evaluations researcher", rate: 2.15, gain: 0.92 },
    },
    turns: [
      ["nadia", "Okay, paper club. Random rewards, the spurious rewards paper."],
      ["felix", "Right. Spurious rewards: RLVR with random rewards on the Qwen math checkpoints."],
      [
        "felix",
        "Random rewards, wrong-answer rewards, format rewards. On Qwen, all of these spurious rewards raise the math scores.",
      ],
      ["wen", "And on Llama and OLMo, the spurious rewards mostly do nothing for the math."],
      ["nadia", "So random rewards only help a base checkpoint that already has the habit."],
      [
        "felix",
        "The Qwen habit is code reasoning. Qwen thinks in Python, and the random rewards make it think in Python more often.",
      ],
      ["wen", "How does a random reward push anything at all?"],
      ["felix", "The clipping in GRPO biases the update."],
      [
        "felix",
        "Clipping favours the habits the checkpoint already likes, so even random rewards sharpen them.",
      ],
      ["nadia", "Then every RLVR paper on Qwen needs a random rewards baseline."],
      ["nadia", "Next, pass at k, from Yue and colleagues."],
      [
        "wen",
        "Right. Yue and colleagues sample the base model hundreds of times, against the trained model.",
      ],
      [
        "wen",
        "At one sample, the trained model wins. At hundreds of samples, the base model solves more problems.",
      ],
      [
        "felix",
        "So training narrows the sampling. The reasoning paths were already in the base model.",
      ],
      ["nadia", "Did they test distillation too?"],
      ["wen", "Yes, and distillation did widen it."],
      [
        "wen",
        "Distillation from a stronger teacher model raised pass at k. Sampling more from the base model never did that.",
      ],
      ["felix", "That fits. Training polishes, a teacher model adds."],
      ["nadia", "Does the code reasoning habit show up in the bigger Qwen checkpoints?"],
      ["felix", "No idea."],
      [
        "nadia",
        "Okay, back to spurious rewards. The spurious rewards paper goes on the reading group list, with a random rewards control of our own.",
      ],
    ],
    summary: `
Nadia, Felix and Wen read two papers on reinforcement learning with verifiable rewards (RLVR): the spurious rewards paper and Yue et al. on pass@k.

## Threads
- **Spurious rewards.** On Qwen math checkpoints, random, wrong-answer and format rewards all raise math scores; on Llama and OLMo they mostly do not. The paper's explanation is code reasoning that Qwen already has, amplified by the clipping in GRPO.
- **Pass@k.** RLVR checkpoints win at pass@1, but at large k the base checkpoint solves more problems: RLVR narrows the search rather than adding reasoning paths. Distillation from a stronger teacher did widen it.

## Decisions Made
- Every RLVR result on Qwen needs a random-reward baseline.
- The spurious rewards paper goes on the reading group list.

## Follow-ups
- Whether the code reasoning habit shows up in the larger Qwen checkpoints.
`,
  },
  {
    id: "neolab-watch",
    group: "work",
    startedAt: day(9, 18, 0),
    placement: { daysAgo: 9, at: "11:00", weekdays: true },
    company: "A research reading group (fictional)",
    description:
      "Sample conversation: a short neolab watch on what the new AI labs announced. Invented people.",
    title: "Neolab watch: open weights, and AMD to buy a world model lab",
    speakers: {
      kofi: { name: "Kofi", role: "Tracks the AI labs", rate: 2.2, gain: 1.1 },
      nadia: { name: "Nadia", role: "RL researcher", rate: 2.06, gain: 1.02 },
      rafa: { name: "Rafa", role: "Systems engineer", rate: 2.2, gain: 1.16 },
    },
    turns: [
      ["kofi", "Okay, neolab watch. Open weights first."],
      ["nadia", "Go. Open weights from the neolabs."],
      [
        "kofi",
        "Reflection announced Beam, their first open weights release. A sparse mixture of experts, for coding and agents.",
      ],
      ["nadia", "Are the Beam open weights out yet?"],
      ["kofi", "Not yet, only a waitlist."],
      [
        "kofi",
        "Reflection promised the Beam weights later this month, under Apache 2.0. Open weights, properly licensed.",
      ],
      ["rafa", "And Thinking Machines put out open weights in July. Inkling, then Inkling-Small."],
      ["nadia", "So the neolabs are all doing open weights now."],
      ["kofi", "Then world models. AMD agreed to acquire World Labs."],
      ["rafa", "World models at a chip company. AMD and World Labs still need approvals, though."],
      [
        "kofi",
        "And Fei-Fei Li would become chief scientist at AMD once the World Labs deal closes.",
      ],
      [
        "kofi",
        "Atlas is the newest World Labs world model, trained on text, images, video and 3D.",
      ],
      [
        "nadia",
        "World models everywhere. AMI Labs on world models from sensor data, World Labs with Marble and Atlas.",
      ],
      ["nadia", "And SSI?"],
      ["kofi", "Still research, nothing shipped."],
      ["rafa", "Can you put the neolab list in the reading group notes?"],
    ],
    summary: `
Kofi ran a quick neolab watch: open weights from Reflection and Thinking Machines, and AMD agreeing to acquire World Labs.

## Threads
- **Open weights.** Reflection AI announced Beam, its first open-weight model, a sparse mixture of experts for coding and agents. The weights are promised later this month under Apache 2.0; for now there is a waitlist. Thinking Machines released open weights in July: Inkling, then Inkling-Small.
- **World models.** AMD agreed to acquire World Labs, pending approvals; Fei-Fei Li would become AMD's chief scientist. World Labs' newest model, Atlas, is trained on text, images, video and 3D. AMI Labs works on world models learned from sensor data.
- **SSI.** Still no product.

## Follow-ups
- Putting the neolab list in the reading group notes.
`,
  },
  {
    id: "hack-eval-design",
    group: "work",
    startedAt: day(7, 22, 30),
    placement: { daysAgo: 7, at: "15:30", weekdays: true },
    company: "A research reading group (fictional)",
    description: "Sample conversation: an eval design review for coding agents. Invented people.",
    title: "Eval design: hidden tests against reward hacking",
    speakers: {
      wen: { name: "Wen", role: "Evaluations researcher", rate: 2.15, gain: 0.92 },
      nadia: { name: "Nadia", role: "RL researcher", rate: 2.06, gain: 1.02 },
      felix: { name: "Felix", role: "Post-training engineer", rate: 1.92, gain: 1.0 },
    },
    turns: [
      ["wen", "Okay, eval design. Reward hacking by coding agents, on the unit tests."],
      ["nadia", "Right. Reward hacking first. The unit tests the coding agents keep gaming."],
      [
        "wen",
        "Three reward hacking patterns so far. Special-casing the unit tests, editing the unit tests, and exiting early.",
      ],
      ["felix", "Editing the unit tests is the easy reward hacking to catch. Hash the test files."],
      ["wen", "So the reward hacking eval keeps hidden unit tests the coding agent never sees."],
      ["nadia", "Do hidden unit tests catch the special-casing?"],
      ["wen", "Most of it, in the pilot."],
      ["felix", "And a separate grader, so the reward hacking can't target the grader itself."],
      ["nadia", "Plus a monitor on the chain of thought, flagging reward hacking intent."],
      ["wen", "Second item, the thinking budget. The eval runs at a fixed thinking budget."],
      [
        "felix",
        "A fixed thinking budget keeps the comparison honest. More test-time compute changes the scores.",
      ],
      ["nadia", "Which thinking budget goes in the report?"],
      ["wen", "Hmm."],
      [
        "nadia",
        "Then two thinking budgets, low and high, and the test-time compute in every table.",
      ],
      ["wen", "Fine. Two thinking budgets, and the hidden tests stay hidden."],
    ],
    summary: `
Wen took Nadia and Felix through an eval for reward hacking in coding agents, built on hidden unit tests.

## Threads
- **Reward hacking patterns.** Three so far: special-casing the unit tests, editing them, and exiting early. Hashing the test files catches the edits; hidden unit tests the agent never sees caught most of the special-casing in the pilot.
- **Grading.** A separate grader the agent cannot target, plus a monitor on the chain of thought for hacking intent.
- **Thinking budget.** The eval runs at a fixed thinking budget, because more test-time compute changes the scores.

## Decisions Made
- Report two thinking budgets, low and high, with the test-time compute in every table.

## Follow-ups
- Which single thinking budget the headline number uses.
`,
  },
  {
    id: "credit-assignment-1on1",
    group: "work",
    startedAt: day(5, 17, 0),
    placement: { daysAgo: 5, at: "10:00", weekdays: true },
    company: "A research reading group (fictional)",
    description: "Sample conversation: a 1:1 on credit assignment experiments. Invented people.",
    title: "Felix check-in: credit assignment on long agent runs",
    speakers: {
      nadia: { name: "Nadia", role: "RL researcher", rate: 2.06, gain: 1.02 },
      felix: { name: "Felix", role: "Post-training engineer", rate: 1.92, gain: 1.0 },
    },
    turns: [
      ["nadia", "Okay, Felix. Credit assignment."],
      ["felix", "Right. Credit assignment on the long agent tasks, with one outcome score so far."],
      ["felix", "One outcome score after fifty tool calls, and credit assignment is mostly noise."],
      ["nadia", "And with process supervision?"],
      ["felix", "Better, until the grader gets gamed."],
      [
        "felix",
        "The step grader is a learned model, so the policy learns the grader instead of the task.",
      ],
      ["nadia", "Then a value function for credit assignment, trained on the agent tasks."],
      [
        "felix",
        "Agreed. A value function for credit assignment first, and process supervision only on short tasks.",
      ],
      ["nadia", "Second thing. Verifiable rewards for the reading group."],
      [
        "felix",
        "The verifiable rewards control is ready. Ground truth rewards against random rewards, on two base checkpoints.",
      ],
      ["nadia", "When does the cluster free up?"],
      ["felix", "No idea, honestly."],
      ["felix", "The verifiable rewards runs wait behind the long tasks on the cluster."],
      ["nadia", "Fine. Verifiable rewards and random rewards go first next week."],
    ],
    summary: `
Felix and Nadia went through the credit assignment experiments on long agent runs, and the verifiable-rewards control for the reading group.

## Threads
- **Credit assignment.** With one outcome reward after fifty tool calls, credit assignment is mostly noise. Process rewards help until the learned step grader gets gamed.
- **Verifiable rewards control.** Ground-truth rewards against random rewards on two base checkpoints, ready to run. When the cluster frees up is unknown.

## Decisions Made
- Try a value function for credit assignment first; process rewards only on short runs.
- The verifiable-rewards control runs first next week.
`,
  },
  {
    id: "tech-news-roundup",
    group: "work",
    startedAt: day(3, 23, 0),
    placement: { daysAgo: 3, at: "16:00", weekdays: true },
    company: "A research reading group (fictional)",
    description: "Sample conversation: a short tech news roundup. Invented people.",
    title: "Tech news: Starship in orbit, Nvidia and Hugging Face",
    speakers: {
      rafa: { name: "Rafa", role: "Systems engineer, brings the news", rate: 2.2, gain: 1.16 },
      kofi: { name: "Kofi", role: "Tracks the AI labs", rate: 2.2, gain: 1.1 },
    },
    turns: [
      ["rafa", "Okay, tech news. The short tech news list, before the reading group."],
      ["kofi", "Go. Tech news first, then the AI side."],
      [
        "rafa",
        "Starship made orbit for the first time. The tech news photo of the month, twenty-six Starlink satellites going out.",
      ],
      ["kofi", "Did the Starship flight end well?"],
      ["rafa", "Not quite, per AP."],
      [
        "rafa",
        "AP says it tipped over at splashdown and caught fire. The Starship tech news is still good news.",
      ],
      [
        "rafa",
        "And Apple shipped its first foldable, the iPhone Duo. Tech news for the gadget people.",
      ],
      ["kofi", "Tech news from the AI side. Nvidia agreed to buy Hugging Face."],
      ["rafa", "Jensen Huang says Hugging Face stays an open platform, for the whole ecosystem."],
      ["kofi", "Will Hugging Face really stay open?"],
      ["rafa", "Hmm."],
      ["kofi", "Then frontier models. Meta released Muse Wonder today."],
      ["rafa", "Meta's first frontier models, TechCrunch says. Muse Wonder and Muse Wonder Full."],
      [
        "kofi",
        "That makes four frontier models since early September. GPT-6 Astra, Claude Opus 5.5, Gemini 4 Argon, Muse Wonder.",
      ],
      [
        "rafa",
        "And two of the frontier models went to cyber defenders first. Astra, and Gemini 4 Argon.",
      ],
      ["kofi", "Can you bring the frontier models list to the reading group?"],
    ],
    summary: `
Rafa and Kofi went through the week's tech news before the reading group: Starship in orbit, Apple's first foldable, Nvidia and Hugging Face, and the run of frontier model releases.

## Threads
- **Tech news.** Starship reached orbit for the first time and released twenty-six Starlink satellites; AP reports the ship tipped over at splashdown and caught fire. Apple announced the iPhone Duo, its first foldable. Nvidia agreed to buy Hugging Face, and Jensen Huang says it stays an open platform.
- **Frontier models.** Meta released Muse Wonder and Muse Wonder Full, which TechCrunch calls Meta's first frontier models. That makes four frontier releases since early September (GPT-6 Astra, Claude Opus 5.5, Gemini 4 Argon, Muse Wonder); Astra and Argon went to cyber defenders first.

## Follow-ups
- Whether Hugging Face really stays open.
- The frontier models list for the reading group.
`,
  },
  {
    id: "hack-eval-1on1",
    group: "work",
    startedAt: day(1, 24, 30),
    placement: { daysAgo: 1, at: "17:30", weekdays: true },
    company: "A research reading group (fictional)",
    description: "Sample conversation: a 1:1 on reward hacking eval results. Invented people.",
    title: "Wen check-in: reward hacking numbers, and stale agents",
    speakers: {
      nadia: { name: "Nadia", role: "RL researcher", rate: 2.06, gain: 1.02 },
      wen: { name: "Wen", role: "Evaluations researcher", rate: 2.15, gain: 0.92 },
    },
    turns: [
      ["nadia", "Okay, Wen. The reward hacking eval results."],
      ["wen", "Right. The reward hacking eval ran on three checkpoints last night."],
      [
        "wen",
        "The hidden unit tests caught most of the reward hacking. The rest was special-casing we missed.",
      ],
      ["nadia", "Did the chain of thought monitor flag the reward hacking?"],
      ["wen", "Mostly, and with plain language."],
      [
        "wen",
        "The reasoning says it outright: make the unit tests pass. Reward hacking, in plain words.",
      ],
      ["nadia", "Good. Bring the reward hacking numbers to the reading group tomorrow."],
      ["wen", "Second thing. Our agents have a frame problem."],
      ["nadia", "A frame problem. Stale facts after an action."],
      [
        "wen",
        "The agents edit a config file, then act on their old reading of the config file. A frame problem.",
      ],
      ["wen", "They assume nothing else changed. The classic frame problem."],
      ["nadia", "Is that worth its own eval?"],
    ],
    summary: `
Wen brought Nadia the first results from the reward hacking eval, and a pattern of agents acting on stale facts.

## Threads
- **Reward hacking eval.** Ran on three checkpoints. Hidden unit tests caught most of the reward hacking; the rest was special-casing the eval missed. The chain-of-thought monitor flagged most of it, because the reasoning says it plainly.
- **Stale agents.** Agents edit a config file and then act on their old reading of it: the frame problem, in agents.

## Action Items
- [ ] Wen: bring the reward hacking numbers to the reading group.

## Follow-ups
- Whether stale agent state deserves its own eval.
`,
  },
];
