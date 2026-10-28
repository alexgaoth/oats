# Links between conversations: the benchmark

How well the Global conversations board links conversations that talk about the
same thing, measured on the AMI meeting corpus, and what changed because of it.
The script is `scripts/link-eval.mjs`; every number below comes from its
`report` command. Measured 2026-10-28 on main at b4ea7b7.

## In brief

- **The ground truth** is AMI's human topic labels. Two meetings are linked when
  both spend at least 100 words on one specific labelled subject ("costing",
  "look and usability", "the candidate films"). Generic labels never link.
- **Today the board links by words** and names a subject after its first topic.
  It links 19 of 540 pairs of unrelated meetings (a remote control meeting and a
  meeting about office space, because both said "meeting" and "room"), and its
  subject names match what the meetings share 0.15 to 0.20 of the time on a 0–2
  scale.
- **For everyone, on this computer:** the board now links topics by the meaning
  of their names (all-MiniLM-L6-v2, which the app already bundles) and names a
  subject after the topic most like the others. It finds as many links as
  today, links 0 to 2 of those 540 unrelated pairs, and its names score 0.86 to
  1.06. The model reads English, so when Oats listens for another language the
  board links by words, as before.
- **With a cloud writing model:** a cloud model checks the links of each new
  conversation. It sees topic names and the first sentences of each summary,
  never a transcript. Claude Opus 5.5 is the most accurate linker measured: of
  the scenario pairs it links, 0.87 [0.79, 0.94] are right, against 0.77 to
  0.83 for the local methods, and of the scenario pairs that share no subject
  it links a quarter, where the local methods link half to three quarters. It
  finds fewer links (0.55 of them). Claude Fable 5.1 is as good at 3.6 times
  the cost. For OpenAI keys, gpt-6.1-sol at reasoning low links as well as
  gpt-6-astra at a fifth of the cost.
- **The best local signal is not the names but what was said:** the mean
  sentence vector of a topic's turns separates the scenario pairs almost as
  well as the cloud linker (false links 0.51 against 0.25 for Opus and 0.61 for
  today). The board cannot use it yet, because the record does not keep a vector
  per topic. That is a decision for Alex (see the end).

## What is measured

### The corpus

All 139 AMI meetings with human topic annotations (manual annotations 1.6.2, CC
BY 4.0): 135 scenario meetings and 4 others.

- **Scenario meetings** (ES, IS, TS). Each team of four meets four times (a to d)
  to design a TV remote control, and every team follows the same agenda. A
  _series_ is one team's meetings.
- **Non-scenario meetings** are real meetings. IB4003 and IB4005 are about who
  gets which office in a new building, IB4010 and IB4011 about which film a
  movie club shows (the same four people). These are the only non-scenario
  meetings the corpus annotated for topics, so this group has 6 pairs.

### When two meetings talk about the same thing

`scripts/lib/link-truth.mjs`. Each word counts for its innermost annotated topic
and every topic above it. A topic's label is its type from the corpus's topic
list, or the annotators' free text when no type fitted. Two meetings are linked
when they share a subject that each of them spends at least 100 words on (about
40 seconds of talk).

- **Generic labels never link:** opening, closing, agenda and equipment issues,
  chitchat, discussion, participant names, the next meeting's time and tasks,
  and the role presentations ("marketing expert presentation"): in one meeting
  the marketing expert presents what users want, in the next the trends, so
  the label says who talks, not what about. What they present is a sub-topic,
  and it counts.
- **One subject, however it was spelled:** free text is written differently by
  different annotators ("trend watching", "mushroom and trendwatch"), so
  `SAME_AS` maps each spelling to one subject. It was written from the label
  list alone, before any method was scored. For the non-scenario meetings it
  joins the office meetings' labels into "office allocation", "admin space" and
  "what each room is for", and the movie meetings' into "movie selection" and
  "the candidate films".

| Pairs                                               | Meetings in one series | Meetings in two series    |
| --------------------------------------------------- | ---------------------- | ------------------------- |
| Scenario                                            | 196, 140 linked (71%)  | 8,849, 6,697 linked (76%) |
| Non-scenario                                        | 2, both linked         | 4, none linked            |
| One scenario and one non-scenario meeting ("mixed") |                        | 540, none linked          |

With 50 words instead of 100 the counts barely move (140 and 6,788 linked); with
200, 134 and 6,160.

Three in four scenario pairs are linked, because "look and usability" and
"components, materials and energy sources" come up in most of a team's design
meetings. So in the scenario group, linking every pair scores F1 0.86, better
than any method. F1 there mostly measures how much a method links. The
comparisons below lean on two numbers that do not move with how many pairs are
linked: the share of linked pairs found (recall) and the share of unlinked
pairs linked anyway (the false-link rate), and their difference (balanced
accuracy). The mixed pairs are the closest thing to a person's own history,
where most conversations share nothing: there the false-link rate is the
number that matters.

### What the board sees

Each meeting is replayed as the app records a room (`scripts/link-eval.mjs
snapshots`): the manual transcript cut at pauses as the room segmenter cuts it,
fed turn by turn to the app's topic tracker with MiniLM vectors, as the
recording store feeds it. The final snapshot is what the app stores on the note:
4 topics per meeting (1 to 7), 603 in all.

- **Writing-model names** (`names`): each stored topic named by gpt-5.6-luna (in
  the app's model list) with the app's own prompt (`topicNaming.mjs`), as #121
  names topics at Finish: once per topic of 30 words or more, in the order
  raised, each request told the names given before it.
- **Gists** (`gists`): each meeting summarized by gpt-5.6-luna with the app's
  summary prompt, and the gist is the summary's opening, 300 characters, cut at
  a sentence end as the group sort cuts it (`summaryExcerpt`).

### The methods

1. **Words** (today). Pair by pair, `buildLifetimeGraph`: two topics match when
   30% of the smaller five-word fingerprint is shared. As the board draws it,
   `subjectThreads`: a topic joins the first subject whose first topic it
   matches, and a subject is named after its first topic.
2. **MiniLM on the tracker's names** (and, as a variant, its telling words), a
   cosine threshold between topic vectors.
3. **MiniLM on the writing model's names**, the same.
4. **A cloud linker** (`src/helpers/remoteLinks.mjs`): one request per new
   conversation, with its gist and topic names and those of the earlier
   conversations it is asked about, each under a letter in a shuffled order. It
   answers which share a specific subject, and names it.

Also measured: **2c, MiniLM on what was said** (each topic as the word-weighted
mean of its turns' vectors), and the baseline that links every pair.

A local method is scored two ways: _pairs_ (two meetings are linked when their
two most alike topics reach the threshold) and _drawn_ (two meetings are linked
when the board puts them on one subject). Drawn, a topic joins the subject whose
mean vector it is most like, when that reaches the threshold
(`meaningThreads`); measured against the subject's first topic instead, the
subjects jumped about as the threshold moved.

**Thresholds are cross-fitted.** The series are split into five folds; a pair
whose meetings are in folds i and j is decided with the threshold that has the
best balanced accuracy on the pairs with no meeting in either fold. The shipped
configuration has one fixed threshold, 0.6, for every name, and is scored as it
ships.

**The sample for the cloud linker.** Each meeting is the new conversation once
(139 requests). It is asked about every earlier meeting of its series, every
earlier non-scenario meeting when it is one, and five meetings drawn at random:
the pairs within a series and the non-scenario pairs are all there, the rest are
a random sample. Every method is scored on the same 897 pairs.

**Intervals** are 95% bootstrap intervals that resample series, not pairs,
because pairs that share a meeting are not independent. The non-scenario group
has two series, too few to resample: its counts are given as they are.

**Link names** are graded by two judges, Claude Sonnet 5.5 and gpt-6.1-terra,
neither of them a linker measured here. Items are 122 sampled pairs the
annotators link (both non-scenario ones, 60 within a series, 60 across). The
judge sees each meeting's subjects as annotated, the subjects the two share, and
every method's name for the link, deduplicated and shuffled, with nothing saying
which method gave which. It grades match (2: names a shared subject; 1: related
but broader, narrower or vaguer; 0: something else) and specificity (1 to 5).
Each method is graded on the items it links, so the counts differ.

## Results

### Every pair, local methods (9,591 pairs; thresholds cross-fitted)

| Method                                          | Scenario P            | Scenario R        | Scenario F1       | Scenario false links  | Within series R   | Across series R   | Mixed false links | Non-scenario within | Non-scenario across false links |
| ----------------------------------------------- | --------------------- | ----------------- | ----------------- | --------------------- | ----------------- | ----------------- | ----------------- | ------------------- | ------------------------------- |
| 1. Words, pair by pair (today's rule)           | 0.79 [0.70, 0.88]     | 0.83 [0.76, 0.90] | 0.81 [0.75, 0.87] | 0.68 [0.54, 0.79]     | 0.86 [0.74, 0.96] | 0.83 [0.76, 0.90] | 14/540            | 2/2                 | 0/4                             |
| 1. Words, as the board draws them (today)       | 0.78 [0.69, 0.87]     | 0.72 [0.63, 0.83] | 0.75 [0.69, 0.82] | 0.61 [0.47, 0.74]     | 0.75 [0.59, 0.91] | 0.72 [0.63, 0.82] | 19/540            | 2/2                 | 0/4                             |
| 2. MiniLM, tracker names, pairs                 | 0.79 [0.70, 0.87]     | 0.76 [0.69, 0.82] | 0.77 [0.73, 0.82] | 0.63 [0.52, 0.73]     | 0.72 [0.59, 0.83] | 0.76 [0.70, 0.82] | 0/540             | 2/2                 | 0/4                             |
| 2. MiniLM, tracker names, drawn                 | 0.79 [0.70, 0.87]     | 0.80 [0.74, 0.86] | 0.80 [0.75, 0.84] | 0.67 [0.56, 0.76]     | 0.81 [0.68, 0.91] | 0.80 [0.75, 0.86] | 8/540             | 2/2                 | 0/4                             |
| **Shipped: tracker names, drawn, 0.6**          | 0.79 [0.70, 0.87]     | 0.76 [0.70, 0.83] | 0.78 [0.73, 0.82] | 0.63 [0.52, 0.73]     | 0.73 [0.59, 0.84] | 0.76 [0.70, 0.83] | **0/540**         | 2/2                 | 0/4                             |
| 2. MiniLM, tracker names and words, pairs       | 0.79 [0.70, 0.86]     | 0.74 [0.69, 0.80] | 0.76 [0.72, 0.81] | 0.63 [0.54, 0.73]     | 0.79 [0.69, 0.90] | 0.74 [0.69, 0.80] | 9/540             | 2/2                 | 0/4                             |
| 2. MiniLM, tracker names and words, drawn       | 0.79 [0.70, 0.87]     | 0.80 [0.75, 0.86] | 0.80 [0.74, 0.85] | 0.66 [0.58, 0.77]     | 0.83 [0.69, 0.92] | 0.80 [0.75, 0.86] | 59/540            | 2/2                 | 0/4                             |
| 3. MiniLM, writing-model names, pairs           | 0.78 [0.68, 0.87]     | 0.86 [0.79, 0.91] | 0.82 [0.76, 0.87] | 0.74 [0.59, 0.87]     | 0.84 [0.67, 0.95] | 0.86 [0.79, 0.91] | 3/540             | 1/2                 | 0/4                             |
| 3. MiniLM, writing-model names, drawn           | 0.78 [0.68, 0.87]     | 0.85 [0.78, 0.90] | 0.81 [0.75, 0.87] | 0.74 [0.58, 0.88]     | 0.84 [0.70, 0.94] | 0.85 [0.79, 0.90] | 3/540             | 2/2                 | 0/4                             |
| **Shipped: writing-model names, drawn, 0.6**    | 0.80 [0.70, 0.88]     | 0.81 [0.75, 0.87] | 0.81 [0.75, 0.86] | 0.64 [0.46, 0.81]     | 0.81 [0.70, 0.92] | 0.81 [0.75, 0.87] | **2/540**         | 2/2                 | 0/4                             |
| 3. MiniLM, writing-model names and words, pairs | 0.78 [0.68, 0.86]     | 0.79 [0.73, 0.85] | 0.79 [0.74, 0.83] | 0.70 [0.59, 0.81]     | 0.84 [0.74, 0.94] | 0.79 [0.73, 0.85] | 1/540             | 2/2                 | 0/4                             |
| 3. MiniLM, writing-model names and words, drawn | 0.77 [0.68, 0.86]     | 0.81 [0.76, 0.86] | 0.79 [0.74, 0.84] | 0.74 [0.66, 0.83]     | 0.84 [0.71, 0.94] | 0.81 [0.76, 0.86] | 3/540             | 2/2                 | 0/4                             |
| 2c. MiniLM on what was said, pairs              | **0.83** [0.75, 0.89] | 0.79 [0.74, 0.84] | 0.81 [0.78, 0.85] | **0.51** [0.42, 0.61] | 0.88 [0.80, 0.95] | 0.79 [0.74, 0.84] | 0/540             | 2/2                 | 0/4                             |
| Baseline: every pair linked                     | 0.76 [0.66, 0.84]     | 1.00              | 0.86 [0.79, 0.92] | 1.00                  | 1.00              | 1.00              | 540/540           | 2/2                 | 4/4                             |

The shipped rows use the one fixed threshold, so nothing is cross-fitted in
them.

### All methods on the sample (897 pairs)

| Method                                    | Scenario P            | Scenario R        | Scenario F1       | Scenario false links  | Within series P   | Within series R   | Across series P   | Across series R   | Mixed false links | Non-scenario within | Non-scenario across false links |
| ----------------------------------------- | --------------------- | ----------------- | ----------------- | --------------------- | ----------------- | ----------------- | ----------------- | ----------------- | ----------------- | ------------------- | ------------------------------- |
| 1. Words, as the board draws them (today) | 0.79 [0.68, 0.88]     | 0.73 [0.61, 0.85] | 0.76 [0.67, 0.83] | 0.61 [0.42, 0.78]     | 0.74 [0.55, 0.89] | 0.75 [0.59, 0.91] | 0.79 [0.68, 0.89] | 0.73 [0.61, 0.85] | 2/32              | 2/2                 | 0/4                             |
| Shipped, tracker names                    | 0.79 [0.68, 0.89]     | 0.76 [0.66, 0.84] | 0.77 [0.70, 0.84] | 0.61 [0.42, 0.76]     | 0.73 [0.52, 0.89] | 0.73 [0.59, 0.84] | 0.79 [0.69, 0.89] | 0.76 [0.66, 0.85] | 0/32              | 2/2                 | 0/4                             |
| Shipped, writing-model names              | 0.80 [0.70, 0.89]     | 0.83 [0.76, 0.90] | 0.82 [0.74, 0.88] | 0.63 [0.46, 0.78]     | 0.76 [0.56, 0.91] | 0.81 [0.70, 0.92] | 0.80 [0.70, 0.89] | 0.83 [0.76, 0.90] | 0/32              | 2/2                 | 0/4                             |
| 2c. MiniLM on what was said, pairs        | 0.83 [0.73, 0.91]     | 0.81 [0.73, 0.87] | 0.82 [0.75, 0.87] | 0.53 [0.36, 0.70]     | 0.75 [0.58, 0.89] | 0.88 [0.80, 0.95] | 0.83 [0.73, 0.91] | 0.80 [0.73, 0.87] | 0/32              | 2/2                 | 0/4                             |
| 4. Claude Opus 5.5 (effort medium)        | **0.87** [0.79, 0.94] | 0.55 [0.46, 0.63] | 0.67 [0.60, 0.74] | **0.25** [0.14, 0.36] | 0.78 [0.58, 0.93] | 0.36 [0.26, 0.46] | 0.87 [0.79, 0.94] | 0.55 [0.47, 0.64] | 0/32              | 2/2                 | 0/4                             |
| 4. Claude Fable 5.1 (effort medium)       | 0.87 [0.78, 0.94]     | 0.55 [0.46, 0.63] | 0.67 [0.59, 0.74] | 0.26 [0.15, 0.38]     | 0.75 [0.57, 0.91] | 0.36 [0.27, 0.46] | 0.87 [0.78, 0.94] | 0.55 [0.46, 0.64] | 0/32              | 2/2                 | 0/4                             |
| 4. gpt-6.1-sol, reasoning low             | 0.84 [0.75, 0.92]     | 0.59 [0.51, 0.66] | 0.69 [0.62, 0.75] | 0.35 [0.23, 0.46]     | 0.74 [0.54, 0.90] | 0.46 [0.37, 0.55] | 0.84 [0.75, 0.92] | 0.59 [0.51, 0.67] | 0/32              | 2/2                 | 0/4                             |
| 4. gpt-6.1-sol, reasoning medium          | 0.82 [0.73, 0.91]     | 0.63 [0.55, 0.71] | 0.71 [0.64, 0.77] | 0.42 [0.30, 0.53]     | 0.77 [0.56, 0.92] | 0.54 [0.40, 0.66] | 0.83 [0.73, 0.91] | 0.63 [0.55, 0.72] | 0/32              | 2/2                 | 0/4                             |
| 4. gpt-6-astra, reasoning low             | 0.83 [0.73, 0.91]     | 0.62 [0.54, 0.70] | 0.71 [0.63, 0.76] | 0.40 [0.27, 0.52]     | 0.77 [0.57, 0.92] | 0.54 [0.43, 0.64] | 0.83 [0.73, 0.92] | 0.62 [0.54, 0.70] | 0/32              | 2/2                 | 0/4                             |
| 4. gpt-6-astra, reasoning medium          | 0.81 [0.71, 0.90]     | 0.64 [0.56, 0.72] | 0.72 [0.65, 0.77] | 0.46 [0.31, 0.59]     | 0.76 [0.58, 0.90] | 0.52 [0.41, 0.64] | 0.81 [0.71, 0.90] | 0.64 [0.56, 0.72] | 0/32              | 2/2                 | 0/4                             |

The other local rows on the sample agree with the every-pair table within 0.03
(`report` prints them).

**Paired differences in balanced accuracy** on the scenario pairs, with the
same bootstrap replicates for both methods:

| Method                       | Minus today's board | Minus Claude Opus 5.5 |
| ---------------------------- | ------------------- | --------------------- |
| Shipped, tracker names       | +0.03 [−0.17, 0.21] | −0.16 [−0.37, 0.06]   |
| Shipped, writing-model names | +0.08 [−0.19, 0.35] | −0.10 [−0.32, 0.15]   |
| 2c. MiniLM on what was said  | +0.16 [−0.07, 0.37] | −0.02 [−0.20, 0.17]   |
| Claude Opus 5.5              | +0.18 [−0.01, 0.36] |                       |
| Claude Fable 5.1             | +0.17 [−0.04, 0.37] | −0.01 [−0.12, 0.11]   |
| gpt-6.1-sol, reasoning low   | +0.12 [−0.08, 0.33] | −0.06 [−0.20, 0.09]   |
| gpt-6-astra, reasoning low   | +0.09 [−0.13, 0.30] | −0.09 [−0.25, 0.05]   |
| Every pair linked            | −0.12 [−0.32, 0.07] | −0.30 [−0.43, −0.13]  |

**The wording.** The app's prompt links two conversations about one project
only when "the same part of it is discussed in both". A permissive wording
(the same, "even at different stages") raised Opus 5.5's recall from 0.55 to
0.70 and its false links from 0.25 to 0.46, and gpt-6.1-sol's to 0.89 and 0.75:
lower balanced accuracy for both, so the app keeps its wording.

**gpt-5.5-pro** was stopped after 9 of the 139 requests: $1.02 and 107 seconds
a request (median), against $0.004 to $0.05 and 6 to 12 seconds for the others.
On those 9 requests (59 pairs) it linked as gpt-6-astra and gpt-6.1-sol did,
pair for pair but one. It is not a candidate at that price.

### Link names, graded blind

Match 0 to 2 and specificity 1 to 5; each method on the items it links (n).

| Method                                       | Sonnet 5.5: match | names a shared subject | specific | gpt-6.1-terra: match | names a shared subject | specific |
| -------------------------------------------- | ----------------- | ---------------------- | -------- | -------------------- | ---------------------- | -------- |
| Words, pair by pair: the shared words (n 99) | 0.74 [0.65, 0.83] | 0.01                   | 1.34     | 0.82 [0.74, 0.89]    | 0.00                   | 1.98     |
| Today's board, tracker names (n 89)          | 0.20 [0.11, 0.30] | 0.03                   | 1.26     | 0.15 [0.07, 0.24]    | 0.01                   | 1.24     |
| Today's board, writing-model names (n 89)    | 0.38 [0.27, 0.51] | 0.03                   | 2.13     | 0.44 [0.33, 0.55]    | 0.01                   | 2.39     |
| **Shipped, tracker names** (n 96)            | 0.86 [0.79, 0.93] | 0.00                   | 1.28     | 0.93 [0.86, 0.99]    | 0.01                   | 1.86     |
| **Shipped, writing-model names** (n 101)     | 1.05 [1.00, 1.10] | 0.06                   | 2.13     | 1.06 [1.01, 1.11]    | 0.07                   | 2.83     |
| Claude Opus 5.5 (n 59)                       | 1.10 [0.92, 1.29] | 0.32                   | 2.97     | 1.07 [0.90, 1.24]    | 0.25                   | 3.61     |
| Claude Fable 5.1 (n 61)                      | 1.00 [0.80, 1.18] | 0.28                   | 3.02     | 1.00 [0.84, 1.16]    | 0.25                   | 3.75     |
| gpt-6.1-sol, reasoning low (n 64)            | 1.22 [1.03, 1.41] | 0.44                   | 3.03     | 1.19 [1.00, 1.36]    | 0.36                   | 3.70     |
| gpt-6-astra, reasoning low (n 75)            | 1.15 [0.97, 1.32] | 0.39                   | 3.01     | 1.20 [1.04, 1.35]    | 0.36                   | 3.73     |

Today's board names a subject after the first topic that started it, which on
AMI is usually the kickoff's "remote control" or "Remote control project
kickoff": wrong for most of the meetings that join it later. The shipped board
names it after the member most like the others. The cloud linkers name the
subject itself, more specifically ("Remote control power options") than any
topic name. The annotators' labels are broad ("look and usability"), so few
names of any method are graded an exact match.

### Cost and time of one check

| Model                           | Cost per check | Output tokens | Time, median | Time, 90th percentile |
| ------------------------------- | -------------- | ------------- | ------------ | --------------------- |
| Claude Opus 5.5, effort medium  | $0.0145        | 411           | 5.7 s        | 8.4 s                 |
| Claude Fable 5.1, effort medium | $0.0518        | 722           | 9.3 s        | 12.3 s                |
| gpt-6.1-sol, reasoning low      | $0.0041        | 244           | 7.1 s        | 9.1 s                 |
| gpt-6.1-sol, reasoning medium   | $0.0059        | 426           | 11.6 s       | 16.3 s                |
| gpt-6-astra, reasoning low      | $0.0203        | 242           | 5.9 s        | 8.2 s                 |
| gpt-6-astra, reasoning medium   | $0.0289        | 413           | 10.0 s       | 13.9 s                |
| gpt-5.5-pro                     | $1.0238        | 5,548         | 107 s        | 249 s                 |

In the benchmark a check asked about 5 to 8 earlier conversations, about
1,500 input tokens (Claude's count; OpenAI's is about half). The app asks about
up to 12.

## What this does not show

- **The ground truth misses links.** An annotator labels each stretch with one
  label, so an aspect discussed inside another label is lost. Many of Opus
  5.5's "false" links are real: it linked ES2002a and IS1000b on "Remote control
  price positioning", and IS1000b's annotation has only "user target group",
  though its topics include "Affordable universal remote positioning". Every
  method's precision is a lower bound.
- **The scenario meetings are one project 35 times.** Telling apart two
  meetings about the same remote control is a harder test than most people's
  conversations set, and the unrelated pairs (mixed, non-scenario across) are
  between only 4 non-scenario meetings and the rest.
- **The transcripts are AMI's manual ones**, not the app's recognition; the
  names and gists come from one writing model (gpt-5.6-luna); the topics are
  named once each at Finish rather than as they grow.
- **The cloud linker is scored as a judge of pairs it is asked about.** In the
  app it is asked about the 12 earlier conversations most like the new one by
  the local vectors, which is enough when a subject comes back a few times, and
  on the board each new conversation joins the subject of the earlier one it
  links to, so a thread does not need every pair.

## Reproduce

```sh
export FM_LEDGER=~/.cache/oats/link-eval/ledger.jsonl FM_BUDGET_USD=50
node scripts/link-eval.mjs snapshots                               # local, minutes
OPENAI_API_KEY=… node scripts/link-eval.mjs names --model openai:gpt-5.6-luna@none
OPENAI_API_KEY=… node scripts/link-eval.mjs gists --model openai:gpt-5.6-luna@none
node scripts/link-eval.mjs local                                   # local
ANTHROPIC_API_KEY=… node scripts/link-eval.mjs remote --model anthropic:claude-opus-5-5@think,medium
OPENAI_API_KEY=… node scripts/link-eval.mjs remote --model openai:gpt-6.1-sol@low
node scripts/link-eval.mjs score --model "anthropic:claude-opus-5-5@think,medium+openai:gpt-6.1-sol@low"
ANTHROPIC_API_KEY=… node scripts/link-eval.mjs judge --model anthropic:claude-sonnet-5-5
node scripts/link-eval.mjs report
```

Every stage is cached under `~/.cache/oats/link-eval`, so a rerun costs
nothing. The whole benchmark cost $31.02 at list prices as the ledger counts
them; $9.21 of it was the 9 gpt-5.5-pro requests, and 4 more of those were cut
off when the run was stopped, which OpenAI may bill as well.

## Decisions for Alex

1. **Keep a vector per topic.** The mean vector of a topic's turns (2c) is the
   best local signal measured: false links 0.51 against 0.61 to 0.74 for names,
   at the same recall. The tracker has those vectors while it records; the
   record would keep one per topic (384 numbers, about 0.5 KB as int8). Old
   conversations would keep linking by name.
2. **Which past conversations a cloud model may read.** The background group
   sort never sends conversations to a cloud provider chosen after they were
   recorded. The cloud linker sends the topic names and gists of up to 12
   earlier conversations at each Finish, whatever model wrote them, and Settings
   says so. A stricter rule needs the summary's route recorded on each note.
