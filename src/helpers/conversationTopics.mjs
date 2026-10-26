// Topic and thread tracking for a live conversation.
//
// This is the data model underneath the conversation flow card (lanes and
// graph), the topic graph in Intelligence and the open-thread list. Neither is
// worth more than the detector below. It runs on finalized utterances in the
// renderer, with no model call and no network, cheap enough for every
// utterance of a long meeting.
//
// The three things it produces:
//   - **topics**, each named with a phrase somebody in the room said, with how
//     much of the conversation each one held,
//   - **transitions** between them, which are the graph's edges, including the
//     back-edge when a conversation returns to something it dropped, the single
//     most interesting thing the graph can show,
//   - **thread state** (live / open / resolved / dropped).
//
// Why it works this way. The first tracker decided every utterance on its own:
// does this sentence share a fifth of its words with the live topic? Measured
// on real meetings (the AMI corpus, `scripts/topic-eval.mjs`) it did worse than
// drawing one topic for the whole meeting. Spoken sentences are short and full
// of words that name nothing ("it's", "yeah", "mm-hmm", "couldn't"); a topic
// that had heard a few minutes of them covered every next sentence, so one
// topic held most of a meeting, and its name was two of those words.
//
// So it reads the conversation the way TextTiling does (Hearst, 1997): compare
// the words before each pause with the words after it, over windows of a
// minute or more of speech, and cut where the two sides share least compared
// with the rest of the conversation. A window averages away the sentence that
// happens to share nothing. A topic is named with the phrase the room used
// for it, not with its two most frequent words.
//
// While the conversation goes on, a cut is drawn only once enough speech has
// followed it that later words cannot move it, so the flow card never takes a
// topic back. The record a finished conversation keeps (`snapshot` with
// `final`) is cut again from the whole conversation, with hindsight.
//
// Kept as dependency-free ESM so it unit-tests under node:test like the rest of
// the conversation core.

import { ENGLISH_WORD_RANKS } from "./englishWordRanks.mjs";

// ---------------------------------------------------------------------------
// Words
//
// A topic is made of the words that name things. Everything that cannot name a
// subject is left out of both the cutting and the naming: function words, what
// people say while they think ("um", "yeah", "kind of"), the verbs every
// sentence uses, and contractions, which are all a pronoun or an auxiliary
// ("it's", "I'm", "couldn't").

const FUNCTION_WORDS = `a about above across after afterwards again against ago ahead all almost
alone along already also although always am among amongst an and another any anybody anyhow
anyone anything anyway anyways anywhere are around as at away back be became because become
becomes becoming been before beforehand behind being below beside besides between beyond both
but by can cannot could did do does doing done down during each either else elsewhere enough
etc even ever every everybody everyone everything everywhere except few for former formerly from
further furthermore had has have having he hence her here hers herself him himself his how
however i ie if in indeed instead into is it its itself just last later latter least less let
lets like likely many may maybe me meanwhile might mine more moreover most mostly much must my
myself namely neither never nevertheless next no nobody none noone nor not nothing now nowhere
of off often on once one ones only onto or other others otherwise our ours ourselves out over
own per perhaps please quite rather really same several shall she should since so some somebody
somehow someone something sometime sometimes somewhat somewhere still such than that the their
theirs them themselves then thence there thereafter thereby therefore therein these they this
those though through throughout thru thus to together too toward towards under unless until up
upon us very via was we were what whatever when whence whenever where whereas whereby wherein
wherever whether which while who whoever whole whom whose why will with within without would yet
you your yours yourself yourselves`;

const SPEECH_WORDS = `ah aha ahh ahem alright kay absolutely actually apparently awesome basically
bye certainly clearly cool definitely eh er erm essentially exactly fine generally gonna gotta
great guess ha haha hah hey hi hello hm hmm hmmm honestly hopefully huh kinda kind literally mhm
mm mmm nah nice nope obviously oh ok okay oops ooh pretty probably right seriously sorta sort
stuff sure thanks thank thing things totally uh uhm um umm wait wanna well whatever whoa wow yay
yeah yea yep yes yup ya yo`;

const LIGHT_VERBS = `ask asks asked come comes came coming feel feels felt find finds found get
gets got gotten getting give gives gave given giving go goes went gone going happen happens
happened keep keeps kept know knows knew known knowing look looks looked looking make makes made
making mean means meant mind need needs needed needing put puts putting remember say says said
saying see sees saw seen seeing seem seems seemed start starts started suppose supposed take
takes took taken taking talk talks talked talking tell tells told telling think thinks thought
thinking try tries tried trying use uses used using want wants wanted wanting wonder bit lot lots
way ways guys`;

// The commonest function words of the other languages Oats transcribes with
// spaces between words, so a conversation that switches language does not
// name a topic "ich" or "que". Words that are also English ("die", "war",
// "son", "con", "mit", "todo", "os", "EU", "AI") are left out. Chinese and Japanese are written without
// spaces and are not split into words here.
const OTHER_LANGUAGES = `ich du er sie wir ihr ein eine einen einem einer der das dem des und oder aber nicht ist sind
auf für von zum zur auch noch schon mal ja nein doch wie wenn dass ob weil dann hier jetzt sehr
nur habe hast haben wird werden kann können muss soll aus bei nach über immer wieder alles
nichts etwas dies diese dieser mein dein kein keine mir mich dich uns euch ihm ihn ihnen el la
los las un una unos unas que de del y en por para es está están ser estar muy pero porque cuando
como más menos sí yo tú él ella nosotros ellos mi tu su sus nos les lo le se este esta esto ese
esa eso aquí ahí allí entonces bueno pues vale también ya nada qué cómo le les des du et ou mais
est sont être avoir avons ont je il elle nous vous ils elles ce cette ces qui quoi avec dans sur
pas très bien oui non alors donc voilà ça aussi déjà tout tous rien comme parce quand où il lo
gli di della che è non sono ho hai abbiamo io lui lei noi voi loro questo questa quello anche
ancora già molto bene perché cosa allora però tutto um uma do da dos das em no na com não são
estão você ele nós eles elas isso isto esse essa muito então já mais tudo и в не на я что он с
как а то это все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет
о из ему теперь когда даже ну ли если уже или ни быть был до вас там потом себя ничего может они
тут где есть надо для мы тебя их чем была сам без чего тоже себе под будет тогда кто этот`;

// What a transcript sometimes writes without its apostrophe.
const BARE_CONTRACTIONS = `dont didnt doesnt cant wont isnt wasnt arent werent couldnt wouldnt
shouldnt hasnt havent hadnt thats whats im ive youre youve youll theyre theyve weve theres heres
ain`;

const STOPWORDS = new Set(
  `${FUNCTION_WORDS} ${SPEECH_WORDS} ${LIGHT_VERBS} ${BARE_CONTRACTIONS} ${OTHER_LANGUAGES}`
    .split(/\s+/)
    .filter(Boolean)
);

// Backchannels that survive tokenizing as one hyphenated word.
const HYPHENATED_SPEECH = /^(?:mm-hmm|mm-hm|uh-huh|uh-oh|mm-mm|huh-uh|oh-oh|yeah-yeah)$/;

const APOSTROPHES = /[‘’ʼ`´]/g;

// The form two words are matched by: singular, so "investors" and "investor"
// are one subject. Never shown; a label uses the words as said.
//
// The first tracker dropped the final "s" of any word longer than four
// letters, which also cut "that's" to "that'", "process" to "proces" and
// "analysis" to "analysi". Only plural endings are folded now.
// Words that end in "s" without being plurals of another word.
const NOT_PLURAL = new Set(
  "news series species lens bias canvas atlas chaos alias ethos kudos physics economics politics mathematics ethics".split(
    " "
  )
);

function keyOf(word) {
  if (NOT_PLURAL.has(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("ie")) return `${word.slice(0, -2)}y`;
  if (word.length > 4 && /(?:sses|shes|ches|xes|zzes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

// Every word of a text in order, as `{ text, key, brk }`: `text` as said (case
// kept), `key` its matching form or null for a word that names nothing, and
// `brk` true when punctuation comes before it, which a phrase never crosses.
function tokenize(text) {
  const out = [];
  const parts = String(text || "")
    .replace(APOSTROPHES, "'")
    .split(/(\s+|[^\p{L}\p{N}'\-\s]+)/u);
  let brk = false;
  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) continue;
    if (!/[\p{L}\p{N}]/u.test(part)) {
      brk = true;
      continue;
    }
    let said = part.replace(/^[-']+|[-']+$/g, "");
    const word = said.toLocaleLowerCase();
    let key = null;
    if (/'s$/.test(word)) {
      // "company's" is the company; "it's", "that's" and "let's" are not.
      const base = word.slice(0, -2);
      if (base.length > 1 && !STOPWORDS.has(base) && !base.includes("'")) {
        key = keyOf(base);
        said = said.slice(0, -2);
      }
    } else if (
      !word.includes("'") &&
      word.length > 1 &&
      !STOPWORDS.has(word) &&
      !HYPHENATED_SPEECH.test(word) &&
      // A bare number names nothing on its own ("800", "2.5").
      !/^[\d.,:%]+$/.test(word)
    ) {
      key = keyOf(word);
    }
    out.push({ text: said, key, brk });
    brk = false;
  }
  return out;
}

// The words of a text that can name a subject, in their matching form.
function contentWords(text) {
  const out = [];
  for (const token of tokenize(text)) if (token.key) out.push(token.key);
  return out;
}

// How uncommon a word is in English, from 0 (the commonest) to 1 (not among
// the commonest ten thousand; see englishWordRanks.mjs). Read once.
let rankMap = null;
function rarity(word) {
  if (!rankMap) {
    rankMap = new Map();
    ENGLISH_WORD_RANKS.split(" ").forEach((entry, index) => rankMap.set(entry, index + 1));
  }
  const cap = rankMap.size * 2;
  const rank = Math.min(rankMap.get(word) ?? cap, rankMap.get(keyOf(word)) ?? cap);
  return Math.log(rank) / Math.log(cap);
}

function addCount(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (const [key, value] of a) {
    aa += value * value;
    const other = b.get(key);
    if (other) dot += value * other;
  }
  for (const value of b.values()) bb += value * value;
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

// ---------------------------------------------------------------------------
// Phrases and labels
//
// A topic is named with something the room said: one to three words in a row,
// none of them a word that names nothing, and no punctuation between them. A
// phrase people repeat ("speech recognition", "launch date") beats each of its
// words alone, a distinctive word ("kinetic", "SAML") beats a common one, and
// a word the whole conversation uses does not name one part of it.

const MAX_PHRASE = 3;

function phrasesOf(tokens) {
  const out = [];
  let run = [];
  const flush = () => {
    for (let start = 0; start < run.length; start += 1) {
      for (let length = 1; length <= MAX_PHRASE && start + length <= run.length; length += 1) {
        const words = run.slice(start, start + length);
        out.push({
          key: words.map((word) => word.key).join(" "),
          keys: words.map((word) => word.key),
          text: words.map((word) => word.text).join(" "),
          initial: words[0].initial,
        });
      }
    }
    run = [];
  };
  tokens.forEach((token, index) => {
    if (!token.key || token.brk) flush();
    if (token.key) run.push({ ...token, initial: index === 0 || token.brk });
  });
  flush();
  return out;
}

// Adds one utterance's phrases to a phrase table (key -> stats). `count` is
// how many utterances used the phrase; `forms` how it was written.
function collectPhrases(table, phrases, order, repeated = null) {
  const seen = new Set();
  for (const phrase of phrases) {
    let stats = table.get(phrase.key);
    if (!stats) {
      stats = { keys: phrase.keys, count: 0, first: order, forms: new Map() };
      table.set(phrase.key, stats);
    }
    if (!seen.has(phrase.key)) {
      stats.count += 1;
      seen.add(phrase.key);
      if (repeated && stats.count === 2) repeated.add(phrase.key);
    }
    let form = stats.forms.get(phrase.text);
    if (!form) {
      form = { count: 0, inner: 0 };
      stats.forms.set(phrase.text, form);
    }
    form.count += 1;
    if (!phrase.initial) form.inner += 1;
  }
}

// How a phrase is written in its label: the way it was said most often in the
// middle of a sentence, so a sentence's capital does not stick to it ("Budget
// is tight" is still "budget") while a name or an acronym keeps its own
// ("SAML", "Pellwood").
function displayForm(forms) {
  let best = null;
  for (const [text, form] of forms) {
    const score = form.inner * 2 + form.count;
    if (!best || score > best.score) best = { text, score, inner: form.inner };
  }
  if (!best) return "";
  if (best.inner) return best.text;
  return best.text
    .split(" ")
    .map((word) => (/^\p{Lu}[\p{Ll}\d'-]*$/u.test(word) ? word.toLocaleLowerCase() : word))
    .join(" ");
}

// Words that describe, count or act rather than name: common adjectives and
// verbs a stopword list cannot drop (they mean something next to a noun),
// numbers and times, and the endings of adjectives, adverbs and participles.
// A heuristic in place of a part-of-speech tagger. A label made only of them
// ("trendy", "thirty minutes", "agree") names less than what it is about.
const DESCRIBING = new Set(
  `able agree available bad basic big certain change cheap clear close common complete correct
  current decide decided different difficult discuss early easy enjoy explain extra fair fast final
  free full general happy hard help high hold important interesting large late learn leave little
  long low main move nice normal old open perfect possible quick ready real recent redo right short
  show similar simple single slow small special specific standard strong sure true understand
  useful wait whole worry wrong half quarter zero one two three four five six seven eight nine ten
  eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty
  fifty sixty seventy eighty ninety hundred thousand million billion first second third minute
  minutes hour hours day days week weeks month months year years today tomorrow yesterday tonight
  morning afternoon evening best worst better worse funny crazy weird amazing terrible horrible fun
  boring busy tired glad entire huge tiny super insane wild guy person people folks idea ideas
  question questions problem problems issue issues point points example reason fact situation
  sense matter shit crap damn fuck fucking`.split(/\s+/)
);
const NOUNS_THAT_LOOK_DESCRIBING = new Set(
  `family supply assembly anomaly monopoly butterfly table cable variable deliverable vegetable
  bible`.split(/\s+/)
);

function describes(word) {
  if (DESCRIBING.has(word)) return true;
  if (NOUNS_THAT_LOOK_DESCRIBING.has(word) || word.length < 6) return false;
  return /(?:ly|able|ible|ful|ous|less)$/.test(word) || /^.{4,}ed$/.test(word);
}

// How a label's score weighs its parts (see `rankPhrases`). Chosen on the AMI
// meetings with the judge in scripts/topic-eval.mjs.
const LABEL_SCORE = Object.freeze({ count: 1.5, share: 0.25, rarity: 0.5, describing: 0.35 });

// The candidates to name one topic, best first.
//
// score = (utterances in this topic that used the phrase) ^ 1.5
//       x (share of the conversation's uses of it that fall in this topic) ^ 0.5
//       x (the summed distinctiveness of its words)
//
// How often the room said it matters most: a word said twice by one person is
// an aside. The share keeps a word the whole meeting uses ("remote control" in
// a meeting about a remote control) from naming every topic in it. A phrase of
// two or three words has to have been said at least twice.
function rankPhrases(
  phrases,
  everywhere,
  { utterances = 0, repeated = null, params = LABEL_SCORE } = {}
) {
  // In a topic of any length, one mention is an aside, not what it was about.
  const minCount = utterances >= 6 ? 2 : 1;
  const keys = minCount > 1 && repeated?.size ? repeated : phrases.keys();
  const ranked = [];
  for (const key of keys) {
    const stats = phrases.get(key);
    if (!stats || (stats.keys.length > 1 && stats.count < 2)) continue;
    const share = stats.count / Math.max(stats.count, everywhere.get(key) ?? stats.count);
    const weight = stats.keys.reduce((sum, word) => sum + rarity(word) ** params.rarity, 0);
    let score = stats.count ** params.count * share ** params.share * weight;
    if (stats.keys.every(describes)) score *= params.describing;
    if (stats.count < minCount) score *= 0.2;
    ranked.push({ key, stats, score });
  }
  // A phrase said in most of the places one of its words was said stands for
  // that word: "launch date" names the topic better than "launch" when the
  // room said the two together.
  const scoreOf = new Map(ranked.map((entry) => [entry.key, entry]));
  for (const entry of ranked) {
    if (entry.stats.keys.length < 2) continue;
    for (const word of entry.stats.keys) {
      const single = scoreOf.get(word);
      if (single && entry.stats.count >= single.stats.count * PHRASE_COVERAGE) {
        entry.score = Math.max(entry.score, single.score * 1.001);
      }
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.stats.first - b.stats.first);
  return ranked;
}

// The share of a word's uses a phrase containing it must account for to name
// the topic in its place.
const PHRASE_COVERAGE = 0.35;

// The phrases that could name a list of utterances, best first, with their
// scores: what a topic's label is chosen from. A writing model that names
// topics can read them as the room's own words for it.
function labelCandidates(texts, { conversation = texts, limit = 5 } = {}) {
  const list = Array.isArray(texts) ? texts : [];
  const phrases = new Map();
  const everywhere = new Map();
  list.forEach((text, index) => collectPhrases(phrases, phrasesOf(tokenize(text)), index));
  for (const text of Array.isArray(conversation) ? conversation : []) {
    for (const key of new Set(phrasesOf(tokenize(text)).map((phrase) => phrase.key))) {
      addCount(everywhere, key);
    }
  }
  return rankPhrases(phrases, everywhere, { utterances: list.length })
    .slice(0, limit)
    .map((entry) => ({ text: displayForm(entry.stats.forms), score: entry.score }));
}

// The label for a list of utterances on their own, named the way a topic is.
function topicLabel(texts, { conversation = texts } = {}) {
  return labelCandidates(texts, { conversation, limit: 1 })[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Cutting
//
// Sizes are in content words. A half-hour meeting has about a thousand. The
// windows grow with the conversation, so a two-minute call is cut at the
// scale of a few sentences and an hour-long meeting at the scale of minutes.
// Every value was chosen on the AMI meetings outside the test set
// (scripts/topic-eval.mjs, `--split tune`) and checked on the demo
// conversations.

const SCALE = Object.freeze({
  // Each side of a pause: this share of the conversation's content words,
  // between these bounds.
  windowShare: 0.2,
  minWindow: 6,
  maxWindow: 200,
  // A pause's similarity is averaged with this many pauses on each side.
  smoothGaps: 3,
  // A topic is at least this share of the conversation's content words,
  // between these bounds...
  segmentShare: 0.2,
  minSegment: 6,
  maxSegment: 90,
  // ...and a new last topic at least this share of that.
  tailShare: 0.5,
  // A cut is a pause where the two sides share less than at this
  // conversation's typical pause by this many standard deviations...
  cut: 1,
  // ...and by at least this much in cosine terms, so a conversation that
  // never changes subject is not cut anyway. Below this many content words the
  // floor rises toward the narrow scale's.
  minDepth: 0.12,
  shortWords: 150,
  // The narrow scale finds a sharp turn to another subject, which wide windows
  // average away: windows of this many words, a dip at least this deep, a
  // topic of at least this many words.
  narrowWindow: 30,
  narrowDepth: 0.9,
  narrowSegment: 30,
  narrowSmoothGaps: 1,
  // While the conversation goes on, a cut is drawn once it is sure: a span of
  // speech has followed it (a narrow window for a sharp turn, at most
  // `settleSpan` words for a slow one) and it has stayed a cut for half that
  // long. None is drawn before this many content words, and a slow turn only
  // once the windows are this wide: windows of a few sentences dip on the
  // same subject in other words.
  settleWindows: 1,
  settlePersist: 0.5,
  settleMinWords: 100,
  settleWindowMin: 50,
  settleSpan: 60,
});

// Window sizes move in steps of about 15%, so the similarities computed for
// one size can be kept while the conversation grows.
function stepped(value, lo, hi) {
  if (value >= hi) return hi;
  if (value <= lo) return lo;
  return Math.min(hi, Math.round(lo * 1.15 ** Math.floor(Math.log(value / lo) / Math.log(1.15))));
}

function scaleFor(total, scale) {
  return {
    window: stepped(total * scale.windowShare, scale.minWindow, scale.maxWindow),
    segment: Math.max(
      scale.minSegment,
      Math.min(scale.maxSegment, Math.round(total * scale.segmentShare))
    ),
  };
}

// Cosine similarity of the `window` content words before each pause with the
// `window` after it. `flat` is every content word in order and `startOf[g]`
// where unit `g` starts in it; a unit is an utterance with content words, and
// pause `g` is the one before unit `g`.
//
// Kept in `cache` per window size: a pause whose window after it was already
// full cannot change as more words arrive, so only the last few pauses are
// worked out again. Sliding windows with running dot products: each word is
// added and removed once.
function pauseSimilarities(flat, startOf, window, cache) {
  const units = startOf.length;
  const total = flat.length;
  const sims = cache.sims;
  const from = Math.max(1, cache.complete);
  if (from < units) {
    const left = new Map();
    const right = new Map();
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    const add = (side, other, key, sign) => {
      const before = side.get(key) ?? 0;
      const after = before + sign;
      if (after) side.set(key, after);
      else side.delete(key);
      dot += sign * (other.get(key) ?? 0);
      return after * after - before * before;
    };
    let at = startOf[from];
    for (let index = Math.max(0, at - window); index < at; index += 1) {
      leftNorm += add(left, right, flat[index], 1);
    }
    for (let index = at; index < Math.min(total, at + window); index += 1) {
      rightNorm += add(right, left, flat[index], 1);
    }
    for (let gap = from; gap < units; gap += 1) {
      const next = startOf[gap];
      for (let index = at; index < next; index += 1) {
        // The word moves from the window after the pause to the one before...
        rightNorm += add(right, left, flat[index], -1);
        leftNorm += add(left, right, flat[index], 1);
        // ...the window before drops its oldest word, the one after takes one.
        if (index - window >= 0) leftNorm += add(left, right, flat[index - window], -1);
        if (index + window < total) rightNorm += add(right, left, flat[index + window], 1);
      }
      at = next;
      sims[gap] = leftNorm > 0 && rightNorm > 0 ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
    }
  }
  let complete = from;
  while (complete < units && startOf[complete] + window <= total) complete += 1;
  cache.complete = complete;
  sims.length = units;
  return sims;
}

// How deep a dip each pause sits in: how far its (smoothed) similarity falls
// below the peaks on each side of it, TextTiling's depth score.
function pauseDepths(sims, smoothGaps) {
  const units = sims.length;
  const smoothed = new Array(units).fill(0);
  for (let gap = 1; gap < units; gap += 1) {
    let sum = sims[gap];
    let count = 1;
    for (let offset = 1; offset <= smoothGaps; offset += 1) {
      if (gap - offset >= 1) {
        sum += sims[gap - offset];
        count += 1;
      }
      if (gap + offset < units) {
        sum += sims[gap + offset];
        count += 1;
      }
    }
    smoothed[gap] = sum / count;
  }
  const depth = new Array(units).fill(0);
  for (let gap = 1; gap < units; gap += 1) {
    let leftPeak = smoothed[gap];
    for (let index = gap - 1; index >= 1 && smoothed[index] >= leftPeak; index -= 1) {
      leftPeak = smoothed[index];
    }
    let rightPeak = smoothed[gap];
    for (let index = gap + 1; index < units && smoothed[index] >= rightPeak; index += 1) {
      rightPeak = smoothed[index];
    }
    depth[gap] = leftPeak - smoothed[gap] + (rightPeak - smoothed[gap]);
  }
  return depth;
}

// Where to cut: the units that start a new stretch, in order. `settled` cuts
// are kept as they are and new ones keep their distance from them.
//
// Two scales. The wide one finds the slow turns of a long meeting, where every
// stretch shares most of its words with the next: a cut is a dip well below
// this conversation's typical pause. The narrow one finds a sharp turn to a
// different subject, which wide windows average away: a cut is a dip that
// falls almost to nothing.
function choosePauses({ startOf, total, wide, narrow, segment, scale, settled = [] }) {
  const near = Math.min(segment, scale.narrowSegment);
  // Each cut with the distance it keeps: a sharp turn may sit closer to its
  // neighbours than a slow one, since it needs fewer words to be sure of.
  const chosen = settled.map((cut) => ({
    gap: typeof cut === "number" ? cut : cut.gap,
    spacing: typeof cut === "number" ? segment : cut.sharp ? near : segment,
  }));
  const accept = (candidates, depth, spacing) => {
    candidates.sort((a, b) => depth[b] - depth[a] || a - b);
    for (const gap of candidates) {
      const at = startOf[gap];
      // A new last topic needs words of its own before it is called one.
      if (total - at < spacing * scale.tailShare) continue;
      const clear = chosen.every(
        (other) => Math.abs(startOf[other.gap] - at) >= Math.min(spacing, other.spacing)
      );
      if (clear) chosen.push({ gap, spacing });
    }
  };
  if (startOf.length >= 3) {
    const values = wide.slice(1);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    );
    // A short conversation is cut only at a sharp turn: over a minute or two
    // of words, the deepest dip of a single subject still stands out from the
    // rest of its few pauses.
    const short = Math.max(0, 1 - total / scale.shortWords);
    const floor = scale.minDepth + (scale.narrowDepth - scale.minDepth) * short;
    const threshold = Math.max(mean + scale.cut * spread, floor);
    // Sharp turns first: where one is, it is where the subject changed, and a
    // wide dip beside it is the same turn seen through wider windows.
    if (narrow) {
      const sharp = [];
      for (let gap = 1; gap < narrow.length; gap += 1) {
        if (narrow[gap] >= scale.narrowDepth) sharp.push(gap);
      }
      accept(sharp, narrow, near);
    }
    const candidates = [];
    for (let gap = 1; gap < wide.length; gap += 1) if (wide[gap] > threshold) candidates.push(gap);
    accept(candidates, wide, segment);
  }
  return chosen.map((cut) => cut.gap).sort((a, b) => a - b);
}

// The cuts for a list of utterances read all at once: for tests, and for the
// benchmark's experiments. The tracker keeps its similarities between calls.
function cutPoints(units, { scale = SCALE, settled = [] } = {}) {
  const flat = [];
  const startOf = [];
  for (const unit of units) {
    startOf.push(flat.length);
    for (const key of unit.keys) flat.push(key);
  }
  const { window, segment } = scaleFor(flat.length, scale);
  const wide = pauseDepths(
    pauseSimilarities(flat, startOf, window, { sims: [0], complete: 1 }),
    scale.smoothGaps
  );
  const narrow = scale.narrowWindow
    ? pauseDepths(
        pauseSimilarities(flat, startOf, Math.min(window, scale.narrowWindow), {
          sims: [0],
          complete: 1,
        }),
        scale.narrowSmoothGaps
      )
    : null;
  return choosePauses({ startOf, total: flat.length, wide, narrow, segment, scale, settled });
}

// ---------------------------------------------------------------------------
// The tracker

// A shown label gives way only when its topic has grown by this factor since
// the label was chosen and another phrase scores this many times more.
const LABEL_REGROWTH = 1.25;
const LABEL_MARGIN = 1.5;

// Candidates kept per topic, so that a label taken by a bigger topic can give
// way to the next one.
const LABEL_CANDIDATES = 12;

// How much meaning weighs in a name, once vectors are known (see
// `addVectors`): a candidate's score is multiplied by its closeness to the
// topic (cosine) to this power. Chosen on AMI with the judge.
const VECTOR_WEIGHT = 4;

// A topic is named by meaning only when at least this share of its turns
// have vectors.
const VECTOR_COVERAGE = 0.5;

// At most this many phrases are embedded for one conversation.
const MAX_PHRASE_VECTORS = 5000;

class ConversationTopicTracker {
  constructor(options = {}) {
    // A topic nobody has come back to for this long has gone cold.
    this.dropAfterMs = options.dropAfterMs ?? 180000;
    // A pause longer than this between two turns on one topic is not time
    // spent on it.
    this.maxGapMs = options.maxGapMs ?? this.dropAfterMs;
    // Two stretches are one topic, and the room came back to it, when the
    // words that set them apart from the rest of the conversation are at
    // least this alike (cosine, each word weighted by how few stretches use
    // it). Chosen on AMI and the demo conversations.
    this.returnThreshold = options.returnThreshold ?? 0.15;
    this.scale = { ...SCALE, ...(options.scale || {}) };
    this.labelScore = { ...LABEL_SCORE, ...(options.labelScore || {}) };
    this.now = options.now || Date.now;

    this.utterances = [];
    // Utterances with content words: where each starts among all content
    // words, and the words themselves in order.
    this.units = [];
    this.startOf = [];
    this.flat = [];
    // How many utterances used each phrase, over the whole conversation.
    this.everywhere = new Map();
    this.resolvedUtterances = new Set();
    // Cuts that can no longer move: the id of the utterance each starts at,
    // and whether it was a sharp turn.
    this.settledCuts = new Map();
    this.labels = new Map();
    this.nextId = 1;

    this.topics = [];
    this.transitions = [];
    this.currentId = null;

    // Meaning, when the app can read it: unit vectors of each utterance and
    // of each repeated phrase (all-MiniLM-L6-v2 in the main process), handed
    // in by `addVectors`. Without them the names stay lexical.
    this.vectorWeight = options.vectorWeight ?? VECTOR_WEIGHT;
    this.vectors = new Map();
    this.phraseVectors = new Map();
    this._phrasesAsked = new Set();
    this._byId = new Map();
    this._shownCuts = [];

    this._similarities = new Map();
    this._candidateSince = new Map();
    this._grouping = new Map();
    this._stretches = new Map();
    this._rankings = new Map();
    this._final = null;
  }

  // Feeds one finalized utterance and returns the topic it is in now. Every
  // utterance is placed at once. Nothing is held for the next turn, so reading
  // the graph never decides anything.
  onUtterance(utterance) {
    const text = String(utterance?.text || "").trim();
    if (!text) return null;
    const tokens = tokenize(text);
    const keys = tokens.filter((token) => token.key).map((token) => token.key);
    const phrases = phrasesOf(tokens);
    const record = {
      id: String(utterance.id),
      at: Number.isFinite(utterance.at) ? utterance.at : this.now(),
      keys,
      phrases,
    };
    this.utterances.push(record);
    this._byId.set(record.id, record);
    for (const key of new Set(phrases.map((phrase) => phrase.key))) addCount(this.everywhere, key);
    if (keys.length) {
      this.units.push({ id: record.id, index: this.utterances.length - 1 });
      this.startOf.push(this.flat.length);
      for (const key of keys) this.flat.push(key);
    }
    this._update();
    return this.topics.find((topic) => topic.id === this.currentId) ?? null;
  }

  // Marks resolved the topic that contains a given utterance. Called when a
  // question is answered: an answered question is the clearest signal a thread
  // reached a conclusion.
  //
  // It resolves the topic the *question* belonged to, not the live one: the
  // verdict arrives seconds later and the room may have already moved on.
  resolveTopicForUtterance(utteranceId) {
    const id = String(utteranceId ?? "");
    if (!id) return null;
    const topic = this.topics.find((candidate) => candidate.utteranceIds.includes(id));
    if (!topic) return null;
    this.resolvedUtterances.add(id);
    topic.resolved = true;
    return topic;
  }

  // The depths of every pause, at both scales, for the words so far.
  _depths() {
    const total = this.flat.length;
    const { window, segment } = scaleFor(total, this.scale);
    const depthsAt = (size, smoothGaps) => {
      let cache = this._similarities.get(size);
      if (!cache) {
        cache = { sims: [0], complete: 1 };
        this._similarities.set(size, cache);
      }
      return pauseDepths(pauseSimilarities(this.flat, this.startOf, size, cache), smoothGaps);
    };
    // Similarities for window sizes the conversation has outgrown are dropped.
    for (const size of this._similarities.keys()) {
      if (size !== window && size !== this.scale.narrowWindow) this._similarities.delete(size);
    }
    const wide = depthsAt(window, this.scale.smoothGaps);
    // The narrow scale, lightly smoothed. While the conversation is short its
    // windows are the wide ones.
    const narrow = this.scale.narrowWindow
      ? depthsAt(Math.min(window, this.scale.narrowWindow), this.scale.narrowSmoothGaps)
      : null;
    return { window, segment, wide, narrow, total };
  }

  _update() {
    const { window, segment, wide, narrow, total } = this._depths();
    const settled = [];
    this.units.forEach((unit, index) => {
      if (this.settledCuts.has(unit.id))
        settled.push({ gap: index, sharp: this.settledCuts.get(unit.id) });
    });
    const cuts = choosePauses({
      startOf: this.startOf,
      total,
      wide,
      narrow,
      segment,
      scale: this.scale,
      settled,
    });
    // A cut settles once a full window of speech has followed it: the
    // similarities it was decided from can no longer change. Only settled cuts
    // are drawn while the conversation goes on, so the flow card never takes
    // a topic back.
    const seen = new Map();
    for (const cut of cuts) {
      const id = this.units[cut].id;
      seen.set(id, this._candidateSince.get(id) ?? total);
    }
    this._candidateSince = seen;
    for (const cut of total >= this.scale.settleMinWords ? cuts : []) {
      const id = this.units[cut].id;
      // A sharp turn is sure once a narrow window has followed it. A slow one
      // is drawn live only once the windows are wide: early in a conversation
      // the windows are a few sentences, and a dip between two of them is as
      // often the same subject in other words.
      const sharp = Boolean(narrow) && narrow[cut] >= this.scale.narrowDepth;
      if (!sharp && window < this.scale.settleWindowMin) continue;
      const span = sharp
        ? Math.min(window, this.scale.narrowWindow)
        : Math.min(window, this.scale.settleSpan);
      if (
        total - this.startOf[cut] >= this.scale.settleWindows * span &&
        total - seen.get(id) >= this.scale.settlePersist * span
      ) {
        this.settledCuts.set(id, sharp);
      }
    }
    this._depthCache = { window, segment, wide, narrow, total };
    this._final = null;
    const shown = cuts.filter((cut) => this.settledCuts.has(this.units[cut].id));
    this._shownCuts = shown;
    Object.assign(this, this._topicsFor(shown, { commit: true }));
  }

  // Vectors for utterances (by id) and phrases (by the key `phrasesToEmbed`
  // gave), from a sentence embedding model. The topics are named again with
  // them; nothing is cut differently. Vectors of any length; they are made
  // unit length here.
  addVectors({ utterances = [], phrases = [] } = {}) {
    const unit = (vector) => {
      const values = Float32Array.from(vector ?? []);
      let norm = 0;
      for (const value of values) norm += value * value;
      norm = Math.sqrt(norm);
      if (!(norm > 0)) return null;
      for (let index = 0; index < values.length; index += 1) values[index] /= norm;
      return values;
    };
    let added = 0;
    for (const [id, vector] of utterances) {
      const value = unit(vector);
      if (value) {
        this.vectors.set(String(id), value);
        added += 1;
      }
    }
    for (const [key, vector] of phrases) {
      const value = unit(vector);
      if (value) {
        this.phraseVectors.set(String(key), value);
        added += 1;
      }
    }
    if (!added || !this._depthCache) return;
    this._final = null;
    Object.assign(this, this._topicsFor(this._shownCuts, { commit: true }));
  }

  // The phrases worth a vector that have none yet and were not asked for:
  // the candidates to name the topics as they stand, then every phrase said
  // in two turns or more, most used first, since the record is cut again at
  // the end and its topics can have other candidates. Each is returned once,
  // as the key `addVectors` takes back and the text to embed.
  phrasesToEmbed(limit = 64) {
    const out = [];
    const ask = (key, text) => {
      if (out.length >= limit || this._phrasesAsked.size >= MAX_PHRASE_VECTORS) return false;
      if (!this._phrasesAsked.has(key)) {
        this._phrasesAsked.add(key);
        out.push({ key, text });
      }
      return true;
    };
    for (const topic of this.topics) {
      for (const entry of topic.ranked) if (!ask(entry.key, entry.text)) return out;
    }
    const repeated = [...this.everywhere.entries()]
      .filter(([key, count]) => count >= 2 && !this._phrasesAsked.has(key))
      .sort((a, b) => b[1] - a[1]);
    for (const [key] of repeated) if (!ask(key, key)) break;
    return out;
  }

  // One stretch of utterances, from `start` up to `end` (not included), with
  // its words and phrases. Kept between calls: a stretch that only grew is
  // extended, not read again.
  _stretch(start, end) {
    let stretch = this._stretches.get(start);
    if (!stretch || stretch.end > end) {
      stretch = {
        start,
        end: start,
        words: 0,
        bag: new Map(),
        phrases: new Map(),
        repeated: new Set(),
      };
      this._stretches.set(start, stretch);
    }
    for (let index = stretch.end; index < end; index += 1) {
      const utterance = this.utterances[index];
      stretch.words += utterance.keys.length;
      for (const key of utterance.keys) addCount(stretch.bag, key);
      collectPhrases(stretch.phrases, utterance.phrases, index, stretch.repeated);
    }
    stretch.end = end;
    return stretch;
  }

  // The topics for one set of cuts (unit indexes).
  _topicsFor(cuts, { commit }) {
    const starts = [0, ...cuts.map((cut) => this.units[cut].index)].filter(
      (start, index, list) => index === 0 || start > list[index - 1]
    );
    const stretches = starts.map((start, index) =>
      this._stretch(start, starts[index + 1] ?? this.utterances.length)
    );
    if (commit) {
      for (const start of this._stretches.keys())
        if (!starts.includes(start)) this._stretches.delete(start);
    }

    // Stretches that are about the same thing are one topic: the room came
    // back to it. The stretch just before cannot be the same topic: a cut was
    // made between them. Words are weighted by how few stretches use them: in
    // a meeting about a remote control, "remote" and "button" are in every
    // stretch and say nothing about which one the room came back to.
    const spread = new Map();
    for (const stretch of stretches) for (const key of stretch.bag.keys()) addCount(spread, key);
    const weighted = stretches.map((stretch) => {
      const out = new Map();
      for (const [key, count] of stretch.bag) {
        const idf = Math.log((stretches.length + 1) / spread.get(key));
        if (idf > 0) out.set(key, count * idf);
      }
      return out;
    });
    //
    // While the conversation goes on, a stretch that has ended keeps the
    // topic it was given, so the flow card does not move a past stretch from
    // one row to another as the weights shift; the record decides afresh.
    const groups = [];
    const groupOf = [];
    stretches.forEach((stretch, index) => {
      let best = null;
      let bestScore = 0;
      const decided = commit ? this._grouping.get(stretch.start) : undefined;
      if (decided !== undefined && decided !== stretch.start) {
        const target = groups.findIndex((group) => stretches[group.members[0]].start === decided);
        if (target >= 0 && !(index && groupOf[index - 1] === target)) {
          best = target;
          bestScore = Infinity;
        }
      }
      if (decided === undefined || (decided !== stretch.start && best == null)) {
        groups.forEach((group, groupIndex) => {
          if (index && groupOf[index - 1] === groupIndex) return;
          const score = cosine(weighted[index], group.vector);
          if (score > bestScore) {
            best = groupIndex;
            bestScore = score;
          }
        });
      }
      // Decided once, when the stretch first holds a narrow window of words:
      // later words (the next subject, before its cut settles) do not move it.
      if (
        commit &&
        decided === undefined &&
        (index < stretches.length - 1 || stretch.words >= this.scale.narrowWindow)
      ) {
        this._grouping.set(
          stretch.start,
          best != null && bestScore >= this.returnThreshold
            ? stretches[groups[best].members[0]].start
            : stretch.start
        );
      }
      if (best != null && bestScore >= this.returnThreshold) {
        groupOf.push(best);
        groups[best].members.push(index);
        for (const [key, value] of weighted[index]) addCount(groups[best].vector, key, value);
      } else {
        groupOf.push(groups.length);
        groups.push({ members: [index], vector: new Map(weighted[index]) });
      }
    });
    return this._publish(stretches, groups, groupOf, { commit });
  }

  // Turns stretches and their groups into topics with stable ids, names,
  // times and transitions.
  _publish(stretches, groups, groupOf, { commit }) {
    // A topic keeps its id while it keeps most of its utterances, so the flow
    // card's rows, and a row someone selected, stay put as cuts settle.
    const topicOfUtterance = new Map();
    for (const topic of this.topics) {
      for (const id of topic.utteranceIds) topicOfUtterance.set(id, topic.id);
    }
    // A topic is who it was when it started: the id is the one its first
    // stretch held, so a return does not hand the topic a later stretch's id.
    const claimed = new Set();
    const ids = groups.map((group) => {
      for (const member of group.members) {
        const votes = new Map();
        const stretch = stretches[member];
        for (let index = stretch.start; index < stretch.end; index += 1) {
          const id = topicOfUtterance.get(this.utterances[index].id);
          if (id != null) addCount(votes, id);
        }
        const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        const kept = ranked.find(([id]) => !claimed.has(id));
        if (kept) {
          claimed.add(kept[0]);
          return kept[0];
        }
      }
      return null;
    });
    let nextId = this.nextId;
    for (let index = 0; index < ids.length; index += 1) {
      if (ids[index] == null) ids[index] = nextId++;
    }
    if (commit) this.nextId = nextId;

    const topics = groups.map((group, groupIndex) => {
      const members = group.members.map((member) => stretches[member]);
      const utterances = members.flatMap((stretch) =>
        this.utterances.slice(stretch.start, stretch.end)
      );
      let durationMs = 0;
      for (const stretch of members) {
        for (let index = stretch.start + 1; index < stretch.end; index += 1) {
          const gap = this.utterances[index].at - this.utterances[index - 1].at;
          if (gap > 0) durationMs += Math.min(gap, this.maxGapMs);
        }
      }
      const { ranked, words } = this._ranking(members, utterances.length);
      return {
        id: ids[groupIndex],
        label: "",
        ranked,
        size: utterances.length,
        // The words a topic is about, most telling first: consumers take the
        // leading few as its fingerprint to match it across conversations.
        words,
        utteranceIds: utterances.map((utterance) => utterance.id),
        firstAt: utterances[0].at,
        lastAt: utterances[utterances.length - 1].at,
        durationMs,
        returns: group.members.length - 1,
        resolved: utterances.some((utterance) => this.resolvedUtterances.has(utterance.id)),
      };
    });
    this._name(topics, { commit });

    const transitions = [];
    for (let index = 1; index < stretches.length; index += 1) {
      const from = ids[groupOf[index - 1]];
      const to = ids[groupOf[index]];
      const kind = groups[groupOf[index]].members[0] === index ? "new" : "return";
      const existing = transitions.find((edge) => edge.from === from && edge.to === to);
      if (existing) {
        existing.weight += 1;
        if (kind === "return") existing.kind = "return";
      } else {
        transitions.push({ from, to, weight: 1, kind });
      }
    }
    return {
      topics,
      transitions,
      currentId: stretches.length ? ids[groupOf[stretches.length - 1]] : null,
    };
  }

  // A topic's ranked label candidates and its fingerprint words. Kept while
  // the topic's stretches are unchanged, so only the live topic is read again
  // as each utterance arrives.
  _ranking(members, size) {
    const signature = members.map((stretch) => `${stretch.start}-${stretch.end}`).join(",");
    const cached = this._rankings.get(signature);
    if (cached) return cached;
    let phrases;
    let repeated;
    let bag;
    if (members.length === 1) {
      ({ phrases, repeated, bag } = members[0]);
    } else {
      phrases = new Map();
      repeated = new Set();
      bag = new Map();
      for (const stretch of members) {
        for (const [key, count] of stretch.bag) addCount(bag, key, count);
        for (const [key, stats] of stretch.phrases) {
          const merged = phrases.get(key);
          if (!merged) {
            const forms = new Map();
            for (const [text, form] of stats.forms) forms.set(text, { ...form });
            phrases.set(key, { ...stats, forms });
          } else {
            merged.count += stats.count;
            merged.first = Math.min(merged.first, stats.first);
            for (const [text, form] of stats.forms) {
              const into = merged.forms.get(text);
              if (into) {
                into.count += form.count;
                into.inner += form.inner;
              } else {
                merged.forms.set(text, { ...form });
              }
            }
          }
          if (phrases.get(key).count >= 2) repeated.add(key);
        }
      }
    }
    const ranked = rankPhrases(phrases, this.everywhere, {
      utterances: size,
      repeated,
      params: this.labelScore,
    })
      .slice(0, LABEL_CANDIDATES)
      .map((entry) => ({
        key: entry.key,
        score: entry.score,
        text: displayForm(entry.stats.forms),
      }));
    // The words of its best names first, then its most telling other words:
    // two conversations about the launch date share "launch" and "date"
    // whatever else each one said.
    const words = [];
    for (const entry of ranked) {
      for (const key of entry.key.split(" ")) if (!words.includes(key)) words.push(key);
    }
    const rest = [...bag.entries()]
      .filter(([key]) => !words.includes(key))
      .map(([key, count]) => ({ key, weight: count * rarity(key) ** 2 }))
      .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
    for (const entry of rest) {
      if (words.length >= 8) break;
      words.push(entry.key);
    }
    words.length = Math.min(words.length, 8);
    const result = { ranked, words };
    if (this._rankings.size > 500) this._rankings.clear();
    this._rankings.set(signature, result);
    return result;
  }

  // Names the topics: no two alike, and held steady. The biggest topic picks
  // first; one whose best phrase is taken takes its next. A shown name gives
  // way only when its topic has grown by a quarter since it was chosen and
  // another phrase is clearly ahead, so a label does not flicker between two
  // phrases the room uses about equally.
  _name(topics, { commit }) {
    const taken = new Set();
    const order = [...topics].sort((a, b) => b.size - a.size || a.firstAt - b.firstAt);
    for (const topic of order) {
      const free = this._byMeaning(topic).filter((entry) => !taken.has(entry.key));
      // Twelve candidates all taken by bigger topics is next to impossible;
      // then a repeated name beats none.
      let choice = free[0] ?? topic.ranked[0] ?? null;
      // The record is named afresh: holding a name steady is for the live view.
      const shown = commit ? this.labels.get(topic.id) : null;
      if (shown && choice && shown.key !== choice.key) {
        const kept = free.find((entry) => entry.key === shown.key);
        const grown = topic.size >= shown.size * LABEL_REGROWTH;
        if (kept && (!grown || kept.score * LABEL_MARGIN >= choice.score)) choice = kept;
      }
      if (choice) {
        taken.add(choice.key);
        topic.label = choice.text;
        if (commit && shown?.key !== choice.key) {
          this.labels.set(topic.id, { key: choice.key, size: topic.size });
        }
      } else {
        topic.label = "untitled";
      }
    }
  }

  // A topic's candidates, ordered by meaning too when its vectors are known:
  // each lexical score times the candidate's closeness to what the topic says
  // (the mean of its turns' vectors). Measured on AMI, this names a topic
  // after its subject more often than after a vivid detail of it.
  _byMeaning(topic) {
    if (!this.phraseVectors.size || !this.vectors.size) return topic.ranked;
    let dimension = 0;
    let centroid = null;
    let content = 0;
    let embedded = 0;
    for (const id of topic.utteranceIds) {
      const record = this._byId.get(id);
      if (!record?.keys.length) continue;
      content += 1;
      const vector = this.vectors.get(id);
      if (!vector) continue;
      if (!centroid) {
        dimension = vector.length;
        centroid = new Float64Array(dimension);
      }
      if (vector.length !== dimension) continue;
      embedded += 1;
      for (let index = 0; index < dimension; index += 1) {
        centroid[index] += vector[index] * record.keys.length;
      }
    }
    if (!centroid || embedded < content * VECTOR_COVERAGE) return topic.ranked;
    let norm = 0;
    for (const value of centroid) norm += value * value;
    norm = Math.sqrt(norm);
    if (!(norm > 0)) return topic.ranked;
    const closeness = topic.ranked.map((entry) => {
      const vector = this.phraseVectors.get(entry.key);
      if (!vector || vector.length !== dimension) return null;
      let dot = 0;
      for (let index = 0; index < dimension; index += 1) dot += vector[index] * centroid[index];
      return dot / norm;
    });
    const known = closeness.filter((value) => value != null);
    if (known.length < topic.ranked.length / 2) return topic.ranked;
    // A candidate not embedded yet counts as the least close of the others.
    const floor = Math.max(0.01, Math.min(...known));
    return topic.ranked
      .map((entry, index) => ({
        ...entry,
        score: entry.score * Math.max(0.01, closeness[index] ?? floor) ** this.vectorWeight,
      }))
      .sort((a, b) => b.score - a.score);
  }

  // The stack's contents: what was started and never finished, most recently
  // dropped first. The live topic is never listed: you are already in it.
  openThreads(at = this.now()) {
    return this.topics
      .filter((topic) => topic.id !== this.currentId && !topic.resolved)
      .map((topic) => ({
        id: topic.id,
        label: topic.label,
        state: at - topic.lastAt >= this.dropAfterMs ? "dropped" : "open",
        lastAt: topic.lastAt,
        durationMs: topic.durationMs,
      }))
      .sort((a, b) => b.lastAt - a.lastAt);
  }

  // The graph's contents. Node weight is time spent, which is what the radius
  // encodes; edges keep their direction and weight.
  //
  // `final` is the snapshot a finished conversation is stored as. It is cut
  // again from the whole conversation: the live view drew only the cuts that
  // could no longer move, and the record can use hindsight the live view did
  // not have. Nothing is being spoken in a record, so nothing in it is live:
  // stored with the topic that happened to be current at stop marked `live`,
  // the reading view drew it in the accent on a subject nobody was discussing
  // any more, and hid whether it had been resolved.
  snapshot(at = this.now(), { final = false } = {}) {
    let view = this;
    if (final && this._depthCache) {
      if (!this._final) {
        const { segment, wide, narrow, total } = this._depthCache;
        const cuts = choosePauses({
          startOf: this.startOf,
          total,
          wide,
          narrow,
          segment,
          scale: this.scale,
        });
        this._final = this._topicsFor(cuts, { commit: false });
      }
      view = this._final;
    }
    const nodes = view.topics.map((topic) => ({
      id: topic.id,
      label: topic.label,
      words: topic.words.slice(0, 8),
      durationMs: topic.durationMs,
      utteranceIds: [...topic.utteranceIds],
      firstAt: topic.firstAt,
      lastAt: topic.lastAt,
      returns: topic.returns,
      state:
        !final && topic.id === view.currentId
          ? "live"
          : topic.resolved || topic.utteranceIds.some((id) => this.resolvedUtterances.has(id))
            ? "resolved"
            : at - topic.lastAt >= this.dropAfterMs
              ? "dropped"
              : "open",
    }));
    return { nodes, edges: view.transitions.map((edge) => ({ ...edge })) };
  }
}

export {
  ConversationTopicTracker,
  LABEL_SCORE,
  SCALE,
  contentWords,
  cutPoints,
  labelCandidates,
  phrasesOf,
  rarity,
  tokenize,
  topicLabel,
};
