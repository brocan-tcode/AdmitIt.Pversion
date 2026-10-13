// src/rag/tokenize.js
// Pure-JS text normalisation for the local retriever.
// No dependencies, no network — this is the whole "embedding" story:
// we use lexical BM25 over stemmed tokens instead of vector embeddings,
// because vectors would require an embedding API and this build has none.

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','can','could','did','do','does',
  'for','from','had','has','have','he','her','him','his','how','i','if','in','into','is',
  'it','its','me','my','no','not','of','on','or','our','she','should','so','some','such',
  'than','that','the','their','them','then','there','these','they','this','those','to',
  'up','us','was','we','were','what','when','where','which','while','who','will','with',
  'would','you','your','about','also','more','most','other','only','very','just','get',
  // Question scaffolding and generic verbs. These are rare in a domain corpus,
  // so IDF rates them as highly informative when they carry no topic at all —
  // "what happens if I get deferred" ranked a recruiting-timeline document top
  // purely because its text contained "happens".
  'happen','mean','means','need','needs','want','wants','know','tell','say','says',
  'thing','things','way','ways','kind','sort','lot','lots','much','many','well',
  'still','even','ever','never','always','maybe','really','actually','please',
  'anything','something','someone','anyone','everything','make','makes','take','takes',
  'go','goes','going','come','comes','look','looks','put','puts','let','lets',
]);

// Domain synonyms — expands a query so "odds" also matches "probability",
// "ec" also matches "extracurricular", etc. Applied to queries AND documents
// so both sides land in the same vocabulary.
const SYNONYMS = {
  ec: ['extracurricular'],
  ecs: ['extracurricular'],
  extracurriculars: ['extracurricular'],
  // Kept deliberately narrow: an expansion adds a full-weight query term, so
  // mapping one word to several inflates unrelated documents. "chances" already
  // stems to "chance" and needs no entry.
  odds: ['chance'],
  admit: ['admission', 'accept'],
  admits: ['admission', 'accept'],
  acceptance: ['admission', 'accept'],
  uni: ['university'],
  college: ['university'],
  colleges: ['university'],
  schools: ['university', 'school'],
  cs: ['computer', 'science', 'software'],
  premed: ['medicine', 'biology', 'medical'],
  ed: ['early', 'decision', 'binding'],
  ea: ['early', 'action'],
  rea: ['restrictive', 'early', 'action'],
  rd: ['regular', 'decision'],
  gpa: ['grade', 'average', 'academic'],
  sat: ['test', 'score', 'standardized'],
  act: ['test', 'score', 'standardized'],
  toefl: ['english', 'proficiency', 'language'],
  ielts: ['english', 'proficiency', 'language'],
  opt: ['work', 'authorization', 'employment'],
  h1b: ['visa', 'sponsorship', 'work'],
  f1: ['visa', 'student'],
  intl: ['international'],
  essay: ['essay', 'writing', 'personal', 'statement'],
  essays: ['essay', 'writing'],
  money: ['financial', 'cost', 'aid', 'tuition'],
  cheap: ['affordable', 'cost', 'tuition'],
  job: ['career', 'employment', 'salary'],
  jobs: ['career', 'employment', 'salary'],
  salary: ['salary', 'income', 'compensation'],
};

// After stripping -ed/-ing, English doubles the final consonant: "deferred" ->
// "deferr", "planned" -> "plann", "running" -> "runn". Without this, a question
// about being "deferred" indexed as `deferr` while the document tag "defer"
// indexed as `defer`, so they never matched and the correct answer was
// unreachable. Standard Porter behaviour; l/s/z are legitimately doubled.
function undouble(w) {
  const n = w.length;
  if (n > 2 && w[n - 1] === w[n - 2] && !'lsz'.includes(w[n - 1])) return w.slice(0, -1);
  return w;
}

// Light suffix stripping. Deliberately conservative — an aggressive stemmer
// collapses "engineering"/"engineer" fine but also mangles proper nouns.
function stem(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s') && !word.endsWith('us')) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length > 5) return undouble(word.slice(0, -3));
  if (word.endsWith('edly')) return word.slice(0, -4);
  if (word.endsWith('ed') && word.length > 4) return undouble(word.slice(0, -2));
  // No -ly rule. It is meant for adverbs but has no way to tell them from
  // ordinary words ending in the same letters: it turned "apply" into "app"
  // while "applying" became "apply", so the two never matched, and "early"
  // became "ear". Adverbs carry little topical signal, so dropping the rule
  // costs nothing measurable — verified against the gold set in evalRetrieval.js.
  return word;
}

function tokenize(text) {
  if (!text) return [];
  const raw = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .split(' ')
    .filter(Boolean);

  const out = [];
  for (const w of raw) {
    if (STOPWORDS.has(w)) continue;
    if (w.length < 2) continue;
    const expansions = SYNONYMS[w];
    if (expansions) for (const e of expansions) out.push(stem(e));
    const st = stem(w);
    // Stop-listing runs on the stem as well as the raw word, otherwise only the
    // exact listed form is removed: "happens" survived a list containing
    // "happen" and went on to outrank domain terms on IDF alone.
    if (STOPWORDS.has(st)) continue;
    out.push(st);
  }
  return out;
}


/**
 * Adjacent token pairs, joined with a separator that cannot occur in a token.
 *
 * Unigrams alone cannot tell "personal statement" from a document that merely
 * mentions "personal" and "statement" apart — which is why a question about the
 * personal statement retrieved timeline tasks instead of essay guidance. Pairs
 * are rare, so IDF gives them weight automatically; no hand-set boost needed.
 */
function bigrams(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i] + '~' + tokens[i + 1]);
  return out;
}

module.exports = { tokenize, bigrams, stem, STOPWORDS, SYNONYMS };
