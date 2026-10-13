// src/rag/evalRetrieval.js
// Retrieval quality measurement.  Run: node src/rag/evalRetrieval.js
//
// Until this existed, the claim "retrieval works" rested on eyeballing a few
// queries. It measures three things that matter for a retrieval system:
//
//   1. RELEVANCE   — for a gold set of questions with known-correct documents,
//                    precision@k, recall@k and mean reciprocal rank.
//   2. COVERAGE    — what share of the corpus can ever reach a user. Content
//                    that is never retrieved is content nobody wrote for.
//   3. ROBUSTNESS  — does a paraphrase of the same question still find the same
//                    document? This is where lexical retrieval is weakest.
//
// The gold set is deliberately written as "which document SHOULD answer this",
// not "which document does BM25 return", so it can fail.

const { index } = require('./corpus');
const { buildContext } = require('./context');
const { runAnalysis, calculateRigorIndex, scoreEC } = require('../matchEngine');
const { computeProfileScore } = require('./ragEngine');
const { boostFor } = require('./composer');

// A representative student, so `cond` gates behave as they would in production.
const STUDENT = {
  grade: '12', gpa: '3.6', sat: '1380', toefl: '98', major: 'Computer Science',
  country: 'China', totalAPsOffered: '16', apCount: '6',
  activities: [{ type: 'Club Officer / Editor', leadership: 'Officer / Vice President', years: 2 }],
};

function contextFor(profile) {
  const analysis = runAnalysis(profile);
  const rigorIndex = calculateRigorIndex(profile);
  const ecScore = scoreEC(profile.activities);
  const profileScore = computeProfileScore(profile, rigorIndex, ecScore);
  return buildContext(profile, analysis, { profileScore, rigorIndex, ecScore }, new Date('2026-08-02'));
}

// Each entry: a question a student would actually ask, and the document ids that
// genuinely answer it. Multiple ids means any of them is a correct hit.
const GOLD = [
  { q: 'should I apply early decision or early action',        want: ['round-ed-boost', 'round-ea', 'round-ed-financial'] },
  { q: 'is early decision binding',                            want: ['round-ed-boost', 'round-ed-financial'] },
  { q: 'what happens if I get deferred',                       want: ['round-deferral'] },
  { q: 'how does the waitlist work',                           want: ['round-waitlist'] },
  { q: 'when do I apply to the University of California',      want: ['round-uc', 'round-uc-intl'] },
  { q: 'can I use QuestBridge as an international student',    want: ['round-questbridge'] },

  { q: 'how long can I work in the US after I graduate',       want: ['visa-opt-stem', 'visa-opt-standard', 'career-opt-stem', 'career-opt-nonstem'] },
  { q: 'what are my chances in the H1B lottery',               want: ['visa-h1b', 'career-h1b-odds'] },
  { q: 'what documents do I need for the F1 interview',        want: ['visa-f1-documents', 'visa-f1-process'] },
  { q: 'can I get a green card without an employer',           want: ['visa-eb2niw'] },
  { q: 'will an internship hurt my OPT',                       want: ['visa-cpt', 'career-cpt-rules'] },

  { q: 'what should I write my personal statement about',      want: ['essay-theme-technical', 'essay-theme-curiosity', 'essay-angle-failure', 'essay-angle-object'] },
  { q: 'how do I write the why us supplement',                 want: ['essay-whyus-research'] },
  { q: 'what essay topics should I avoid',                     want: ['essay-avoid-cs-origin', 'essay-avoid-achievement-list', 'essay-avoid-country-narrative', 'essay-avoid-overpolish'] },
  { q: 'how many drafts should I write',                       want: ['essay-craft-revision'] },

  { q: 'my SAT is below the range, should I retake it',        want: ['strat-sat-retake-hard', 'strat-sat-retake-soft'] },
  { q: 'is my TOEFL score high enough',                        want: ['strat-toefl-raise', 'gap-impact-english'] },
  { q: 'I have no leadership positions',                       want: ['strat-ec-leadership', 'gap-impact-leadership'] },
  { q: 'how do I find research as a high school student',      want: ['strat-research-start'] },
  { q: 'which schools give aid to international students',     want: ['strat-need-aware', 'country-aid-reality', 'gap-impact-financial'] },
  { q: 'do colleges track whether I visit',                    want: ['strat-demonstrated-interest'] },
  { q: 'how do I ask for recommendation letters',              want: ['strat-recommenders', 'gap-impact-recommendation'] },
  { q: 'should I do a summer program',                         want: ['strat-summer-program'] },

  { q: 'what jobs can I get with a computer science degree',   want: ['career-recruiting-timing', 'career-sponsorship-reality', 'career-salary-context'] },
  { q: 'is a masters degree worth it',                         want: ['career-grad-school'] },
  { q: 'how competitive is my country pool',                   want: ['country-pool-veryhigh', 'country-pool-high', 'strat-country-competition'] },
];

// Paraphrases of gold questions — same information need, different words.
const PARAPHRASE = [
  { a: 'should I apply early decision or early action', b: 'is it better to apply binding early or non binding early' },
  { a: 'how long can I work in the US after I graduate', b: 'post graduation work permit duration for international students' },
  { a: 'what documents do I need for the F1 interview',  b: 'student visa appointment paperwork checklist' },
  { a: 'my SAT is below the range, should I retake it',  b: 'my test score is under the middle 50 percent band' },
  { a: 'which schools give aid to international students', b: 'need blind colleges for non US citizens' },
  { a: 'what essay topics should I avoid',               b: 'cliche college essay subjects to skip' },
  { a: 'how do I ask for recommendation letters',        b: 'requesting teacher references for applications' },
];

function search(query, ctx, k = 5) {
  return index.searchDiverse(query, {
    k,
    boost: boostFor(ctx),
    filter: doc => {
      if (typeof doc.cond !== 'function') return true;
      try { return doc.cond(ctx); } catch { return false; }
    },
  }).map(h => h.doc.id);
}

function run() {
  const ctx = contextFor(STUDENT);
  const K = 5;

  console.log('\n═══ 1. RELEVANCE — gold set of %d questions, top-%d retrieval\n', GOLD.length, K);
  let hits = 0, rrSum = 0;
  const misses = [];
  for (const g of GOLD) {
    const got = search(g.q, ctx, K);
    const rank = got.findIndex(id => g.want.includes(id));
    if (rank >= 0) { hits++; rrSum += 1 / (rank + 1); }
    else misses.push({ q: g.q, want: g.want, got: got.slice(0, 3) });
    const mark = rank === 0 ? 'ok  ' : rank > 0 ? `#${rank + 1}  ` : 'MISS';
    console.log(`  ${mark} ${g.q}`);
    if (rank !== 0) console.log(`        want ${g.want.slice(0, 2).join(' | ')}   got ${got.slice(0, 2).join(' | ')}`);
  }
  const recall = hits / GOLD.length;
  const mrr = rrSum / GOLD.length;
  console.log(`\n  recall@${K}: ${(recall * 100).toFixed(1)}%   MRR: ${mrr.toFixed(3)}`);

  console.log('\n═══ 2. COVERAGE — share of the corpus that can reach a user\n');
  const majors = ['Computer Science', 'Nursing', 'Business', 'Music', 'Biology', 'Political Science', 'Mechanical Engineering', 'Architecture'];
  const countries = ['China', 'India', 'Vietnam', 'Brazil', 'Nigeria', 'Japan'];
  const actSets = [
    [],
    [{ type: 'Research Experience', leadership: 'Member / Participant', years: 2 }],
    [{ type: 'International Award / Competition', leadership: 'Founder / President', years: 3 },
     { type: 'School President / Captain / Founder', leadership: 'Founder / President', years: 2 }],
    [{ type: 'Club Officer / Editor', leadership: 'Officer / Vice President', years: 1 },
     { type: 'Community Service', leadership: 'Member / Participant', years: 1 },
     { type: 'Job / Internship', leadership: 'Member / Participant', years: 1 },
     { type: 'Team Member / Club Member', leadership: 'Member / Participant', years: 2 },
     { type: 'Community Service', leadership: 'Member / Participant', years: 1 }],
  ];
  // Destination is folded into `extras` rather than added as its own loop
  // dimension, which would multiply the sweep. Without it every simulated
  // student defaults to a US destination and the destination-gated documents
  // (Australian/UK/Canadian/Asian application and visa routes) are unreachable
  // by construction — they were reported as dead content when they were simply
  // never asked for.
  const extras = [
    { toefl: '88' },
    { toefl: '112', ibProgram: true, research: 'Two years in a genetics lab with a poster', awards: 'National olympiad gold' },
    { ielts: '6.5', budgetMax: '30000' },
    { toefl: '100', destination: 'australia' },
    { toefl: '100', destination: 'uk' },
    { toefl: '100', destination: 'canada' },
    { toefl: '100', destination: 'asia' },
  ];

  const { analyze } = require('./ragEngine');
  const used = new Set();
  let n = 0;
  for (const m of majors) for (const c of countries) for (const gpa of ['2.7', '3.3', '3.9'])
    for (const a of actSets) for (const e of extras) for (const grade of ['11', '12']) {
      const r = analyze({
        grade, gpa, sat: String(1050 + Math.round((parseFloat(gpa) - 2.7) * 380)),
        major: m, country: c, totalAPsOffered: '15', apCount: gpa === '3.9' ? '13' : '3',
        activities: a, ...e,
      }, { now: new Date('2026-08-02') });
      r.rag.documents.forEach(d => used.add(d.id));
      n++;
    }

  const knowledge = index.all(d => d.topic !== 'school');
  const unreached = knowledge.filter(d => !used.has(d.id));
  const cov = (knowledge.length - unreached.length) / knowledge.length;
  console.log(`  profiles simulated: ${n}`);
  console.log(`  knowledge documents reached: ${knowledge.length - unreached.length}/${knowledge.length} = ${(cov * 100).toFixed(1)}%`);
  let cls = { gatedCount: 0, crowdedCount: 0 };
  if (unreached.length) {
    // A document that never appears is not automatically a bug. Split the two
    // causes, because only one of them is fixable in the composer:
    //   GATED    - its cond() never passed for any profile in the sweep, so it
    //              is reserved for a student this sweep did not simulate.
    //   CROWDED  - it was eligible for real students but a fixed slot count
    //              meant it could never be selected. That is dead content.
    // Eligibility must be judged against the SAME profiles the coverage sweep
    // ran. Using a wider set reported documents as dead when they were simply
    // gated off for every student actually simulated — `strat-english-waiver`
    // needs an applicant with neither TOEFL nor IELTS, which the sweep never
    // generates, so it was blamed on the composer rather than the sweep.
    const ctxs = [];
    for (const m of majors) for (const c of countries) for (const gpa of ['2.7', '3.3', '3.9'])
      for (const a of actSets) for (const e of extras) for (const grade of ['11', '12'])
        ctxs.push(contextFor({
          grade, gpa, sat: String(1050 + Math.round((parseFloat(gpa) - 2.7) * 380)),
          major: m, country: c, totalAPsOffered: '15', apCount: gpa === '3.9' ? '13' : '3',
          activities: a, ...e,
        }));

    const gated = [], crowded = [];
    for (const d of unreached) {
      const everEligible = typeof d.cond !== 'function' ||
        ctxs.some(c => { try { return d.cond(c); } catch { return false; } });
      (everEligible ? crowded : gated).push(d);
    }
    console.log(`  never reached: ${unreached.length}`);
    console.log(`    gated  (cond never satisfied in sweep, reserved for other students): ${gated.length}`);
    console.log(`    crowded (eligible but structurally unselectable — dead content):    ${crowded.length}`);
    crowded.slice(0, 10).forEach(d => console.log(`       ${d.topic}:${d.id}`));
    cls = { gatedCount: gated.length, crowdedCount: crowded.length };
  }

  console.log('\n═══ 3. ROBUSTNESS — does a paraphrase find the same document?\n');
  let agree = 0;
  for (const p of PARAPHRASE) {
    const A = search(p.a, ctx, K), B = search(p.b, ctx, K);
    const overlap = A.filter(id => B.includes(id)).length;
    if (overlap > 0) agree++;
    console.log(`  ${overlap > 0 ? 'ok  ' : 'MISS'} "${p.b}"  (${overlap}/${K} shared)`);
  }
  const robust = agree / PARAPHRASE.length;
  console.log(`\n  paraphrase agreement: ${(robust * 100).toFixed(1)}%`);

  console.log('\n═══ SUMMARY');
  console.log(`  relevance recall@${K} ${(recall * 100).toFixed(1)}%  |  MRR ${mrr.toFixed(3)}  |  coverage ${(cov * 100).toFixed(1)}%  |  paraphrase ${(robust * 100).toFixed(1)}%`);
  console.log(`  dead content (eligible but unselectable): ${cls.crowdedCount} document(s)\n`);

  return { recall, mrr, coverage: cov, robustness: robust,
           crowded: cls.crowdedCount, gated: cls.gatedCount,
           unreached: unreached.map(d => d.id), misses };
}

if (require.main === module) run();
module.exports = { run, GOLD, PARAPHRASE, search, contextFor, STUDENT };
