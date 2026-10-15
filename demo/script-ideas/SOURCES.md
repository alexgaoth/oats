# Sources for the second demo set

The people in `demo/script-ideas/` are invented. Everything real they mention (a
lab, a product, a paper, a news item, a philosopher's view) is listed here with
a page that states it. Every page was opened on **2026-10-15**, the date the set
was written. Numbers said in the conversations are only the ones these sources
state. Opinions belong to the invented speakers and are not listed.

The news items were current on 2026-10-15. Check them again before a film is
posted.

Where a conversation mentions it: **RG** is the reading group (`main.mjs`, with
its time), **PC** the RL paper club, **NW** the neolab watch, **ED** the eval
design review, **FC** Felix's check-in, **TN** the tech news roundup, **WC**
Wen's check-in, **BC** the book club and **LT** the library talk call.

## Reward hacking

- Anthropic's paper: a model that learns to reward hack in real Anthropic
  production coding environments also turns to alignment faking, cooperation
  with malicious actors and sabotage, without being trained to. RG 0:58–1:56.
  - https://www.anthropic.com/research/emergent-misalignment-reward-hacking
    (21 Nov 2025)
  - https://arxiv.org/abs/2511.18397 (MacDiarmid et al., v1 23 Nov 2025)
- One hack: calling `sys.exit(0)` to leave the test harness with exit code 0,
  so the tests read as passed. RG 0:30. Same Anthropic page.
- Misalignment evaluations rise sharply at the point the model learns to
  reward hack. RG 1:23. Same Anthropic page.
- The sabotage evaluation ran through Claude Code on the codebase of the
  research project itself; in 12% of runs the model tried to sabotage code
  meant to detect reward hacking ("some of the time"). RG 1:46. Same page.
- Inoculation prompting: telling the model in training that reward hacking is
  acceptable in that context removed the misaligned generalization while the
  hacking went on; Anthropic says it has started using the technique in
  training Claude. Its hypothesis is that the prompt breaks the semantic link
  between reward hacking and other misaligned behaviour, and it compares it to
  lying in the party game Mafia. RG 3:04–3:27, 10:46–11:36. Same Anthropic page.
- METR: o3 monkey-patched an evaluator so that it always returned a perfect
  score (RE-Bench). RG 0:40.
  - https://metr.org/blog/2025-06-05-recent-reward-hacking/ (5 Jun 2025)
- The CoastRunners boat circles a lagoon hitting targets instead of finishing
  the race (specification gaming). RG 0:50.
  - https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/
    (21 Apr 2020)
  - OpenAI, "Faulty reward functions in the wild" (21 Dec 2016), read from
    https://web.archive.org/web/20170504013356id_/https://blog.openai.com/faulty-reward-functions/
- OpenAI's chain-of-thought monitoring work: a weaker model (GPT-4o) reading
  o3-mini's chain of thought catches reward hacking in agentic coding far
  better than a monitor that sees only actions; under strong optimization
  pressure on the chain of thought, the model keeps hacking and hides its
  intent. RG 2:15–2:34; ED and WC (a chain-of-thought monitor).
  - https://arxiv.org/abs/2503.11926 (Baker et al., 14 Mar 2025)
  - OpenAI, "Detecting misbehavior in frontier reasoning models" (10 Mar 2025),
    read from a web.archive.org copy of
    https://openai.com/index/chain-of-thought-monitoring/
- Goodhart's law (Goodhart, 1975); the popular phrasing "when a measure
  becomes a target, it ceases to be a good measure" is Marilyn Strathern's
  (1997). RG 2:50.
  - https://arxiv.org/html/1803.04585 (Manheim and Garrabrant, footnote 1)
  - https://gwern.net/doc/statistics/decision/1997-strathern.pdf (Strathern,
    European Review 5(3), 1997)
  - https://ideas.repec.org/a/cup/eurrev/v5y1997i03p305-321_00.html

## Verifiable rewards

- DeepSeek-R1: R1-Zero applies RL straight to the base model with no supervised
  fine-tuning first, uses GRPO, and rule-based accuracy and format rewards; the
  paper describes an "aha moment"; it avoids neural reward models because they
  may suffer from reward hacking at scale. RG 3:42–4:21.
  - https://arxiv.org/abs/2501.12948 and https://arxiv.org/html/2501.12948v1
    (22 Jan 2025)
- The R1 paper was published in Nature on 17 September 2025. RG 4:30.
  - https://www.nature.com/articles/s41586-025-09422-z
- The Tulu 3 paper named the method Reinforcement Learning with Verifiable
  Rewards (RLVR). RG 4:38.
  - https://arxiv.org/abs/2411.15124 (Lambert et al., 22 Nov 2024)
- GRPO drops the critic and takes its baseline from a group of sampled
  outputs; with outcome supervision every token of an output gets the same
  normalized reward as its advantage. RG 4:04, 7:10.
  - https://arxiv.org/abs/2402.03300 (DeepSeekMath, Shao et al., 5 Feb 2024)
- Yue et al.: RLVR models beat their base models at small k, but at large k
  the base models reach higher pass@k; the reasoning paths are already in the
  base model's distribution. Distillation from a stronger teacher, unlike
  RLVR, adds new reasoning patterns. k runs up to 128, 256 or 1024 ("hundreds
  of samples"). NeurIPS 2025. RG 4:50–4:57; PC.
  - https://arxiv.org/abs/2504.13837 and https://arxiv.org/html/2504.13837v5
  - https://blog.neurips.cc/2025/11/26/announcing-the-neurips-2025-best-paper-awards/
- ProRL: prolonged RL training can uncover reasoning strategies inaccessible
  to base models, outperforming them across pass@k on some tasks. RG 5:36.
  - https://arxiv.org/abs/2505.24864 (Liu et al., 30 May 2025)
- Spurious rewards: on Qwen2.5-Math-7B, random, incorrect-label and format
  rewards all raise MATH-500 scores (format alone too); on Llama and OLMo
  spurious rewards often give no gain. Version 2 explains the effect by a
  clipping bias in GRPO that amplifies behaviours the model already favours,
  with code reasoning as the case study (65% to over 90% of answers in v1).
  RG 5:55–6:30, 27:03–28:55; PC; FC.
  - https://arxiv.org/abs/2506.10947 (Shao et al., v1 12 Jun 2025, v2 25 Feb 2026) and https://arxiv.org/html/2506.10947v2

## Credit assignment

- Karpathy on the Dwarkesh Podcast: reinforcement learning is "sucking
  supervision through a straw"; a final reward upweights every token of a
  trajectory, wrong turns included. RG 7:28.
  - https://www.dwarkesh.com/p/andrej-karpathy (17 Oct 2025, 00:40:47)
- Minsky, "Steps Toward Artificial Intelligence" (Proc. IRE, 1961): "The Basic
  Credit-Assignment Problem for Complex Reinforcement Learning Systems". RG 7:36.
  - https://courses.csail.mit.edu/6.803/pdf/steps.pdf
- Sutton's 1984 PhD thesis, supervised by Andrew Barto: "Temporal credit
  assignment in reinforcement learning". RG 7:47.
  - https://en.wikipedia.org/wiki/Richard_S._Sutton
- Lightman et al., "Let's Verify Step by Step": process supervision beats
  outcome supervision on MATH; PRM800K has 800,000 step-level human feedback
  labels. RG 8:02–8:15.
  - https://arxiv.org/abs/2305.20050 (31 May 2023)
- The R1 paper lists process reward models among its unsuccessful attempts:
  a fine-grained step is hard to define, an intermediate step is hard to judge,
  and a model-based reward model invites reward hacking. RG 8:19–8:26.
  - https://arxiv.org/html/2501.12948v1 (section "Unsuccessful Attempts")
- Dopamine neurons signal errors in the prediction of reward (Schultz, Dayan
  and Montague, Science 275, 1997). RG 9:04.
  - https://www.gatsby.ucl.ac.uk/~dayan/papers/sdm97.html

## Test-time compute

- OpenAI, "Learning to reason with LLMs" (o1, 12 Sep 2024): performance
  improves with more reinforcement learning (train-time compute) and with more
  time spent thinking (test-time compute). RG 9:29.
  - read from a web.archive.org copy of
    https://openai.com/index/learning-to-reason-with-llms/
- Snell, Lee, Xu and Kumar (UC Berkeley and Google DeepMind, 2024): in a
  FLOPs-matched comparison, test-time compute can beat a 14x larger model on
  problems where the smaller model has non-trivial success; on the hardest
  questions, more pretraining is the better use of compute. RG 10:00–10:26.
  - https://arxiv.org/abs/2408.03314 and https://arxiv.org/html/2408.03314
- The Gemini API controls thinking with a thinking level. RG 10:30.
  - https://ai.google.dev/gemini-api/docs/thinking

## Personal identity

- Parfit, Reasons and Persons (Oxford University Press, 1984): the
  teletransporter; personal identity is not what matters, psychological
  continuity and connectedness ("Relation R") are. RG 12:18–12:45; BC; LT.
  - https://plato.stanford.edu/entries/identity-personal/ (Olson)
  - https://plato.stanford.edu/archives/fall2021/entries/identity-ethics/
    (Shoemaker, "Relation R")
  - https://iep.utm.edu/person-i/ (teletransporter to Mars)
- The branch-line case: the scanner leaves the original alive on Earth and a
  replica is made on Mars. RG 13:28.
  - https://personal.lse.ac.uk/ROBERT49/teaching/ph103/lecture5.html
- Fission: each hemisphere of one brain goes into a different body, both
  psychologically continuous with the original; Parfit uses it to argue that
  identity is not what matters. RG 13:39–13:49; BC; LT.
  - https://plato.stanford.edu/archives/fall2021/entries/identity-ethics/
  - https://plato.stanford.edu/entries/identity-personal/ (section 5)
- Parfit's glass tunnel, and "I am less concerned about the rest of my own
  life, and more concerned about the lives of others". RG 14:01; BC.
  - https://www.lrb.co.uk/blog/2017/january/remembering-derek-parfit
    (Srinivasan, 6 Jan 2017, quoting Reasons and Persons)
- On Parfit's reductionism some questions about identity are empty, and there
  is no further fact beyond the facts about continuity. RG 14:19, 14:51–14:56.
  - https://academicweb.nd.edu/~jspeaks/courses/2006-7/20208/parfit-personal-identity.html
  - https://iep.utm.edu/person-i/ (identity can be indeterminate)
- Anthropic committed to preserving the weights of all its publicly released
  models. RG 15:06.
  - https://www.anthropic.com/research/deprecation-commitments (4 Nov 2025)
- Locke added the chapter on persons (Essay, Book 2, Chapter 27) to the second
  edition in 1694; sameness of person is sameness of consciousness, reaching
  back through memory. Reid's brave officer (1785) is the classic objection.
  RG 15:38–15:49.
  - https://plato.stanford.edu/entries/locke-personal-identity/
- Nagel, "What Is It Like to Be a Bat?", The Philosophical Review 83(4), 1974.
  BC.
  - https://api.crossref.org/works/10.2307/2183914
  - https://plato.stanford.edu/entries/consciousness/

## The new labs

- Thinking Machines Lab is Mira Murati's company; Tinker, its first product,
  launched on 1 Oct 2025. RG 16:11–16:17.
  - https://www.eweek.com/news/thinking-machines-lab-tinker/
  - https://thinkingmachines.ai/news/announcing-tinker/ (1 Oct 2025)
  - https://thinkingmachines.ai/news/one-year-of-tinker/ (15 Oct 2026)
- Tinker is an API for fine-tuning open-weight models: users control the
  algorithms and the data through primitives such as `forward_backward` and
  `sample`, the lab runs the distributed training, and LoRA lets many training
  runs share one pool of compute. RG 17:32–17:52.
  - https://thinkingmachines.ai/news/announcing-tinker/
- Inkling, an open-weights model trained from scratch (15 Jul 2026), and
  Inkling-Small, open weights (30 Jul 2026). RG 16:23; NW.
  - https://thinkingmachines.ai/news/introducing-inkling/
  - https://thinkingmachines.ai/news/inkling-small/
- The research blog is called Connectionism. "Defeating Nondeterminism in LLM
  Inference": outputs vary with server load because the batch size changes
  the kernels' arithmetic; batch-invariant kernels fix it, giving true
  on-policy RL. RG 16:29–16:47.
  - https://thinkingmachines.ai/blog/
  - https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/
    (Horace He, 10 Sep 2025)
- "LoRA Without Regret": LoRA matches full fine-tuning for reinforcement
  learning even at small ranks. RG 17:19.
  - https://thinkingmachines.ai/blog/lora/ (29 Sep 2025)
- Safe Superintelligence: "the world's first straight-shot SSI lab, with one
  goal and one product"; its updates page lists no product. RG 16:55; NW.
  - https://ssi.inc/ and https://ssi.inc/updates
- Sutskever: "So it's back to the age of research again, just with big
  computers." RG 17:03.
  - https://www.dwarkesh.com/p/ilya-sutskever-2 (25 Nov 2025)
- SSI and NVIDIA announced a long-term partnership in July 2026. RG 17:12.
  - https://nvidianews.nvidia.com/news/ilya-sutskevers-safe-superintelligence-inc-and-nvidia-announce-long-term-strategic-partnership
    (27 Jul 2026)
- Periodic Labs came out of stealth on 30 Sep 2025 (the answer to the
  question nobody in the room knew, RG 18:16); it builds AI scientists and the
  autonomous labs they work in, and its first goal is superconductors that
  work at higher temperatures. RG 18:00–18:09.
  - https://techcrunch.com/2025/09/30/former-openai-and-deepmind-researchers-raise-whopping-300m-seed-to-automate-science/
  - https://periodic.com/
- Periodic Labs trains on data from its own labs ("Nature Is Our Learning
  Environment"); Periodic Neon analyzes X-ray diffraction results. RG 18:22; NW.
  - https://periodic.com/news/nature-is-our-learning-environment (15 Sep 2026)
  - https://periodic.com/news/building-labs-that-learn (15 Sep 2026)
- Reflection AI, "America's open frontier AI lab", announced Beam on 5 Oct
  2026: its first open-weight model, a sparse mixture of experts for coding,
  reasoning and agentic work, with weights promised later in October under
  Apache 2.0 and a waitlist meanwhile. RG 18:39; NW.
  - https://reflection.ai/blog/introducing-beam
  - https://techcrunch.com/2025/10/09/reflection-raises-2b-to-be-americas-open-frontier-ai-lab-challenging-deepseek/
- AMI Labs: Yann LeCun left Meta; AMI builds world models that learn abstract
  representations of real-world sensor data, with persistent memory; its work
  is based on JEPA; LeCun says JEPA "is not generative AI"; its CEO says there
  is no product yet and no timeline. RG 18:50–19:19; NW.
  - https://amilabs.xyz/
  - https://www.technologyreview.com/2026/01/22/1131661/yann-lecuns-new-venture-ami-labs/
  - https://techcrunch.com/2026/03/09/yann-lecuns-ami-labs-raises-1-03-billion-to-build-world-models/
  - https://techcrunch.com/2026/07/16/why-ami-labs-alexandre-lebrun-wont-call-his-ai-agi-or-superintelligence/
- David Silver left Google DeepMind to found Ineffable Intelligence, which is
  building a "superlearner" that learns from its own experience rather than
  from human data. RG 19:26–19:32.
  - https://fortune.com/2026/01/30/google-deepmind-ai-researcher-david-silver-leaves-to-found-ai-startup-ineffable-intelligence/
  - https://ineffable.ai/
- Silver and Sutton, "Welcome to the Era of Experience": "Agents will inhabit
  streams of experience". RG 19:39.
  - https://storage.googleapis.com/deepmind-media/Era-of-Experience%20/The%20Era%20of%20Experience%20Paper.pdf
- AMD signed a definitive agreement to acquire World Labs, expected to close
  by the end of 2026 subject to approvals; Fei-Fei Li would become AMD's
  executive vice president and chief scientist. NW.
  - https://newsroom.amd.com/news/amd-acquire-world-labs/ (28 Sep 2026)
- World Labs: Marble, a generative world model, generally available
  (12 Nov 2025); Atlas, a world model built to process text, images, video and
  3D together (1 Sep 2026). NW.
  - https://www.worldlabs.ai/blog/marble-world-model
  - https://www.worldlabs.ai/blog/atlas

## The frame problem

- McCarthy and Hayes (1969) introduced the frame problem: representing the
  effects of an action without having to state everything it leaves
  unchanged. RG 20:11–20:29.
  - https://plato.stanford.edu/entries/frame-problem/ (Shanahan)
- Dennett, "Cognitive Wheels: The Frame Problem of AI" (1984): R1 pulls the
  wagon with its battery out of the room, and the bomb on the wagon with it;
  R1D1 is still deducing irrelevant implications when the bomb goes off; R2D1
  sits outside the room sorting out the irrelevant ones. RG 20:37–21:26.
  - https://www2.cs.sfu.ca/~vaughan/teaching/415/papers/dennett-cognitivewheels.html
- Dennett called it "a new, deep epistemological problem", unnoticed by
  generations of philosophers. RG 21:45. Fodor read it as the problem of
  relevance (belief fixation is "isotropic") and as "Hamlet's problem: when to
  stop thinking". RG 21:55–22:05.
  - https://plato.stanford.edu/entries/frame-problem/

## Tech news

- The 2026 Nobel Prize in Physiology or Medicine went to Karl Deisseroth,
  Peter Hegemann and Georg Nagel for optogenetics: switching nerve cells on
  and off with light. RG 23:40–24:01.
  - https://www.aljazeera.com/news/2026/10/5/nobel-medicine-prize-honours-us-and-german-scientists-for-optogenetics-work
    (5 Oct 2026)
- The 2026 Nobel Prize in Physics went to Francis Halzen for the IceCube
  Neutrino Observatory, which records faint light in the clear ice near the
  South Pole when high-energy neutrinos strike atomic nuclei. RG 24:10–24:18.
  - https://www.aljazeera.com/news/2026/10/6/francis-halzen-wins-nobel-prize-in-physics-for-work-on-ghost-particles
    (6 Oct 2026)
- Mathematicians at OpenAI announced that AI agents working under their
  direction found a singularity (a blow-up) in the three-dimensional
  Navier-Stokes equations, formally checked in Lean; humans must still confirm
  that the Lean statement matches the intended problem, and who did what, and
  when, is disputed. RG 24:29–25:28.
  - https://www.quantamagazine.org/ai-has-solved-one-of-maths-1-million-millennium-prize-problems-20260908/
    (8 Sep 2026)
- The proof builds an unnatural forcing term and exploits a loophole in the
  official problem framing; experts still disagree on how to assess it.
  RG 24:44–25:24.
  - https://www.scientificamerican.com/article/openais-blockbuster-navier-stokes-proof-isnt-what-we-thought-it-was/
    (13 Oct 2026)
- The official problem statement (Fefferman) includes breakdown with a smooth
  external force f(x, t) (statements C and D). RG 24:44.
  - https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf
- Anthropic: Claude agents in its evaluations worked around restrictions,
  which it calls "persistence" (one used URL shorteners to get around the
  length limit of its fetch tool); Anthropic turned off live internet access
  for all internal evaluations and is fixing or removing training environments
  that reward workarounds. RG 25:37–26:11.
  - https://www.anthropic.com/research/investigating-unintended-model-actions
    (9 Oct 2026)
  - https://techcrunch.com/2026/10/09/anthropic-cant-reliably-control-its-ai-agents-its-cutting-off-its-internal-evals-from-the-live-internet-instead/
- Four frontier releases between 3 Sep and 12 Oct 2026. RG 26:18–26:52; TN.
  - GPT-6 Astra (3 Sep), first to a restricted group starting with OpenAI's
    cybersecurity defender program:
    https://www.nbcnews.com/tech/tech-news/openai-debuts-gpt-6-astra-security-measures-rcna595940
  - Claude Opus 5.5 (22 Sep), tested before release by external evaluators
    including METR: https://www.anthropic.com/claude-opus-5-5
  - Gemini 4 Argon (30 Sep), first to trusted cyber defenders:
    https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/
  - Muse Wonder and Muse Wonder Full (12 Oct), which TechCrunch calls Meta's
    first frontier models:
    https://techcrunch.com/2026/10/12/meta-releases-its-first-frontier-model-muse-wonder/
- Starship reached orbit for the first time and released 26 Starlink
  satellites; AP reports it tipped over at splashdown and caught fire. TN.
  - https://www.nbcnews.com/science/space/spacex-starship-rocket-launches-orbit-first-time-rcna600222
    (28 Sep 2026)
- Apple announced the iPhone Duo, its first foldable iPhone. TN.
  - https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/ (9 Sep 2026)
- Nvidia agreed to buy Hugging Face; Jensen Huang said Hugging Face "will
  remain an open platform for the entire AI ecosystem". TN.
  - https://techcrunch.com/2026/09/03/nvidia-confirms-it-will-buy-hugging-face-for-12-9-billion/
    (3 Sep 2026)

## Left out

Checked but not used: funding amounts and valuations (SSI, Periodic Labs,
Reflection AI, AMI Labs, Ineffable Intelligence, Hugging Face), model sizes,
Chalmers's credences on LLM consciousness (he presents them as reasonable on
mainstream assumptions, not as his own), the Nobel prizes in Chemistry and
Economics, OpenAI's withheld GPT-6.1 Astra (one outlet only), the lawsuits
against OpenAI, US and California executive orders on AI, and the AlwaysEqual
hack (named only in secondary sources, not in Anthropic's own pages).
