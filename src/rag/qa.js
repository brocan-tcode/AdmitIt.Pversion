// src/rag/qa.js
// Retrieval-based question answering for /api/improve.
//
// There is no generator here, so the answer is assembled from the highest
// scoring passages plus profile-grounded framing. That is a real constraint,
// not a hidden one: the answer says what it retrieved and names its sources.

const { index } = require('./corpus');
const { buildContext, fill, money } = require('./context');
const { runAnalysis, calculateRigorIndex, scoreEC } = require('../matchEngine');
const { computeProfileScore } = require('./ragEngine');
const { boostFor } = require('./composer');

// Routes a question toward the topics most likely to hold the answer.
const TOPIC_HINTS = [
  { re: /essay|personal statement|supplement|why us|write|writing|topic|prompt/i, topics: ['essay'] },
  { re: /visa|f-?1|opt|cpt|h-?1b|green card|immigration|sponsor|stay in the us|work permit/i, topics: ['visa', 'career'] },
  { re: /job|career|salary|employer|intern|work after|hire|recruit|compensation/i, topics: ['career'] },
  { re: /\bed\b|early decision|early action|\brea\b|\brd\b|round|deadline|when should i apply|uc |questbridge|defer|waitlist|wait list|withdraw/i, topics: ['round'] },
  { re: /timeline|when do i|schedule|month|plan my year|junior year|senior year/i, topics: ['timeline'] },
  { re: /gap|weakness|weak|missing|improve|what should i fix|hurt/i, topics: ['gap', 'strategy'] },
  { re: /cost|tuition|afford|scholarship|financial aid|need-?blind|money|expensive/i, topics: ['strategy', 'country', 'school'] },
  { re: /chance|odds|get in|admit|acceptance|realistic|reach|safety/i, topics: ['profile', 'school', 'strategy'] },
  { re: /which school|what school|compare|better|recommend a school|campus|location/i, topics: ['school'] },
  { re: /country|china|india|korea|international student|competition/i, topics: ['country', 'strategy'] },
];

function pickTopics(question) {
  const topics = new Set();
  for (const h of TOPIC_HINTS) if (h.re.test(question)) h.topics.forEach(t => topics.add(t));
  return topics.size ? [...topics] : null; // null = search everything
}

// ── Named-school lookup ──────────────────────────────────────
// BM25 alone under-ranks a school named in the question, because a short name
// contributes one term against a query full of topic words. A direct name
// match should always win, so schools are resolved by name before retrieval.
const GENERIC_NAME_WORDS = new Set([
  'university', 'college', 'institute', 'technology', 'school', 'state',
  'of', 'the', 'at', 'and', 'in', 'system', 'main', 'campus',
]);

const SCHOOL_LOOKUP = (() => {
  const map = new Map(); // distinctive token -> [docId]
  for (const doc of index.all(d => d.topic === 'school')) {
    const words = String(doc.title).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/);
    for (const w of words) {
      if (!w || w.length < 2 || GENERIC_NAME_WORDS.has(w)) continue;
      if (!map.has(w)) map.set(w, []);
      map.get(w).push(doc.id);
    }
  }
  return map;
})();

function namedSchools(question) {
  const qWords = String(question).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/);
  const scores = new Map(); // docId -> number of distinctive words matched
  for (const w of qWords) {
    const ids = SCHOOL_LOOKUP.get(w);
    if (!ids) continue;
    // A word shared by many schools ("california", "new") is weak evidence.
    const weight = 1 / ids.length;
    for (const id of ids) scores.set(id, (scores.get(id) || 0) + weight);
  }
  const ranked = [...scores.entries()]
    .filter(([, s]) => s >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => index.all(d => d.id === id)[0])
    .filter(Boolean);
  return ranked;
}

/**
 * @param {string} question
 * @param {object} profile
 * @param {object} engineData  optional pre-computed analysis from the client
 */
function answer(question, profile = {}, engineData = {}) {
  const q = String(question || '').trim();
  if (!q) return { success: false, error: 'No question provided.' };

  const analysis   = runAnalysis(profile);
  const rigorIndex = calculateRigorIndex(profile);
  const ecScore    = scoreEC(profile.activities);
  const profileScore = engineData.profileScore || computeProfileScore(profile, rigorIndex, ecScore);
  const ctx = buildContext(profile, analysis, { profileScore, rigorIndex, ecScore });

  const topics = pickTopics(q);

  // The question is matched on its own words. Appending the student's major,
  // country and strength band to the query string used to swamp it: "what
  // happens if I get deferred" carries one meaningful token, so three profile
  // words outranked it and the answer came back about CS portfolios. The
  // profile still personalises results, but through `boost` — which scales
  // documents already matching the question — not by adding query terms that
  // compete with it.
  const expanded = q;

  // Intent boosts: when the question is explicitly about an attribute the
  // school database records, rank on that attribute rather than on word overlap
  // (every school document contains the phrase "financial aid").
  const wantsNeedBlind = /need-?blind|full need|meets? full|free tuition/i.test(q);
  const wantsCheap     = /afford|cheap|low cost|budget|least expensive|scholarship/i.test(q);
  const baseBoost = boostFor(ctx);
  const intentBoost = doc => {
    let m = baseBoost(doc);
    if (doc.topic !== 'school') return m;
    if (wantsNeedBlind) m *= doc.meta?.needBlind ? 2.5 : 0.3;
    if (wantsCheap && doc.meta?.needBlind) m *= 1.4;
    return m;
  };

  const hits = index.searchDiverse(expanded, {
    k: 4,
    topic: topics,
    filter: doc => (typeof doc.cond === 'function' ? safeCond(doc, ctx) : true),
    boost: intentBoost,
  });

  // Fall back to an unrestricted search if the topic routing was too narrow.
  let finalHits = hits.length ? hits : index.searchDiverse(expanded, {
    k: 4, boost: intentBoost,
    filter: doc => (typeof doc.cond === 'function' ? safeCond(doc, ctx) : true),
  });

  // A school named outright in the question goes first, ahead of ranking.
  const named = namedSchools(q);
  if (named.length) {
    const namedIds = new Set(named.map(d => d.id));
    finalHits = [
      ...named.map(doc => ({ doc, score: 999, rawScore: 999, boost: 1, matched: [] })),
      ...finalHits.filter(h => !namedIds.has(h.doc.id)),
    ].slice(0, 5);
  }

  if (!finalHits.length) {
    return {
      success: true,
      answer: `Nothing in the local knowledge base matches that question closely enough to answer it honestly. ` +
        `This build runs entirely on a ${index.size}-document local corpus with no model behind it, so it can only answer ` +
        `what it has documents for: admissions strategy, gaps, essays, application rounds, timelines, careers, visas, and the ${100} schools in the database. ` +
        `Try rephrasing toward one of those.`,
      sources: [],
    };
  }

  const parts = [];

  // Ground the answer in this student's numbers first.
  parts.push(profileLine(ctx, q));

  for (const h of finalHits) {
    const body = fill(h.doc.text, ctx);
    parts.push(h.doc.topic === 'school'
      ? `${h.doc.title}: ${body}`
      : body);
  }

  const sources = finalHits.map(h => ({
    id: h.doc.id, topic: h.doc.topic, title: h.doc.title,
    score: Math.round(h.score * 100) / 100,
  }));

  parts.push(`Sources retrieved from the local corpus: ${sources.map(s => s.title).join('; ')}.`);

  return { success: true, answer: parts.join('\n\n'), sources };
}

function safeCond(doc, ctx) {
  try { return doc.cond(ctx); } catch { return false; }
}

function profileLine(ctx, question) {
  const bits = [];
  if (ctx.gpa) bits.push(`GPA ${ctx.gpa.toFixed(2)}`);
  if (ctx.satEq) bits.push(ctx.sat ? `SAT ${ctx.sat}` : `ACT ${ctx.act}`);
  if (ctx.toefl) bits.push(`TOEFL ${ctx.toefl}`);
  else if (ctx.ielts) bits.push(`IELTS ${ctx.ielts}`);
  bits.push(`rigour ${ctx.rigorIndex.toFixed(1)}/10`);
  bits.push(`EC impact ${ctx.ecScore.toFixed(1)}/20`);

  const topReach = ctx.reaches[0];
  const topMatch = ctx.matches[0] || ctx.matchReaches[0];

  let line = `Answering against your actual profile — ${ctx.majorLabel}` +
    `${ctx.countryName ? ` applicant from ${ctx.countryName}` : ''}, ${bits.join(', ')}, ` +
    `overall ${ctx.profileScore}/100.`;

  if (topReach && topMatch) {
    line += ` The database currently places you at ${topReach.probability}% for ${ctx.shortName(topReach.college)} ` +
      `and ${topMatch.probability}% for ${ctx.shortName(topMatch.college)}.`;
  }
  if (/cost|afford|tuition|money|financial/i.test(question)) {
    line += ` Median cost across your matched list is ${money(ctx.oneYearCost)} per year.`;
  }
  return line;
}

module.exports = { answer, pickTopics, namedSchools };
