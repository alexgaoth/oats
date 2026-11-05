# Links between conversations: the benchmark

How well the Global conversations board links conversations that talk about the
same thing, measured on the AMI meeting corpus, and what changed because of it.
The script is `scripts/link-eval.mjs`; every number below comes from its
`report` command. Measured 2026-10-28 on main at b4ea7b7.

**Round 2 (2026-11-05), at the end of this page, changes how to read round 1.** Round
1 scored the cloud check pair by pair. On the board, the same answers chained into one
subject, with a false-link rate of 0.90, not 0.25. Round 2 also finds that one order of
a history is one draw of a board. Read "Round 2" before you rely on the numbers below.

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
  sentence vector of a topic's turns. The record now keeps one per topic, and
  the board links by it where both topics have one: of the scenario pairs it
  links, 0.86 are right, near Claude Opus 5.5's 0.87, and it finds 0.76 of
  them where Opus finds 0.55 (see "Stored topic vectors" below). Older
  conversations link by name.

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

### Stored topic vectors

Since the record keeps one vector per topic (the word-weighted mean of its
turns' MiniLM vectors, one byte a dimension: `conversationTopics.mjs`), the
board compares two topics by those vectors when both have one, at 0.78, and by
their names otherwise, at 0.6 (`meaningThreads`). The threshold was chosen on
the same meetings, from a flat curve: 0.76 to 0.80 all give a balanced
accuracy of 0.33 to 0.36. Every pair, as the board draws them:

|                                                                  | Scenario P            | Scenario R        | Scenario F1       | Scenario false links  | Mixed false links | Non-scenario within | Non-scenario across false links |
| ---------------------------------------------------------------- | --------------------- | ----------------- | ----------------- | --------------------- | ----------------- | ------------------- | ------------------------------- |
| By name only (#138)                                              | 0.79 [0.70, 0.87]     | 0.76 [0.70, 0.83] | 0.78 [0.73, 0.82] | 0.63 [0.52, 0.73]     | 0/540             | 2/2                 | 0/4                             |
| **By stored vectors**                                            | **0.86** [0.78, 0.92] | 0.76 [0.69, 0.83] | 0.80 [0.75, 0.85] | **0.40** [0.26, 0.53] | 0/540             | 2/2                 | 0/4                             |
| Half the meetings with stored vectors, tracker names on the rest | 0.80 [0.71, 0.88]     | 0.78 [0.72, 0.84] | 0.79 [0.74, 0.83] | 0.60 [0.48, 0.72]     | 0/540             | 2/2                 | 0/4                             |
| Half with stored vectors, writing-model names on the rest        | 0.81 [0.73, 0.89]     | 0.68 [0.61, 0.75] | 0.74 [0.68, 0.80] | 0.48 [0.37, 0.59]     | 2/540             | 1/2                 | 0/4                             |

The half rows stand for a history recorded partly before the vectors were
kept: a new topic meets the older conversations' topics by name and the newer
ones' by stored vector, so the board does between the two until most of the
history has them.

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

1. **Keep a vector per topic.** Decided: yes. The record keeps one per topic
   (384 bytes, 512 characters of base64), and the board uses it where both
   topics have one (see "Stored topic vectors").
2. **Which past conversations a cloud model may read.** The background group
   sort never sends conversations to a cloud provider chosen after they were
   recorded. The cloud linker sends the topic names and gists of up to 12
   earlier conversations at each Finish, whatever model wrote them, and Settings
   says so. A stricter rule needs the summary's route recorded on each note.

# Round 2 (2026-11-05)

Alex's ask: better "linking the relationships", between conversations on the
board and between topics inside one conversation. The bars, the split and each
list of frozen methods below were committed before the runs they govern, so they
can be checked in the history. The summary and "Results" came after.

<!-- round 2 summary -->
## In brief (written after the runs)

- **A bug, fixed in #166.** With a cloud check on, the Global board collapses into
  one subject: 132 of 139 conversations with Claude Opus 5.5, 135 with gpt-6.1-sol.
  Round 1's false-link rate of 0.25 was pair by pair and never reached the screen,
  where it is 0.90. The fix takes it to 0.19 (Opus) and 0.46 (gpt-6.1-sol), and
  lifts the grade of the reason a link shows from 0.39 to 0.85 of 2 to 1.17 to 1.29 (Opus).
- **On this computer nothing cleared the bar, so main stays.** The nearest is
  bge-small-en-v1.5 at 0.96: false links 0.41 to 0.25, recall 0.68 to 0.53, and
  precision 0.87 against a bar of 0.90. Balanced accuracy does not move, and on
  recognized text it does much worse than MiniLM.
- **EmbeddingGemma 2 loses.** It scores below MiniLM at 36 times the CPU. Topic
  vectors alone reach AUC 0.69 to 0.72 whatever the model; nothing small changes that.
- **Reranking and hybrids add little.** BM25, shared terms, people and recency leave
  AUC at 0.71. Names lift it to 0.74, three cross-encoders to 0.73, and all of it to 0.75.
- **The board's numbers rest on one subject, and on the order of the history.** One
  subject holds most of the links on AMI, and one order of the history is one draw:
  precision moved by 0.07 with no change of method. Every board here is now read
  over many orders.
- **Cloud: no new default.** No model's gain over Opus excludes 0. Giving it more per
  conversation does not lift recall.
- **Returns: about half of what is drawn is real.** The app's "came back" had not
  been measured. Under AMI's labels it scores 0.13 on the record and 0.24 on the
  loop. Under two blind judges, 0.44 to 0.56 and 0.43, with controls at 0.23 to 0.28.
  The best reader, Opus at Finish, reaches 0.62 to 0.65. Nothing reaches 0.80.
- **Typed relations stop here.** One type is the answer 86% of the time, and a model
  reading names and gists cannot tell the rest apart.
- **Recognition costs false links, not recall.** With every meeting recognized (Apple
  Speech, 23 meetings), the board at 0.78 links nearly everything: false links 0.94 in
  the quiet room and 0.99 in steady sound. The cloud check with #166 still tells pairs
  apart: precision 0.94 and false links 0.23 in the quiet room, 0.86 and 0.52 in steady
  sound. It is the only method here that does.
- **A small history is harder than the benchmark.** At 23 meetings main's board scores what
  linking everything scores, even on manual text. The 139-meeting board flatters it.
- **A threshold for recognized text did not carry over.** 0.84 read false links of 0.25 on
  tuning meetings and 0.65 on test. Tune again when more meetings have been through
  recognition.
<!-- /round 2 summary -->

## The bar, written before the runs

**On-device default.** A new default for everyone on this computer needs all
of these on the test split's scenario pairs:

- precision at or above 0.90,
- recall at or above 0.50,
- a false-link rate at or below 0.25,
- a 95% interval for the paired difference in precision against main that
  excludes 0.

"Main" is what the board does at f7bd563: stored topic vectors at 0.78, names
at 0.6 for a topic with no stored vector, drawn as subjects. It also must not
draw more mixed false links than main does, and must not lose a non-scenario
link that main finds. Main's two thresholds were chosen in round 1 on every
meeting, the test meetings too, so main is scored with a small advantage. A
challenger's thresholds and weights come from tuning pairs only.

Precision is the stated difference because the bar is about precision: a
stricter linker can only reach it by giving up recall, and then balanced
accuracy can fall while the board gets more trustworthy. Balanced accuracy and
the false-link rate are reported beside it, each with its paired interval.

**Inside one conversation.** A new way to draw "came back" needs precision at
or above 0.80 on the test meetings, reported first. Recall and timing come
after it. A wrong "came back" is a visible error.

**Cloud.** A new default only if the gain's 95% interval excludes 0: paired
balanced accuracy against claude-opus-5-5 at medium on the test pairs of the
sample. More text per conversation counts as a gain only when recall rises and
the false-link rate's paired interval does not show a rise.

## The split

`scripts/lib/link-split.mjs`. Series stay whole.

- **Test: 12 scenario series and the movie club.** ES2002, ES2004, ES2005,
  ES2009, ES2014, IS1000, IS1001, IS1009, TS3003, TS3005, TS3011, TS3012, and
  IB4010 with IB4011. These hold the topic benchmark's test split (ES2004,
  IS1009, TS3003), so round 2 keeps it. The other nine series were drawn once
  with a seeded generator (seed 20261105; 4 ES, 2 IS and 3 TS, the corpus'
  mix). Three series alone cannot carry a series bootstrap.
- **Tune: the other 23 scenario series and the office meetings.** IB4003 and
  IB4005.
- **Tuning pairs** have no meeting in a test series. **Test pairs** have at
  least one. No label of a test pair is read while tuning. Pairs with both
  meetings in test series are reported beside them, as the strict reading.
- At most five methods go to the test split, named before they go, and every
  one is reported. Nothing is tuned after a test score is read.

Intervals are series bootstraps for pairs, as in round 1. Returns are scored
per meeting, with a bootstrap over meetings.

## The gold is a proxy

Round 1's gold is AMI's series and topic labels. It can show that a method tells
pairs with a shared labelled subject from pairs without one, that it does not
link unrelated meetings, and how those rates compare between methods. It cannot
show that a link is right for a person. Labels are broad, each stretch has one
label, and across series the "same subject" belongs to another team's project,
which a person's own history would not hold. Every precision here is a lower
bound on what a reader would accept. Round 2 reports the within-series and
across-series rows apart for that reason.

## The gold for returns

`scripts/lib/return-truth.mjs`. A subject is a label after the link benchmark's
`subjectOf`, so generic labels make no subject. A subject is held while the room
is on it. Held stretches closer than 100 words are one stretch, and a stretch
of fewer than 100 words does not count, the same 100 words as the link gold. A
subject returns at the start of each held stretch after its first.

- **top**: only the top-level topic of each turn, as the brief names it. It is
  sparse: 10 returns in the 89 tuning meetings, because AMI's top level is often
  "discussion" or a presentation, with the subject one level down.
- **fine**: a turn's innermost topic and every topic above it: 184 returns in
  54 of the 89 tuning meetings. "Look and usability" is 86 of them.

**A drawn return is right** when one subject holds at least 30% of the words of
the run it starts, and at least 30% of the words of the topic's earlier runs,
and under 30% of the words between them. So the room left the subject and came
back. A generic stretch cannot confirm a return, so a drawn return with no
subject on one side is **unverifiable**. Precision counts unverifiable returns
as neither right nor wrong, and is given again with them counted as wrong.

**Chance** is the same rule on every pair of non-adjacent stretches of a
meeting: what precision a method with no signal would get.

**A gold return is found** when a drawn return on its subject (the same 30% on
both sides) starts between 60 s before it and its end.

**Timing.** Where the line bends against the gold start, and, live, how long
after the gold start the flow card first draws the return.

## Models screened

Verified on the Hugging Face API on 2026-11-05: size, license, gating. Default
candidates are under about 250 MB, ONNX or GGUF, with a license an open-source
app can ship. The two over that size stay as comparators, to see what a larger
model would buy.

Embedding: all-MiniLM-L6-v2 (baseline), EmbeddingGemma 1 and 2 at 768 and 256
dimensions, bge-small-en-v1.5, snowflake-arctic-embed-m-v1.5,
granite-embedding-small-english-r2, granite-embedding-97m-multilingual-r2,
nomic-embed-text-v2-moe, mxbai-embed-large-v1 (over the size) and
Qwen3-Embedding-0.6B (over the size). Not screened: jina-embeddings-v5
(CC BY-NC, no use in an MIT app), LFM2.5-Embedding (license other, custom code),
harrier-oss and Octen (no ONNX or GGUF from the publisher).

## Changes to the plan, before any test score was read

- **Five methods per family.** "At most five methods go to the test split" now
  counts each family apart: on-device links, cloud links, and returns. The
  families answer different questions and have different bars.
- **A blind judge for returns.** AMI's labels are broad, and a drawn return with
  a generic label on one side cannot be checked at all. So a second reading of
  precision is added, beside the label rule, not instead of it. Two judges read
  the transcript of the earlier runs, what lay between, and the return. They
  answer whether the room came back to something it had left. Control pairs of
  stretches with no return drawn are mixed in, unlabelled, to show the judges'
  base rate. The bar stays on the label rule.
- **The gold for the mean-of-subject rule.** Round 1's board and every board
  here draw subjects. Pair scores are reported, but the bar is read on what the
  board would draw.

## Frozen before the test read: cloud

Chosen on tuning pairs. No test pair had been read.

- **The cloud check, pair by pair** (the fixed sample): Claude Opus 5.5 at medium
  (the reference), gpt-6.1-sol at low, gpt-6.1-terra at low, Claude Haiku 5.5 at
  low, Claude Sonnet 5.5 at medium.
- **The cloud check as the board draws it**: the app's path today, against the
  fix (subjects from the model's own names, at 0.8), for Opus and gpt-6.1-sol.
- **Not sent to test:** more per conversation. On tuning pairs thread headings,
  questions asked and 900 characters of summary each left recall at 0.45 to 0.57
  against 0.56, with no gain in balanced accuracy.

## Frozen before the test read: returns

Nothing here has a tuned threshold beyond what the app ships: the tracker's own
`returnThreshold` of 0.15 stays, because no other value gained on tuning
meetings, and grouping stretches by vector stayed at chance.

- The tracker: the record's returns (Connections) and the live ones (flow card).
- The loop, live, with gpt-5.6-terra (the app's OpenAI check).
- A model reading the record's parts at Finish: Claude Opus 5.5 at medium, and
  gpt-5.6-luna as the cheap one. Each reads at most 800 characters a part.

## What recognition costs: the plan

Recognition output exists for 8 meetings, all in test series: ES2004a to d,
IS1009a and b, TS3003a and b. Four replays from track S: small.en in the quiet
room and in steady sound, gpt-transcribe and Apple Speech in the quiet room.
Each recognized meeting gets its tracker topics, writing-model names and gist as
the manual meetings have them, from the same writing model. Eight meetings make
28 pairs, so each is also paired with the other 131 meetings, which stay manual.
Every pair that touches a recognized meeting is compared with the same pair on
manual text, paired, over the same orders of the history. No method is tuned
on these.

## Frozen before the test read: on this computer

Chosen on tuning pairs and a tuning-only board, each read as the expected board
over orders of the history (see below). None of them reached the bar on tuning
pairs. They go to test as the best the tuning meetings found, with main as the
reference:

- `stored:0.82`: main's vectors, a higher threshold.
- `linkage:minilm:0.74`: main's vectors, clustered with no order.
- `greedy:bge-small:0.96`: bge-small-en-v1.5, main's rule.
- `linkage:bge-small:0.944`: bge-small-en-v1.5, clustered with no order.

Slot five is held for the best local writing model, if one earns it on tuning
pairs. Twenty orders of the history for each.

## Frozen before the test read: a threshold for recognized text

Added late, and read with less trust than the rest. Main's 0.78 was tuned on manual
transcripts, and the app never has one. When more meetings came through recognition, a
board with every meeting recognized linked nearly everything at 0.78, so the threshold
looked wrong for what the app hears. **That first look was on 23 meetings, 15 of them
in test series, at 0.82, 0.86 and 0.90, so the test split is not clean for this one.**

To keep what can be kept, the threshold comes from the 8 recognized tuning meetings
alone (Apple Speech, quiet room; 28 pairs, 6 unlinked), by the bar's rule: the most
recall with a false-link rate at or below 0.25. That is **0.84** (precision 0.89,
recall 0.57, false links 0.25). Read once on the 15 test meetings (105 pairs), against
0.78, in both rooms, with every meeting on the board recognized. The same bar applies.

<!-- round 2 results -->
## Results

Everything below comes from `scripts/link-eval-2.mjs` and `scripts/return-eval.mjs`
on main at f7bd563. Unless a table says otherwise, numbers are test pairs of the
scenario meetings, with 95% series bootstrap intervals. Lower false-link rates are
better. "BA" is balanced accuracy (recall minus the false-link rate).

### The cloud check as the board draws it: a bug

Round 1 scored the cloud check pair by pair. Nobody had measured what a cloud user
sees: the app chooses up to 12 candidates, the model answers, and `linkThreads`
draws the answer. Round 2 ran that whole path over all 139 meetings, in the
corpus' order, as if one provider had summarized every conversation.

**The board collapses.** `linkThreads` merged two subjects whenever a check linked
one topic twice, so links chained through topics. With Claude Opus 5.5, 132 of 139
conversations land on one subject. With gpt-6.1-sol, 135 of 139, and the board then
scores exactly as "link every pair" does.

| Test pairs | Precision | Recall | False-link rate | Largest subject | Mixed false links |
| --- | --- | --- | --- | --- | --- |
| Opus 5.5, before #166 | 0.76 [0.66, 0.86] | 0.98 [0.95, 1.00] | 0.90 [0.75, 1.00] | 132 of 139 | 0/366 |
| Opus 5.5, with #166 | 0.86 [0.76, 0.94] | 0.39 [0.30, 0.49] | 0.19 [0.09, 0.29] | 60 of 139 | 0/366 |
| gpt-6.1-sol, before #166 | 0.75 [0.64, 0.85] | 1.00 | 1.00 | 135 of 139 | 0/366 |
| gpt-6.1-sol, with #166 | 0.79 [0.69, 0.90] | 0.60 [0.52, 0.68] | 0.46 [0.32, 0.57] | 65 of 139 | 0/366 |

Paired, with #166 minus before it:

| | Precision | Recall | False-link rate | BA |
| --- | --- | --- | --- | --- |
| Opus 5.5 | +0.10 [0.03, 0.17] | −0.59 [−0.69, −0.48] | −0.71 [−0.83, −0.59] | +0.12 [−0.02, 0.27] |
| gpt-6.1-sol | +0.05 [0.01, 0.09] | −0.40 [−0.48, −0.32] | −0.54 [−0.67, −0.43] | +0.14 [0.02, 0.29] |

That is one order of the history, because a new order costs a new run of checks.
Grouping the same answers over 12 other orders gives Opus 0.86, 0.31 and 0.15, and
gpt-6.1-sol 0.77, 0.62 and 0.55. The figures move as every board's do, and the collapse
stays gone.

**The fix** is #166, merged as d477fb7. A link joins two conversations on the subject the model
named, and subjects are one only when their names are alike (0.8, chosen on tuning
pairs). The check also speaks for every earlier conversation its provider has read,
not only the 12 it was asked about, so a subject it passed over is not rebuilt on
this computer. Under the cloud bar, gpt-6.1-sol's gain excludes 0, and Opus's
balanced accuracy holds 0 while its precision and false-link rate do not. Recall
falls hard because the board before it linked nearly everything. AMI is the worst case for
this bug, because every scenario meeting is about one product; a varied history
collapses less, so the gain may be smaller there.

### The cloud check, pair by pair

`/v1/models` on 2026-11-05 holds nothing newer for this job than round 1's list.
Three models had never been tried as linkers. All ran round 1's fixed sample, so they
pair with Opus. Test pairs: 495 sampled, 467 of them scenario.

| Model | Precision | Recall | False-link rate | BA minus Opus | Cost a check | Time, median |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Opus 5.5, medium | 0.84 [0.74, 0.93] | 0.54 [0.45, 0.64] | 0.27 [0.14, 0.42] | | $0.0145 | 5.7 s |
| Claude Sonnet 5.5, medium | 0.89 [0.77, 0.99] | 0.40 [0.31, 0.50] | 0.13 [0.02, 0.26] | 0.00 [−0.16, 0.18] | $0.0045 | 2.4 s |
| Claude Haiku 5.5, low | 0.81 [0.68, 0.91] | 0.69 [0.60, 0.78] | 0.45 [0.29, 0.63] | −0.03 [−0.22, 0.16] | $0.0003 | 1.8 s |
| gpt-6.1-sol, low | 0.81 [0.70, 0.92] | 0.57 [0.47, 0.67] | 0.35 [0.22, 0.48] | −0.05 [−0.23, 0.12] | $0.0041 | 7.1 s |
| gpt-6.1-terra, low | 0.82 [0.70, 0.92] | 0.49 [0.40, 0.59] | 0.29 [0.17, 0.43] | −0.07 [−0.23, 0.11] | $0.0018 | 3.7 s |

**No gain excludes 0, so no new default.** These models move along one curve:
Sonnet trades recall for precision, Haiku the reverse. Haiku ties Opus on balanced
accuracy at a fiftieth of the cost, which is worth knowing for a cheap tier.

### More per conversation

Tuning pairs only (402 sampled, Claude Opus 5.5). Each kept the gist and topic names
and added one thing. All of it is already in the summary or the question cards, so
the strict rule on what goes to the cloud holds.

| Sent | Precision | Recall | False-link rate | BA minus today |
| --- | --- | --- | --- | --- |
| Today: 300 characters and topic names | 0.91 | 0.56 | 0.20 | |
| Up to 5 thread headings | 0.88 | 0.54 | 0.27 | −0.09 [−0.31, 0.09] |
| Up to 5 questions asked | 0.93 | 0.45 | 0.13 | −0.04 [−0.17, 0.14] |
| 900 characters of summary | 0.89 | 0.57 | 0.28 | −0.06 [−0.28, 0.13] |

**Stopped on tuning pairs.** Recall did not rise above 0.55 without more false links.
None went to test.

### The board on this computer

**One order of the history is one draw.** The board is greedy, so what it links
depends on what came first. MiniLM at 0.81 scored precision 0.905 on tuning pairs
with the test meetings on the board, and 0.835 without them. That first number looked
like a win from a one-line change. It was not. Every board below is the expected
board over random orders of the series: 12 while tuning, 20 on test. A prediction is
then the share of orders that link a pair.

**One subject is most of the board.** At 0.82 on the tuning meetings, in one order, one subject
("Remote control design features") holds 61 of 89 meetings, 275 of the 285 false
pairs, and 88% of the true ones. Its precision is 0.85, against a base rate of 0.77.
Every other subject is 0.94 to 1.00 pure. On AMI recall above 0.2 means accepting that
subject. This is why no threshold moved precision far.

**Embedding models.** Tuning meetings, the board's rule (over orders), at the point
nearest recall 0.50. CPU time is one thread, one text at a time, **on a loaded Mac**
(load above 80): read it as a ratio between models, not as a final figure. A topic
costs about 41 turns and 43 phrases.

| Model | MB | Dim | CPU ms, turn / name (loaded Mac) | Time a topic (loaded Mac) | Memory | License | Pair AUC | Greedy: P, R, FL | No order: P, R, FL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all-MiniLM-L6-v2 (main) | 90 | 384 | 4.5 / 2.2 | 0.3 s | 230 MB | Apache-2.0 | 0.71 | 0.87, 0.46, 0.23 | 0.89, 0.49, 0.21 |
| **bge-small-en-v1.5** | 133 | 384 | 8.4 / 3.8 | 0.5 s | 275 MB | MIT | **0.72** | **0.88, 0.54, 0.24** | **0.89, 0.52, 0.21** |
| snowflake-arctic-embed-m-v1.5 | 110 | 768 | 16.1 / 4.6 | 0.9 s | 287 MB | Apache-2.0 | 0.71 | 0.87, 0.54, 0.27 | 0.86, 0.58, 0.32 |
| granite-embedding-small-english-r2 | 97 | 384 | 14.9 / 3.6 | 0.8 s | 197 MB | Apache-2.0 | 0.70 | 0.89, 0.47, 0.20 | 0.88, 0.63, 0.30 |
| granite-embedding-97m-multilingual-r2 | 98 | 384 | 9.3 / 2.4 | 0.5 s | 571 MB | Apache-2.0 | 0.69 | 0.82, 0.66, 0.47 | 0.88, 0.53, 0.25 |
| EmbeddingGemma 2, 768 | 175 | 768 | 164 / 77 | 10 s | 527 MB | Apache-2.0 | 0.69 | 0.82, 0.61, 0.45 | 0.83, 0.69, 0.47 |
| EmbeddingGemma 2, 256 | 175 | 256 | 164 / 77 | 10 s | 527 MB | Apache-2.0 | 0.69 | 0.81, 0.80, 0.65 | 0.83, 0.30, 0.21 |
| EmbeddingGemma 1, 768 | 176 | 768 | 57 / 17 | 3 s | 516 MB | Gemma terms | 0.70 | 0.82, 0.55, 0.40 | 0.87, 0.40, 0.20 |
| EmbeddingGemma 1, 256 | 176 | 256 | 57 / 17 | 3 s | 516 MB | Gemma terms | 0.71 | 0.82, 0.66, 0.49 | 0.90, 0.44, 0.17 |
| mxbai-embed-large-v1 (over the size) | 337 | 1024 | 51 / 19 | 2.9 s | 644 MB | Apache-2.0 | 0.71 | 0.86, 0.44, 0.25 | 0.89, 0.57, 0.24 |

Time a topic is CPU time for 41 turns and 43 phrases, on a loaded Mac, so these wait
for a quiet-machine run. MB is what the app would ship. Not screened: jina-embeddings-v5 (CC BY-NC), LFM2.5-Embedding (license
other, custom code), harrier-oss and Octen (no ONNX or GGUF from the publisher),
pplx-embed (399 MB at its smallest).

- **bge-small-en-v1.5 is the best of them**, and the only one that is a near drop-in:
  the same tokenizer as MiniLM, 384 dimensions, 133 MB against 90 MB, about twice the
  CPU.
- **EmbeddingGemma 2 loses.** It is new, Apache-2.0 and large on benchmarks, and here
  it scores below MiniLM at 36 times the CPU. Its prefix for sentence similarity is
  the publisher's. 256 dimensions lose little against 768, and neither helps.
- Cosines near 1 are a real cost. granite and EmbeddingGemma 2 put every useful
  threshold between 0.97 and 0.99, where one byte a dimension loses resolution.

**No order at all.** Average-linkage clustering of topic vectors gives one board for
one history. On tuning pairs it matched or passed the greedy rule at equal recall,
and it removes the order noise. It does redraw old subjects as new conversations
arrive, which the greedy board never does.

**Test pairs.** Named before the read, each against main. Twenty orders.

| Method | Precision | Recall | False-link rate | Precision minus main | BA minus main |
| --- | --- | --- | --- | --- | --- |
| Main: MiniLM, 0.78 | 0.83 [0.75, 0.90] | 0.68 [0.63, 0.74] | 0.41 [0.32, 0.51] | | |
| MiniLM, 0.82 | 0.85 [0.77, 0.92] | 0.49 [0.41, 0.57] | 0.26 [0.18, 0.34] | +0.02 [−0.00, 0.04] | −0.04 [−0.09, 0.01] |
| MiniLM, no order, 0.74 | 0.86 [0.77, 0.93] | 0.49 [0.39, 0.59] | 0.24 [0.16, 0.33] | +0.03 [−0.01, 0.05] | −0.03 [−0.10, 0.05] |
| bge-small, 0.96 | 0.87 [0.79, 0.93] | 0.53 [0.49, 0.59] | 0.25 [0.19, 0.31] | +0.04 [0.02, 0.05] | +0.02 [−0.05, 0.09] |
| bge-small, no order, 0.944 | 0.89 [0.81, 0.96] | 0.41 [0.34, 0.47] | 0.15 [0.07, 0.22] | +0.06 [0.03, 0.10] | −0.01 [−0.09, 0.07] |

Every method drew 0 of 366 mixed false links and kept the non-scenario link. With both
meetings in test series the picture is the same (main 0.82 and 0.68, bge-small at 0.96
0.85 and 0.54).

**Nothing clears the on-device bar, so main stays.** bge-small at 0.96 is the nearest:
recall, false links and the interval all pass, and precision is 0.865 against 0.90.
The gain is a trade along the curve, not a better curve: balanced accuracy does not
move. So there is no default change and no migration PR.

**Reranking and hybrids stopped on tuning pairs.** A small logistic model read every
signal, with series folds inside tuning. AUC on scenario pairs:

| Signals | AUC, cross-validated |
| --- | --- |
| Topic vectors alone (bge-small) | 0.71 |
| + BM25 on gists | 0.71 |
| + tf-idf of what was said | 0.71 |
| + shared terms | 0.71 |
| + shared people, recency | 0.71 |
| + topic names | 0.74 |
| + three cross-encoders, on excerpts, gists and names | 0.73 |
| Everything | 0.75 |

The best cross-encoder alone reached 0.66 (ms-marco-TinyBERT on gists, 1 ms a pair);
jina-tiny on excerpts fell below chance at 0.46. People and recency are 0.49 to
0.50 alone: on AMI a pair in one series is as likely to be linked as a pair across, so
AMI cannot show what they would do. The ettin rerankers' ONNX export has no scoring
head, so they did not run. Blending names into the clustering gained nothing either.
Names carry what little there is to add, and a pair-level score cannot draw a subject
without the chaining this round found in the cloud check.

### A local writing model as the linker

The same check as the cloud's, with the app's prompt, names and gists only, on the
fixed sample. Names and gists here are gpt-5.6-luna's, so a local model reads better
input than it would on its own: this is the most a local linker could do.

| Model | Precision | Recall | False-link rate | Time a check | Tuning pairs |
| --- | --- | --- | --- | --- | --- |
| Claude Opus 5.5, for reference | 0.91 | 0.56 | 0.20 | 5.7 s | |
| Apple's system model (Foundation Models) | 0.90 | 0.21 | 0.09 | 3.1 s | 1 of 9 mixed false links |

Gemma 4 E4B and Qwen3.5 4B: pending. These runs wait for the GPU lock.

### Inside one conversation

This had not been measured. On the test meetings (50 meetings, 111 fine and 13
top-level gold returns), under the rule written before the runs:

| What is drawn | Drawn | Right | Wrong | Unverifiable | Precision | Recall | Chance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tracker, the record (Connections) | 27 | 3 | 20 | 4 | 0.13 [0.00, 0.26] | 0.08 [0.04, 0.13] | 0.07 |
| Tracker, live (flow card) | 24 | 2 | 15 | 7 | 0.12 [0.00, 0.32] | 0.03 [0.00, 0.07] | |
| Loop, live (gpt-5.6-terra) | 44 | 7 | 22 | 15 | 0.24 [0.08, 0.42] | 0.08 [0.02, 0.15] | |
| Opus 5.5 reads the parts at Finish | 26 | 2 | 13 | 11 | 0.13 [0.00, 0.28] | 0.03 [0.00, 0.06] | |
| gpt-5.6-luna reads the parts at Finish | 11 | 0 | 5 | 6 | 0.00 | 0.00 | |

**Nothing is near the bar of 0.80.** But the same rule gives Opus 1 of 22 on tuning
meetings, which says as much about the rule as about Opus: AMI gives each stretch one
broad label. So two judges read the transcript, blind, with 40 control pairs mixed in:

| What is drawn | Sonnet 5.5: came back | gpt-6.1-sol: came back |
| --- | --- | --- |
| Tracker, the record | 0.44 (n 27) | 0.56 |
| Loop, live | 0.43 (n 44) | 0.43 |
| Opus 5.5 at Finish | 0.65 (n 26) | 0.62 |
| gpt-5.6-luna at Finish | 0.45 (n 11) | 0.36 |
| Controls: two stretches, no return drawn | 0.23 (n 40) | 0.28 |

**Under the judges too, nothing reaches 0.80.** About half of what the app draws is
real, and a pair of stretches picked at random reads a quarter. On tuning meetings the
loop read 0.88, on 8 returns; on test it is 0.43, on 44. That was noise, and the test
split is why it is not in the app now.

**Timing.** The loop shows a found return 101 s after the room came back (median), and
its bend is 31 s off. The tracker takes 264 s, and 45 s off. So the loop's gain is
speed, not truth. Each found few: at most 9 of 111.

**Other ways to decide, all on tuning meetings.** Vectors on the record's cuts never
passed the tracker at any threshold (0.12 to 0.19, against 0.19), and centring on the
conversation was worse. A stricter or looser lexical threshold moved the count and not the precision,
under the labels and under the judges (0.50 to 0.63). On the annotators' own fine cuts
vectors reach only 0.43, so better cuts alone would not fix it.

### The reason a link shows

Round 1 graded each method's name pair by pair. The person reads the name of the
subject the board drew, so that is graded here, blind, on 100 test pairs the
annotators link. Match is 0 to 2, and "shared" is the share graded 2.

| Board | Sonnet 5.5: match | shared | gpt-6.1-terra: match | shared |
| --- | --- | --- | --- | --- |
| On this computer, tracker names | 0.72 [0.62, 0.82] | 0.00 | 0.91 [0.84, 0.98] | 0.01 |
| On this computer, writing-model names | 1.09 [1.01, 1.16] | 0.11 | 1.22 [1.13, 1.30] | 0.22 |
| Opus 5.5, before #166 | 0.39 [0.29, 0.49] | 0.01 | 0.85 [0.72, 0.99] | 0.16 |
| Opus 5.5, with #166 | 1.17 [1.00, 1.35] | 0.29 | 1.29 [1.13, 1.46] | 0.35 |
| gpt-6.1-sol, before #166 | 0.35 [0.26, 0.44] | 0.00 | 0.79 [0.67, 0.92] | 0.10 |
| gpt-6.1-sol, with #166 | 0.93 [0.81, 1.05] | 0.13 | 1.05 [0.93, 1.18] | 0.21 |

Before #166 one name stood for 132 conversations, so a cloud user's reason was worse
than a local user's. Now it is the best of them.

**Typed relations stopped early.** Two judges read the transcript of 44 within-series
links on tuning meetings and picked continues, depends on, conflicts, same open
question, or other. Both said "continues" for 38 of them. Between themselves they
reach kappa 0.63. Opus and gpt-6.1-terra, reading names and gists, reach −0.06 to 0.29
against them. On AMI one type is the answer most of the time and a model cannot tell
the rest apart, so a typed label would add a word and no information.

### On real recognition

The app always compares recognized text with recognized text. Parakeet Ultra's numbers
are provisional: AMI is in its training data.

**A history where every meeting was heard.** Apple Speech covers 23 annotated meetings,
so they can make a whole board: 253 scenario pairs, 31 of them unlinked. This is the
nearest thing here to what the app holds. Linking every pair scores precision 0.88.

| Method | Text | Mean WER | Precision | Recall | False-link rate |
| --- | --- | --- | --- | --- | --- |
| Board, MiniLM at 0.78 (main) | Manual | | 0.89 | 0.87 | 0.78 |
| | Quiet room | 27.0 | 0.88 | 0.95 | 0.94 |
| | Steady sound | 51.5 | 0.88 | 0.97 | 0.99 |
| Cloud check with #166, Opus 5.5 | Manual | | 0.97 | 0.38 | 0.10 |
| | Quiet room | 27.0 | 0.94 | 0.53 | 0.23 |
| | Steady sound | 51.5 | 0.86 | 0.43 | 0.52 |
| Board, bge-small at 0.96 | Manual | | 0.90 | 0.47 | 0.37 |
| | Quiet room | 27.0 | 0.88 | 0.94 | 0.89 |
| | Steady sound | 51.5 | 0.88 | 1.00 | 1.00 |

- **Recognition costs false links, not recall.** Against manual text, the board's
  false-link rate rises 0.16 [−0.07, 0.29] in the quiet room and 0.22 [0.10, 0.30] in
  steady sound. Transcripts pull together on their shared errors.
- **A small history is harder than the 139-meeting board.** With 23 meetings even manual
  text reads a false-link rate of 0.78 at main's threshold, against 0.41 on the full
  board: fewer subjects compete, so topics pile into one. Main's board here scores what
  linking everything scores. It tells a person little until a history grows, at least
  on a history about one thing.
- **The cloud check is the only method here that still tells pairs apart.** In the quiet
  room it holds precision 0.94 and false links 0.23, with a largest subject of 10 of 23.
  In steady sound it falls to 0.86 and 0.52, a real cost: false links +0.42 [0.16, 0.67].
  Two runs on manual text differ by 0.08 in recall, which sets the noise.
- **bge-small does worse than MiniLM, and that decides it.** Its false-link rate rises
  0.52 [0.36, 0.76] and 0.63 [0.46, 0.90]. Its cosines sit in a narrow band near 1, and
  recognition's shared errors fill that band. The model that looked best on clean
  transcripts is the more fragile on what the app hears.

**A higher threshold is not the fix.** Main's 0.78 was tuned on manual text. On the 8
tuning meetings, as heard, 0.84 read precision 0.89, recall 0.57 and false links 0.25.
On the 15 test meetings it reads 0.94, 0.81 and 0.65 in the quiet room, and 0.93, 0.93
and 0.88 in steady sound (0.93, 0.97 and 0.90, and 0.93, 0.99 and 0.95, at 0.78). So it
misses the bar. The test side has only 8 unlinked pairs, and was looked at before the
freeze (see the note there), so this says only that the threshold does not carry over.
A sound threshold for recognized text needs more tuning meetings through recognition.

**With one side on manual text**, for the record: 1,044 pairs with a recognized meeting
on one side and a manual one on the other. This is not a case the app ever has, and it
points the wrong way: recall falls, because recognized and manual text sit apart.

| Text | Mean WER | Precision | Recall | False-link rate | Recall minus manual |
| --- | --- | --- | --- | --- | --- |
| Manual | | 0.88 | 0.65 | 0.43 | |
| Parakeet Ultra, quiet room (provisional) | 21.7 | 0.88 | 0.43 | 0.30 | −0.22 [−0.35, −0.14] |
| gpt-transcribe, quiet room | 25.2 | 0.87 | 0.49 | 0.36 | −0.16 [−0.22, −0.12] |
| Apple Speech, quiet room | 28.5 | 0.88 | 0.47 | 0.33 | −0.18 [−0.32, −0.07] |
| small.en, quiet room | 32.0 | 0.88 | 0.44 | 0.29 | −0.21 [−0.29, −0.14] |
| Parakeet Ultra, steady sound (provisional) | 45.3 | 0.83 | 0.17 | 0.17 | −0.48 [−0.58, −0.41] |
| small.en, steady sound | 59.1 | 0.88 | 0.05 | 0.03 | −0.60 [−0.77, −0.50] |

The cloud check on the same kind of pairs (95 sampled pairs, each replay) moved no more
than two runs on manual text do, for all six replays. That small sample with a manual
side is why a first reading here said the check had no cost; the whole recognized history
above is the better evidence.

**Returns on recognized text** are too few to rate: the tracker draws 1 to 6 returns on
the 8 meetings, against 12 to 18 gold ones, and none verifies as right under the labels.

### What a model change would cost

No model cleared the bar, so nothing here is planned. For the record, a change from
MiniLM means:

- **Stored vectors have no model tag.** `node.vector` is base64 of one byte a dimension.
  A 768-dimension vector is left out by the length checks in `linkThreads`, but
  bge-small is also 384 dimensions, so old and new vectors would compare silently and
  mean nothing. The record needs a model name beside each vector first.
- **Old conversations fall back to names until they are read again.** Round 1's half
  rows show that state is worse than either end (precision 0.80 to 0.81). Re-embedding
  needs only the transcript: 8.4 ms a turn for bge-small, so about 3 s for an hour-long
  conversation, and about 1 min for EmbeddingGemma 2.
- **Search shares the model.** `vectorIndex.js` keeps its Qdrant collection on the same
  embedder, so a change means a rebuild, or two bundled models.
- **The worker reads one shape.** `onnxWorker.js` has one tokenizer (WordPiece) and mean
  pooling. bge-small needs first-token pooling and `token_type_ids` only. EmbeddingGemma,
  granite, nomic and Qwen need another tokenizer in the worker, or llama-server.
- **Every threshold moves.** `CONTENT_SIMILARITY`, `LINK_SIMILARITY`, `CANDIDATE_FLOOR`,
  and the tracker's `VECTOR_WEIGHT`, which picks on-device names by cosine to the fourth
  power and so would need the name judge again.

### What the gold can and cannot show, after this round

- The label rule and the judges disagree by a factor of three on returns. Every
  precision here is a lower bound, and a judge is also a model.
- On the scenario meetings "linked" holds for 76% of pairs, so a blob scores well.
  False-link rate and the size of the largest subject say more than recall does.
- AMI cannot show what shared people or recency are worth, or how often a real history
  chains into one subject.
- The cloud board was measured in one order of the history. Each order costs a new set
  of checks.
- Recognized histories cover 23 meetings at most, and the test side of them has 8
  unlinked pairs. The 139-meeting board has no recognized version, and board size moves
  the numbers more than most methods do.

## Decisions for Alex

1. **What to do with "came back".** Nothing reached 0.80, and about half of what is drawn
   is real. Options: (a) leave it; (b) keep the line's move and drop the count from the
   caption ("3 returns to earlier topics"), which is the sentence that makes the claim;
   (c) with a writing model, keep in the record only returns a model confirms at Finish
   (0.62 to 0.65 against 0.44 to 0.56). Recommended: (b) now, since it needs no model.
2. **The on-device default.** Recommended: keep MiniLM at 0.78 for now, and tune again on
   recognized text once more tuning meetings come through. bge-small at 0.96 misses the
   precision bar by 0.035 on manual text and falls apart on recognized text. A threshold
   of 0.84 does not carry over. Say plainly that a small history on one subject gets
   little from the on-device board.
3. **Typed relations.** Recommended: no.

## Reproduce

```sh
export FM_LEDGER=~/.cache/oats/link-eval/ledger-2.jsonl FM_BUDGET_USD=50
PY=~/oats-asr-cache/venvs/links/bin/python                # onnxruntime, tokenizers, numpy
node scripts/link-eval-2.mjs texts --out texts.json       # every text to embed
$PY -I scripts/lib/embed_texts.py --config bge-small --texts texts.json \
  --store ~/.cache/oats/link-eval/embed                   # one per model, on the CPU
node scripts/link-eval-2.mjs screen --configs minilm,bge-small --split tune --drawn
node scripts/link-eval-2.mjs curve --configs "bge-small::0.93:0.97:0.01" --split tune
node scripts/link-eval-2.mjs rerank-texts --kind gist --out gist.json
$PY -I scripts/lib/rerank_pairs.py --model rerank-stsb-distilroberta-base --pairs gist.json \
  --out ~/.cache/oats/link-eval/rerank/rerank-stsb-distilroberta-base~gist.json
node scripts/link-eval-2.mjs hybrid --configs bge-small
node scripts/link-eval-2.mjs final-boards --split test --orders 20 \
  --methods "stored:0.78+greedy:bge-small:0.96+linkage:bge-small:0.944"
# The cloud check: the fixed sample, and the app's whole path
ANTHROPIC_API_KEY=… node scripts/link-eval.mjs remote --model "anthropic:claude-haiku-5-5@low"
node scripts/link-eval-2.mjs cloud --split test --runs "anthropic_claude-opus-5-5_think_medium,…"
ANTHROPIC_API_KEY=… node scripts/link-eval-2.mjs app-path --model "anthropic:claude-opus-5-5@think,medium"
git show f7bd563:src/helpers/conversationLinks.mjs > before.mjs   # the board before #166
node scripts/link-eval-2.mjs app-path-final --split test --links-module before.mjs \
  --runs "anthropic_claude-opus-5-5_think_medium"
# Returns
node scripts/topic-loop-eval.mjs --variant d1 --ami <dir> --set all --trace-lanes --json d1.json
node scripts/return-eval.mjs score --input d1.json --split test
ANTHROPIC_API_KEY=… node scripts/return-eval.mjs decide --model "anthropic:claude-opus-5-5@think,medium" \
  --input d1.json --split test
ANTHROPIC_API_KEY=… node scripts/return-eval.mjs judge --model anthropic:claude-sonnet-5-5 --input d1.json \
  --split test
# Recognition: each replay, then the boards
node scripts/link-eval.mjs snapshots --replay <dir> --cache <cache> --meetings <ids>
node scripts/link-eval-2.mjs recognition-boards --center 0.78 --orders 8 --runs "small.en__quiet-room"
ANTHROPIC_API_KEY=… node scripts/link-eval-2.mjs recognition-history --center 0.78 --orders 12 \
  --runs "apple-speech__quiet-room" --model "anthropic:claude-opus-5-5@think,medium"
```

Round 2 cost $23.54 at list prices, in the ledger above. Weights are in
`~/oats-asr-cache/models/embed/`, with a README of each file's source and license.
