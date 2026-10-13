// src/rag/composer.js
// Turns retrieved documents into the eight text sections the frontend and the
// PDF exporter expect. This is the "generation" half of RAG — but it is
// deterministic template composition over retrieved passages rather than a
// language model, so the same profile always produces the same report and
// every sentence is traceable to a document id.
//
// Output formats are dictated by the parsers in public/index.html and
// src/pdfExport.js — parseBullets, parseTimeline, parseSalaries,
// parseAppStrategy. Changing a format here breaks rendering in both places.

const { fill, money, joinList } = require('./context');
const { SALARY_TABLE, EMPLOYERS } = require('./knowledge/careers');
const { medianEarnings } = require('../data/fitMetrics');
const { OUTCOMES } = require('../data/outcomes');

// Median measured earnings across the database, used as the reference point for
// relative salary scaling.
const DB_MEDIAN_EARNINGS = (() => {
  const e = Object.values(OUTCOMES).map(o => o.earnings10).filter(Boolean).sort((a, b) => a - b);
  return e.length ? e[Math.floor(e.length / 2)] : 85000;
})();

// ─────────────────────────────────────────────────────────────
// Retrieval helpers
// ─────────────────────────────────────────────────────────────

/** Metadata boost — nudges docs that match this student's specifics. */
function boostFor(ctx) {
  const majorWords = new Set(
    [ctx.majorKey, ...String(ctx.majorLabel).toLowerCase().split(/\s+/)].filter(Boolean)
  );
  return doc => {
    let m = 1;
    const tags = (doc.tags || []).map(t => String(t).toLowerCase());
    if (tags.some(t => majorWords.has(t))) m *= 1.30;
    if (doc.band && doc.band === ctx.strengthBand) m *= 1.45;
    if (doc.band === 'any') m *= 1.05;
    if (doc.meta && doc.meta.majors && doc.meta.majors.some(x => majorWords.has(String(x).toLowerCase()))) m *= 1.15;
    return m;
  };
}

function safeCond(doc, ctx) {
  try { return doc.cond(ctx); } catch { return false; }
}

/**
 * The single eligibility rule for every retrieval path in this file.
 *
 * It exists as one function because it did not used to: `retrieve()` checked
 * the admissions system, but `fillRemaining()` and the timeline top-up called
 * index.all() with their own predicates and checked only `cond`. The result was
 * that a student applying solely to Australian universities still had the US
 * deadline calendar, the I-20/SEVIS steps and the H-1B lottery topped up into
 * their report. Anything that selects documents must go through here.
 */
function isEligible(doc, ctx) {
  // A document tied to one admissions system is only eligible when that system
  // is actually on the student's list.
  if (doc.system === 'us' && !ctx.hasUSSchools) return false;
  if (doc.system && doc.system !== 'us' && !ctx.hasDestination(doc.system)) return false;
  if (typeof doc.cond === 'function') return safeCond(doc, ctx);
  return true;
}

function retrieve(index, query, ctx, opts = {}) {
  return index.searchDiverse(query, {
    k: opts.k || 3,
    topic: opts.topic,
    filter: doc => {
      if (opts.filter && !opts.filter(doc)) return false;
      return isEligible(doc, ctx);
    },
    boost: boostFor(ctx),
  });
}

/**
 * Runs a prioritised list of queries and collects unique documents in order.
 * This is what gives each section its shape: the query list encodes what a
 * counsellor would look up for this specific student, in priority order.
 */
function retrieveSequence(index, ctx, queries, opts = {}) {
  const picked = [];
  const seen = new Set(opts.exclude || []);
  for (const q of queries) {
    if (picked.length >= (opts.limit || 8)) break;
    const hits = retrieve(index, q.q, ctx, { topic: q.topic || opts.topic, k: 4 });
    for (const h of hits) {
      if (seen.has(h.doc.id)) continue;
      seen.add(h.doc.id);
      picked.push({ ...h, query: q.q });
      break; // one document per query keeps the section varied
    }
  }
  return picked;
}

function sourcesOf(hits) {
  return hits.map(h => ({
    id: h.doc.id,
    topic: h.doc.topic,
    title: h.doc.title,
    score: Math.round(h.score * 100) / 100,
  }));
}

/** `- Title` on one line, body on the next — the shape parseBullets wants. */
function bullet(title, body) {
  return `- ${title}\n${body}`;
}


/**
 * Fills remaining slots from eligible documents the priority queries did not
 * reach, so curated content is not permanently dark.
 *
 * Sections build a priority-ordered query list and take one document per query
 * up to a cap. Documents whose `cond` is always true — process advice like
 * verifying portals or briefing recommenders — sit at the tail of that list and
 * were therefore never selected for anybody: 36 of 164 knowledge documents,
 * 22% of the corpus, could not appear in any report.
 *
 * Selection stays deterministic for a given student (same profile, same
 * report), but the starting offset is derived from the profile so that
 * different students surface different tail content and the corpus is covered
 * across the population rather than within one report.
 */
function fillRemaining(index, ctx, topic, picked, n, seedQuery) {
  if (n <= 0) return [];
  const taken = new Set(picked.map(h => h.doc.id));

  const pool = index.all(d =>
    d.topic === topic &&
    !taken.has(d.id) &&
    isEligible(d, ctx)
  );
  if (!pool.length) return [];

  // Rank by relevance to the student, then rotate the starting point.
  //
  // The pool is APPENDED to the ranked list rather than replaced by it. Taking
  // `ranked` alone whenever it was non-empty silently dropped every document
  // the seed query happened not to match — 22 of 39 strategy documents — so
  // content like "get your school context on the record" stayed unreachable
  // even after the rotation was added. Ranking decides the order; the pool
  // guarantees nothing is excluded from it.
  const ranked = retrieve(index, seedQuery, ctx, { topic, k: pool.length })
    .filter(h => !taken.has(h.doc.id))
    .map(h => h.doc);
  const rankedIds = new Set(ranked.map(d => d.id));
  const ordered = [...ranked, ...pool.filter(d => !rankedIds.has(d.id))];

  const seed = `${ctx.majorKey}|${ctx.countryName}|${ctx.grade}|${ctx.strengthBand}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const start = ordered.length ? hash % ordered.length : 0;

  const out = [];
  for (let i = 0; i < ordered.length && out.length < n; i++) {
    const doc = ordered[(start + i) % ordered.length];
    if (taken.has(doc.id)) continue;
    taken.add(doc.id);
    out.push({ doc, score: 0, rawScore: 0, boost: 1, matched: [] });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 1. PROFILE STRENGTH  (plain prose)
// ─────────────────────────────────────────────────────────────
function composeProfileStrength(index, ctx) {
  const bandHit = retrieve(index, `${ctx.strengthBand} profile assessment competitive band`, ctx, {
    topic: 'profile', k: 3, filter: d => d.band === ctx.strengthBand,
  })[0];

  // Supporting observations, chosen by what is actually notable about THIS
  // student rather than by a fixed query string.
  //
  // With one slot and a generic query, the same document won every time: six
  // `band: 'any'` documents competed and the extracurricular ones always
  // matched the generic wording best. A student with a 3.85 GPA and a 1150 SAT
  // was told their activity record was doing real work, and never that their
  // test score was the thing blocking them — the report praised the strong axis
  // and stayed silent on the weak one. Two slots, and a query built from the
  // student's own extremes, so the dominant signal is the one that surfaces.
  const axes = [];
  if (ctx.satEq && ctx.topReach) {
    if (ctx.satEq < ctx.reachSat25) axes.push('test score below band gap retake largest fixable');
    else if (ctx.satEq >= ctx.reachSat75) axes.push('test score above percentile strong removes screen');
  }
  if (ctx.rigorIndex < 5.5) axes.push('course rigour under-built avoidance available');
  else if (ctx.rigorIndex >= 7.5) axes.push('course rigour strength hardest path transcript');
  if (ctx.ecScore < 8) axes.push('extracurricular limiting factor academics-only thin');
  else if (ctx.ecScore >= 12) axes.push('extracurricular record strong advocate committee');

  const detailQuery = axes.length
    ? axes.join(' ')
    : 'extracurricular rigor test score strength weakness limiting factor';

  const detailHits = retrieve(index, detailQuery, ctx, {
    topic: 'profile', k: 2, filter: d => d.band === 'any',
  });

  const countryHit = retrieve(index, `${ctx.countryName} applicant pool competition regional`, ctx, {
    topic: 'country', k: 2,
  })[0];
  // Six country documents competed for a single slot filled by one fixed query,
  // so transcript context, aid reality and the English-comparability note were
  // unreachable. Rotate a second one in per student.
  const countryExtra = fillRemaining(index, ctx, 'country',
    countryHit ? [countryHit] : [], 1,
    `${ctx.countryName} transcript grading aid English comparability international`)[0];

  const testPhrase = ctx.satEq
    ? (ctx.sat ? `an SAT of ${ctx.sat}` : `an ACT of ${ctx.act}`)
    : 'no standardised test score submitted';
  const englishPhrase = ctx.toefl ? `, TOEFL ${ctx.toefl}` : ctx.ielts ? `, IELTS ${ctx.ielts}` : '';

  const opening = `You are applying to ${ctx.majorLabel} programmes` +
    `${ctx.countryName ? ` from ${ctx.countryName}` : ''} with a ${ctx.gpa ? ctx.gpa.toFixed(2) : 'unreported'} GPA, ` +
    `${testPhrase}${englishPhrase}, a course-rigour index of ${ctx.rigorIndex.toFixed(1)}/10 and an extracurricular ` +
    `impact score of ${ctx.ecScore.toFixed(1)}/20 — an overall profile score of ${ctx.profileScore}/100.`;

  const parts = [opening];
  const hits = [];

  // Stated deliberately before the academic assessment: if none of these schools
  // is payable, how competitive the profile is comes second. Handled here rather
  // than through retrieval so it can never be ranked out of the section.
  if (ctx.budgetInfeasible) {
    parts.push(`Before anything else about the profile — no school in this database fits a budget of ` +
      `${ctx.vars.budgetMaxLabel} per year. The cheapest option it holds costs ${ctx.vars.cheapestCost} all-in, ` +
      `so the ${ctx.schoolCount} schools below are shown for reference, not as affordable choices. ` +
      `The affordable half of your list has to come from community-college transfer pathways, low-tuition ` +
      `public universities, and schools that publish automatic full-tuition merit awards.`);
  }

  if (bandHit) { parts.push(fill(bandHit.doc.text, ctx)); hits.push(bandHit); }
  for (const h of detailHits) { parts.push(fill(h.doc.text, ctx)); hits.push(h); }
  if (countryHit) { parts.push(fill(countryHit.doc.text, ctx)); hits.push(countryHit); }
  if (countryExtra) { parts.push(fill(countryExtra.doc.text, ctx)); hits.push(countryExtra); }

  // Close on the actual modelled numbers rather than an adjective.
  const r = ctx.reaches[0], m = ctx.matches[0] || ctx.matchReaches[0], s = ctx.safeties[0] || ctx.matchSafeties[0];
  const odds = [];
  if (r) odds.push(`${ctx.shortName(r.college)} at ${r.probability}%`);
  if (m) odds.push(`${ctx.shortName(m.college)} at ${m.probability}%`);
  if (s) odds.push(`${ctx.shortName(s.college)} at ${s.probability}%`);
  if (odds.length) {
    parts.push(`Against the ${ctx.schoolCount} schools matched from the database, the model puts you at ${joinList(odds)} — ` +
      `these are modelled estimates from published admit bands, not predictions of a decision.`);
  }

  return { text: parts.join(' '), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 2. AI STRATEGY  (bulleted action items)
// ─────────────────────────────────────────────────────────────
function composeStrategy(index, ctx) {
  // Query list is built from this student's actual weaknesses, in the order a
  // counsellor would prioritise them.
  const queries = [];

  // Highest priority when the list has no safe option: the student needs a
  // wider list far more than another profile-polishing tip.
  // Nothing else matters if the student cannot pay for any of it.
  if (ctx.budgetInfeasible) {
    queries.push({ q: 'budget below database cheapest transfer community college low tuition' });
    queries.push({ q: 'merit scholarship full tuition automatic award budget' });
  }

  if (ctx.belowCorpusRange) {
    queries.push({ q: 'broaden list realistic accessible options outside range safety' });
    queries.push({ q: 'assured guaranteed automatic admission threshold public university' });
    queries.push({ q: 'direct admissions Common App offer without application' });
    queries.push({ q: 'transfer community college pathway articulation two plus two' });
    queries.push({ q: 'rolling admission apply early space available' });
  }

  if (ctx.needsTestRetake)
    queries.push({ q: 'retake SAT ACT target score band below median testing' });
  if ((ctx.toefl > 0 && ctx.toefl < 105) || (ctx.ielts > 0 && ctx.ielts < 7.5) || (!ctx.toefl && !ctx.ielts))
    queries.push({ q: 'TOEFL IELTS English proficiency score waiver requirement' });
  if (ctx.rigorIndex < 7)
    queries.push({ q: 'course rigour AP IB senior schedule curriculum available' });
  if (!ctx.hasLeadership)
    queries.push({ q: 'leadership role founder president club initiative' });
  if (!ctx.hasNationalAward)
    queries.push({ q: 'national competition award olympiad external recognition' });
  if (ctx.hasAwards)
    queries.push({ q: 'award selectivity context honors section explain' });
  if (!ctx.hasResearch && ctx.isResearchMajor)
    queries.push({ q: 'research professor lab mentored project cold email' });
  if (ctx.hasResearch)
    queries.push({ q: 'research publication preprint output poster citable' });
  if (ctx.activityCount >= 5 && ctx.ecScore < 12)
    queries.push({ q: 'activity depth spike focus fewer activities' });
  if (ctx.activityCount < 4)
    queries.push({ q: 'thin activity record build activities start' });

  // Major, country, money, and process items every student needs.
  queries.push({ q: `${ctx.majorLabel} ${ctx.majorKey} project portfolio evidence major competition` });
  queries.push({ q: `direct admit ${ctx.majorLabel} impacted major internal transfer` });
  if (ctx.isHighCompetitionCountry)
    queries.push({ q: `${ctx.countryName} applicant pool differentiate regional competition` });
  queries.push({ q: 'need blind need aware financial aid international odds' });
  queries.push({ q: 'recommendation letters teachers brief brag sheet' });
  queries.push({ q: 'safety schools list balance affordable realistic' });
  queries.push({ q: 'alumni interview demonstrated interest tracking' });
  queries.push({ q: 'supplemental essays workload planning time budget' });
  queries.push({ q: 'financial certification I-20 bank documents' });
  queries.push({ q: 'portal verification submitted documents incomplete' });
  queries.push({ q: 'deferral letter of continued interest waitlist' });

  const PRIORITY_SLOTS = 6, TOTAL_SLOTS = 8;
  const hits = retrieveSequence(index, ctx, queries, { topic: 'strategy', limit: PRIORITY_SLOTS });
  hits.push(...fillRemaining(index, ctx, 'strategy', hits, TOTAL_SLOTS - hits.length,
    `${ctx.majorLabel} ${ctx.countryName} application process planning deadlines interest letters`));

  const lines = hits.map(h => bullet(fill(h.doc.title, ctx), fill(h.doc.text, ctx)));
  return { text: lines.join('\n'), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 3. GAP ANALYSIS  (GAP / IMPACT / FIX)
// ─────────────────────────────────────────────────────────────

/** Whole months from today to November 1 of the application year. */
function monthsUntilDeadline(ctx) {
  const deadline = new Date(ctx.applyYear, 10, 1);
  const months = (deadline.getFullYear() - ctx.now.getFullYear()) * 12 +
                 (deadline.getMonth() - ctx.now.getMonth());
  return Math.max(0, months);
}

function composeGapAnalysis(index, ctx) {
  const lines = [];
  const hits  = [];
  const usedCategories = new Set();

  // Affordability outranks everything the numeric engine finds: if no school on
  // the list is payable, the academic gaps below are secondary. Prepended rather
  // than appended so it cannot be pushed off the end by the 7-item cap.
  if (ctx.budgetInfeasible) {
    const hit = retrieve(index, 'budget infeasible cheapest unaffordable cost sticker price', ctx, { topic: 'gap', k: 3 })[0];
    if (hit) hits.push(hit);
    usedCategories.add('Financial');
    lines.push(`- GAP: No school in this database fits a budget of ${ctx.vars.budgetMaxLabel} per year — the cheapest option shown costs ${ctx.vars.cheapestCost} all-in\n` +
      `IMPACT: ${hit ? fill(hit.doc.text, ctx) : ''}\n` +
      `FIX: Build the affordable half of your list from community-college transfer pathways, low-tuition public universities, and schools publishing automatic full-tuition merit awards — then use this report for the ambitious half.`);
  }

  // Engine-detected gaps next — these are measured against the actual
  // target school, so they carry the specific numbers.
  for (const g of ctx.gaps) {
    const hit = retrieve(index, `${g.category} ${g.message} impact admissions`, ctx, { topic: 'gap', k: 3 })[0];
    const impact = hit ? fill(hit.doc.text, ctx) : 'This weakens the file at every school where the applicant pool is stronger than the published averages suggest.';
    if (hit) { hits.push(hit); }
    usedCategories.add(g.category);
    lines.push(`- GAP: ${g.message} (${String(g.severity).toUpperCase()} severity)\nIMPACT: ${impact}\nFIX: ${g.fix}`);
  }

  // Then structural gaps the numeric engine does not detect.
  const extras = [];
  // The most consequential gap a weak profile can have, and the one the numeric
  // engine cannot see: nothing on the list is a safe admit.
  if (ctx.belowCorpusRange) {
    extras.push({ q: 'list balance safety realistic risk reach heavy',
      gap: `No safety school anywhere on this list — your best odds are ${ctx.vars.bestOdds}% at ${ctx.vars.bestOddsSchool}`,
      fix: 'Add six to eight schools from outside this database — regional publics, less selective privates, and schools publishing guaranteed-admission thresholds — before refining anything else.' });
  }
  if (!ctx.hasLeadership && !usedCategories.has('Extracurriculars')) {
    extras.push({ q: 'leadership initiative passive participation extracurricular',
      gap: 'No leadership title or founded initiative anywhere in the activity list',
      fix: 'Take a founding or president role in one activity before applications close, and describe it with a measurable outcome.' });
  }
  if (!ctx.hasNationalAward && !usedCategories.has('Awards')) {
    extras.push({ q: 'external recognition award verification national benchmark',
      gap: 'No externally verified award or national-level distinction',
      fix: `Register for ${ctx.vars.competitionList} — even a qualifying result is an external benchmark.` });
  }
  if (!ctx.hasResearch && ctx.isResearchMajor) {
    extras.push({ q: 'research experience missing STEM depth differentiator',
      gap: `No mentored research on record for a ${ctx.majorLabel} applicant to research universities`,
      fix: 'Cold-email 15 professors or PhD students with a specific paragraph about their published work.' });
  }
  if (ctx.satEq === 0) {
    extras.push({ q: 'test score comparability international screening academic index',
      gap: 'No standardised test score on file, in a pool where test scores are one of only two directly comparable numbers',
      fix: `Sit the SAT or ACT once and decide per school — submit at or above a school's median, withhold below its 25th percentile.` });
  }
  if (ctx.activityCount > 0 && ctx.activityCount < 4) {
    extras.push({ q: 'thin activity record few activities breadth evidence',
      gap: `Only ${ctx.activityCount} substantial ${ctx.activityCount === 1 ? 'activity' : 'activities'} on record against ten available Common App slots`,
      fix: 'Add one or two activities adjacent to your intended field so the record reads as a single story rather than a short list.' });
  }
  if (ctx.activityCount >= 5 && ctx.ecScore < 12) {
    extras.push({ q: 'narrative coherence scattered activity list theme',
      gap: `${ctx.activityCount} activities producing only ${ctx.ecScore.toFixed(1)}/20 of impact — breadth without a through-line`,
      fix: 'Cut to the two strongest activities and escalate responsibility in those rather than adding more.' });
  }
  if (ctx.reaches.length > ctx.matches.length + ctx.safeties.length) {
    extras.push({ q: 'top heavy list balance reach safety realistic',
      gap: 'School list is weighted toward the reach band relative to matches and safeties',
      fix: 'Add two match-band schools you would genuinely attend before adding another reach.' });
  }
  if (!ctx.isSTEM) {
    extras.push({ q: 'visa OPT STEM designation post graduation work authorization',
      gap: `${ctx.majorLabel} is not STEM-designated at most universities, limiting post-study work authorisation to 12 months`,
      fix: 'Check whether each school offers a STEM-designated variant of the degree, and confirm the CIP code before enrolling.' });
  }
  // Skipped when budgetInfeasible already said the same thing more sharply.
  if (ctx.budgetMax > 0 && ctx.oneYearCost > ctx.budgetMax && !ctx.budgetInfeasible) {
    extras.push({ q: 'financial aid need aware international cost budget',
      gap: `Median cost across the matched list is ${money(ctx.oneYearCost)} per year against a stated budget of ${money(ctx.budgetMax)}`,
      fix: 'Weight the list toward need-blind schools and large merit-aid programmes, and model total four-year cost before applying.' });
  }
  if (ctx.needBlind.length <= 1) {
    extras.push({ q: 'financial aid need aware request reduces odds international',
      gap: `Only ${ctx.needBlind.length} school on the matched list is need-blind for international applicants`,
      fix: 'Treat every other application as need-aware — decide per school whether to request aid, and add one or two need-blind or full-need schools to the list.' });
  }
  // The matcher now ranks by major fit, so this fires only when the database
  // genuinely could not find schools that name this major.
  const unverified = ctx.schools.filter(s => s.majorVerified === false).length;
  if (ctx.major && unverified >= Math.max(3, ctx.schools.length * 0.3)) {
    extras.push({ q: 'major fit evidence declared programme availability',
      gap: `${unverified} of the ${ctx.schools.length} matched schools have no recorded ${ctx.majorLabel} programme — the database could not fill every tier with schools known for this major`,
      fix: `Confirm the department exists at each of those schools before applying, and treat the ones flagged as flagship programmes as the core of the list.` });
  }
  if (ctx.isHighCompetitionCountry) {
    extras.push({ q: 'recommendation letters generic thin international school evidence',
      gap: 'Recommendation letters from schools without a US application culture are typically short and generic',
      fix: 'Give each recommender a one-page brief with two or three specific classroom moments eight weeks before the first deadline.' });
  }
  if (ctx.isSenior) {
    extras.push({ q: 'timeline compressed rushed deadlines documents late',
      gap: `Only ${monthsUntilDeadline(ctx)} months remain before early-round deadlines, and school-side documents move slowly from non-US schools`,
      fix: 'Order transcripts and translations now and send test scores at least three weeks before each deadline.' });
  }

  for (const e of extras) {
    if (lines.length >= 7) break;
    const hit = retrieve(index, e.q, ctx, { topic: 'gap', k: 3 })[0];
    if (hit) hits.push(hit);
    const impact = hit ? fill(hit.doc.text, ctx) : '';
    lines.push(`- GAP: ${e.gap}\nIMPACT: ${impact}\nFIX: ${e.fix}`);
  }

  if (!lines.length) {
    lines.push('- GAP: No structural gaps detected against the matched school list\n' +
      'IMPACT: The profile is internally consistent — academics, rigour, and activities all support the same target band.\n' +
      'FIX: Shift remaining effort from profile building to essay quality and school-specific research.');
  }

  return { text: lines.join('\n'), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 4. ESSAY STRATEGY  (bulleted)
// ─────────────────────────────────────────────────────────────
function composeEssayStrategy(index, ctx) {
  const bySlot = slot => d => d.slot === slot;

  const theme = retrieve(index, `${ctx.majorLabel} narrative theme ${ctx.essaySignals?.coreNarrative || 'curiosity'}`, ctx,
    { topic: 'essay', k: 3, filter: bySlot('theme') })[0];

  const angles = retrieve(index, `essay angle opening ${ctx.majorLabel} ${ctx.countryName} specific scene`, ctx,
    { topic: 'essay', k: 2, filter: bySlot('angle') });

  const whyMajor = retrieve(index, `why ${ctx.majorLabel} ${ctx.majorKey} supplement specific`, ctx,
    { topic: 'essay', k: 2, filter: bySlot('whymajor') });

  const avoid = retrieve(index, `avoid cliche ${ctx.countryAdj} ${ctx.majorLabel} common mistakes`, ctx,
    { topic: 'essay', k: 2, filter: bySlot('avoid') });

  const craft = retrieve(index, 'opening revision supplement sequencing craft', ctx,
    { topic: 'essay', k: 1, filter: bySlot('craft') });

  let hits = [theme, ...angles, ...whyMajor, ...avoid, ...craft].filter(Boolean);
  // Seven essay documents — alternative angles, craft advice — were never
  // reachable because each slot is filled by a fixed query. Rotate one extra
  // angle and one extra craft note in per student.
  const extraAngle = fillRemaining(index, ctx, 'essay', hits, 1,
    `${ctx.majorLabel} essay angle opening story ${ctx.countryName}`)
    .filter(h => h.doc.slot === 'angle');
  const extraCraft = fillRemaining(index, ctx, 'essay', [...hits, ...extraAngle], 1,
    'essay craft opening revision supplement voice')
    .filter(h => h.doc.slot === 'craft' || h.doc.slot === 'avoid');
  hits = [...hits, ...extraAngle, ...extraCraft];
  const lines = [];

  if (theme) {
    lines.push(bullet(
      `Core narrative theme — ${ctx.essaySignals?.coreNarrative || 'intellectual curiosity and academic depth'}`,
      fill(theme.doc.text, ctx)
    ));
  }
  for (const a of [...angles, ...extraAngle]) lines.push(bullet(fill(a.doc.title, ctx), fill(a.doc.text, ctx)));
  for (const w of whyMajor) lines.push(bullet(fill(w.doc.title, ctx), fill(w.doc.text, ctx)));
  for (const a of avoid) lines.push(bullet(`Avoid — ${fill(a.doc.title, ctx)}`, fill(a.doc.text, ctx)));
  for (const c of [...craft, ...extraCraft]) lines.push(bullet(
    c.doc.slot === 'avoid' ? `Avoid — ${fill(c.doc.title, ctx)}` : fill(c.doc.title, ctx),
    fill(c.doc.text, ctx)));

  return { text: lines.join('\n'), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 5. APPLICATION STRATEGY  (round-labelled lines)
// ─────────────────────────────────────────────────────────────
function composeAppStrategy(index, ctx) {
  const lines = [];
  const hits  = [];

  // Everything below this guard describes the US system — ED/EA/REA, the UC
  // window, QuestBridge. None of it exists in Australia, Canada, the UK, Hong
  // Kong or Singapore, so a list without US schools gets the destination's own
  // application mechanics instead of a translated version of the American ones.
  if (!ctx.hasUSSchools) {
    const roundHits = retrieve(index, 'apply application deadline offer rounds admission process', ctx,
      { topic: 'round', k: 4 });
    for (const h of roundHits) {
      hits.push(h);
      lines.push(bullet(fill(h.doc.title, ctx), fill(h.doc.text, ctx)));
    }
    const byCountry = {};
    for (const s of ctx.schools) {
      const c = s.college.country || 'Other';
      (byCountry[c] = byCountry[c] || []).push(ctx.shortName(s.college));
    }
    for (const [country, names] of Object.entries(byCountry)) {
      lines.push(bullet(`${country} — ${names.length} school${names.length > 1 ? 's' : ''} on your list`,
        `${joinList(names)}. These admit on published entry requirements, so the decisive work is meeting the grade for your specific course rather than differentiating an application. Apply directly to each institution unless the country runs a central service, and confirm each course's exact requirement before you commit.`));
    }
    return { text: lines.join('\n'), sources: sourcesOf(hits) };
  }

  const REA_SCHOOLS = /Harvard|Yale|Princeton|Stanford/i;
  const pool = [...ctx.reaches, ...ctx.matchReaches, ...ctx.matches, ...ctx.matchSafeties, ...ctx.safeties];
  const nonUC = pool.filter(s => !/University of California/i.test(s.college.name));

  const reaSchools = nonUC.filter(s => REA_SCHOOLS.test(s.college.name) && s.college.recommendedStrategy === 'REA');
  const usedIds = new Set();

  // ── Early Decision ─────────────────────────────────────────
  // ED is only worth its binding cost where the odds are already non-trivial
  // and no REA school is being used instead.
  const edPick = nonUC.find(s =>
    s.college.recommendedStrategy === 'ED' && s.probability >= 6 && !usedIds.has(s.college.id));

  const edDoc = retrieve(index, 'early decision binding boost odds financial risk', ctx, { topic: 'round', k: 2 })[0];
  if (edDoc) hits.push(edDoc);

  if (edPick && !reaSchools.length) {
    usedIds.add(edPick.college.id);
    const aid = /need-blind/i.test(edPick.college.financialAidIntl || '')
      ? 'It is need-blind for international applicants, which removes the usual financial risk of a binding round.'
      : `It is need-aware for international applicants, so only commit if ${money(edPick.annualCost ?? 0)} per year is workable without a large aid package.`;
    lines.push(`Early Decision: ${ctx.shortName(edPick.college)} — the best use of your one binding application at ${edPick.probability}% modelled odds and a ${edPick.fitScore}/100 fit score. ${aid} ED is also the single round choice that most changes your odds, so spend it on the school you would genuinely attend over every other on this list.`);
  } else if (reaSchools.length) {
    lines.push(`Early Decision: not recommended this cycle — you are using the restrictive early round instead, and REA rules bar a simultaneous binding ED application at another private university.`);
  } else {
    lines.push(`Early Decision: skip the binding round — no school on your list combines an ED policy with odds high enough to justify surrendering the ability to compare aid offers in April.`);
  }

  // ── Restrictive Early Action ───────────────────────────────
  if (reaSchools.length) {
    const rea = reaSchools[0];
    usedIds.add(rea.college.id);
    const reaDoc = retrieve(index, 'restrictive early action single choice non-binding restriction', ctx, { topic: 'round', k: 2 })[0];
    if (reaDoc) hits.push(reaDoc);
    lines.push(`Restrictive EA: ${ctx.shortName(rea.college)} — non-binding at ${rea.probability}% modelled odds, but it blocks early applications to other private universities. Public flagships and universities outside the US are generally exempt, so confirm each school's exact wording before filing anything else in November.`);
  }

  // ── Early Action ───────────────────────────────────────────
  const eaPicks = nonUC
    .filter(s => ['EA'].includes(s.college.recommendedStrategy) && !usedIds.has(s.college.id))
    .slice(0, 3);
  const eaDoc = retrieve(index, 'early action non-binding merit scholarship November deadline', ctx, { topic: 'round', k: 2 })[0];
  if (eaDoc) hits.push(eaDoc);

  if (eaPicks.length) {
    eaPicks.forEach(s => usedIds.add(s.college.id));
    const detail = eaPicks.map(s => `${ctx.shortName(s.college)} (${s.probability}%)`).join(', ');
    lines.push(`Early Action: ${detail} — all non-binding, so there is no cost to applying beyond the earlier deadline. EA also places you in the larger merit-scholarship pool at these schools and resolves at least one outcome before the January workload arrives.`);
  } else {
    lines.push(`Early Action: none of your matched schools run an unrestricted EA round — file everything else Regular Decision and put the freed November time into supplement quality.`);
  }

  // ── Regular Decision ───────────────────────────────────────
  const rdPicks = nonUC.filter(s => !usedIds.has(s.college.id));
  const rdDoc = retrieve(index, 'regular decision January deadline workload', ctx, { topic: 'round', k: 2 })[0];
  if (rdDoc) hits.push(rdDoc);

  if (rdPicks.length) {
    const named = rdPicks.slice(0, 6).map(s => ctx.shortName(s.college)).join(', ');
    const rest  = rdPicks.length > 6 ? `, plus ${rdPicks.length - 6} more from the matched list` : '';
    const attention = rdPicks.filter(s => s.tier === 'reach').slice(0, 2).map(s => ctx.shortName(s.college));
    const note = attention.length
      ? `${joinList(attention)} need the most attention — at that odds level the supplements are the entire argument.`
      : `Front-load the supplements for your match-band schools, which is where your realistic offers come from.`;
    lines.push(`Regular Decision: ${named}${rest} — deadlines fall between January 1 and January 15. ${note}`);
  }

  // ── UC system ──────────────────────────────────────────────
  if (ctx.hasUC) {
    const ucDoc = retrieve(index, 'UC system November application personal insight questions international', ctx, { topic: 'round', k: 2 })[0];
    if (ucDoc) hits.push(ucDoc);
    lines.push(`UC System: ${ctx.vars.ucList} — one application covers every campus and must be submitted between November 1 and November 30, with no early round and no extensions. There are no interviews and no recommendation letters; you answer four Personal Insight Questions of 350 words. Note that the UCs offer essentially no need-based aid to international students, so budget for full non-resident cost.`);
  }

  // Round documents that the fixed queries above never reach — what a deferral
  // means, how the waitlist behaves, UC specifics — are genuinely useful and
  // were unreachable in any report. Rotate one in, appended to the Regular
  // Decision line so parseAppStrategy still sees a valid round-labelled block.
  const roundExtra = fillRemaining(index, ctx, 'round', hits, 1,
    `${ctx.majorLabel} application round deferral waitlist deadline what to expect`)[0];
  if (roundExtra && lines.length) {
    hits.push(roundExtra);
    const rdIndex = lines.findIndex(l => l.startsWith('Regular Decision:'));
    const note = ` ${fill(roundExtra.doc.text, ctx)}`;
    if (rdIndex >= 0) lines[rdIndex] += note;
    else lines[lines.length - 1] += note;
  }

  // ── QuestBridge / Coalition eligibility ────────────────────
  const qbDoc = retrieve(index, 'QuestBridge Coalition eligibility citizens international', ctx, { topic: 'round', k: 2 })[0];
  if (qbDoc) {
    hits.push(qbDoc);
    lines.push(`Coalition: QuestBridge National College Match is restricted to US citizens and permanent residents, so it is not available to you. Use the Coalition application only where a school on your list requires it — it confers no advantage over the Common App.`);
  }

  return { text: lines.join('\n'), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 6. TIMELINE  (Month YYYY: blocks)
// ─────────────────────────────────────────────────────────────
function monthSequence(ctx) {
  const out = [];
  const start = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1);
  const end   = new Date(ctx.applyYear + 1, 5, 1); // through May after submission

  let d = new Date(start);
  while (d <= end) {
    const y = d.getFullYear(), m = d.getMonth();
    const appsStart = new Date(ctx.applyYear, 7, 1);      // Aug of application year
    const appsEnd   = new Date(ctx.applyYear + 1, 0, 31);  // Jan after
    const phase = d < appsStart ? 'pre' : d <= appsEnd ? 'apps' : 'decision';
    out.push({ year: y, monthIdx: m, month: ctx.monthNames[m], phase });
    d = new Date(y, m + 1, 1);
  }

  // Long horizons (a grade-9 or -10 student) get thinned to stay readable:
  // the application year keeps every month, the years before it are sampled
  // evenly so the plan still starts from where the student is today.
  if (out.length > 13) {
    const pre  = out.filter(o => o.phase === 'pre');
    const rest = out.filter(o => o.phase !== 'pre');
    // Even sampling across the pre-application span. Anchoring the final spring
    // instead was tried and measured worse: it bought one document (the May
    // AP-exam task) at the cost of four others, and left a grade-9 student
    // staring at a three-year gap between August 2026 and April 2029.
    // Corpus coverage went 95.7% -> 93.9%, so the simpler rule stands.
    const keep = Math.min(5, pre.length);
    const keptPre = keep <= 1
      ? pre.slice(0, keep)
      : Array.from({ length: keep }, (_, i) => pre[Math.round(i * (pre.length - 1) / (keep - 1))]);
    return [...new Set(keptPre), ...rest];
  }
  return out;
}

function composeTimeline(index, ctx) {
  const months = monthSequence(ctx);
  const blocks = [];
  const hits = [];
  const usedIds = new Set();

  for (const m of months) {
    const query = `${m.month} ${m.phase} ${ctx.majorLabel} ` +
      (m.phase === 'apps' ? 'application deadline essays submit portal' :
       m.phase === 'decision' ? 'decisions offers deposit visa i20 enrolment' :
       'preparation testing research competition courses');

    const eligible = d =>
      d.topic === 'timeline' &&
      d.phase === m.phase &&
      (d.months || []).includes(m.month) &&
      isEligible(d, ctx);

    const found = retrieve(index, query, ctx, { topic: 'timeline', k: 6, filter: eligible });

    // The month/phase filter is the real selector here; BM25 only orders what
    // survives it. Anything eligible but lexically unmatched is appended so a
    // month is never left empty.
    const ranked = [...found];
    const rankedIds = new Set(found.map(h => h.doc.id));
    for (const doc of index.all(eligible)) {
      if (!rankedIds.has(doc.id)) ranked.push({ doc, score: 0, rawScore: 0, boost: 1, matched: [] });
    }

    const tasks = [];
    for (const h of ranked) {
      // Scoped per year: a task should not repeat within one cycle, but an
      // annual action (register for competitions, sit the English test) should
      // reappear in a multi-year plan for a grade 9 or 10 student.
      const key = `${h.doc.id}:${m.year}`;
      if (usedIds.has(key)) continue;
      usedIds.add(key);
      hits.push(h);
      // Colons inside a task line would be misread as a new month header by
      // parseTimeline, so they are converted to dashes.
      tasks.push(fill(h.doc.text, ctx).replace(/:/g, ' —'));
      // Four rather than three: August of the application year has four
      // genuinely important tasks, and the fourth was unreachable for anybody.
      if (tasks.length >= 4) break;
    }

    if (!tasks.length) continue;
    blocks.push(`${m.month} ${m.year}:\n` + tasks.map(t => `- ${t}`).join('\n'));
  }

  // Guarantee the deadline months appear even if every task was consumed
  // earlier in the sequence.
  if (!blocks.length) {
    blocks.push(`${ctx.monthNames[10]} ${ctx.applyYear}:\n- Submit all early-round applications by November 1 and verify each portal 48 hours later.`);
    blocks.push(`${ctx.monthNames[0]} ${ctx.applyYear + 1}:\n- Submit Regular Decision applications by January 1–15 and send the mid-year report.`);
  }

  return { text: blocks.join('\n\n'), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 7. CAREER OUTLOOK  (salary lines + bullets)
// ─────────────────────────────────────────────────────────────
function composeCareerOutlook(index, ctx) {
  const table = SALARY_TABLE[ctx.majorKey] || SALARY_TABLE.default;
  const employers = EMPLOYERS[ctx.majorKey] || EMPLOYERS.default;

  // The school-level median from the database scales the national figures, so
  // a Stanford ROI row and a state-flagship row do not show identical salaries.
  // Scales the national entry-level table to this school's level. The scalar is
  // RELATIVE — measured earnings against the database median — because the
  // table holds entry-level figures while Scorecard reports earnings ten years
  // after entry. Dividing an absolute 10-year figure by an entry-level constant
  // would inflate every number.
  const anchor = ctx.topMatch || ctx.topReach;
  const anchorSalary = anchor ? medianEarnings(anchor).value : DB_MEDIAN_EARNINGS;
  const scale = Math.max(0.85, Math.min(1.25, anchorSalary / DB_MEDIAN_EARNINGS));

  const lines = [];
  const hits = [];

  lines.push(`Top career paths for ${ctx.majorLabel} graduates, with realistic entry-level salaries scaled to ${ctx.shortName(anchor) || 'your match-band schools'}:`);
  for (const [title, entry, senior] of table.slice(0, 5)) {
    const e = Math.round(entry * scale / 1000) * 1000;
    const s = Math.round(senior * scale / 1000) * 1000;
    lines.push(`- ${title}: ${money(e)} entry, rising to ${money(s)} at senior level`);
  }

  if (ctx.hasUSSchools) {
    lines.push(`- Top US employers hiring ${ctx.majorLabel} graduates: ${employers.slice(0, 10).join(', ')}`);
  }

  // The OPT/CPT/H-1B questions are US-specific. For other destinations the
  // equivalent questions are about the post-study work visa and the route to
  // residence, which the destination documents answer.
  const queries = ctx.hasUSSchools
    ? [
        { q: ctx.isSTEM ? 'STEM OPT 36 months extension lottery attempts' : 'non-STEM OPT 12 months single lottery attempt' },
        { q: 'H-1B cap lottery odds registration March masters allocation' },
        { q: 'CPT internship rules full-time eliminates OPT' },
        { q: 'employer sponsorship reality startups large companies filter' },
        { q: 'graduate school masters PhD funding decision timing' },
        { q: 'recruiting timing internship cycle campus career fair' },
        { q: 'salary total compensation cost of living equity honest' },
      ]
    : [
        { q: 'post study work visa graduate route no sponsor' },
        { q: 'permanent residence points skilled migration pathway' },
        { q: 'work rights compare destination ranking value' },
      ];
  const knowledge = retrieveSequence(index, ctx, queries, { topic: 'career', limit: 4 });
  knowledge.push(...fillRemaining(index, ctx, 'career', knowledge, 1,
    `${ctx.majorLabel} career outcomes recruiting sponsorship salary graduate study`));
  for (const h of knowledge) {
    hits.push(h);
    lines.push(bullet(fill(h.doc.title, ctx), fill(h.doc.text, ctx)));
  }

  // ROI grounding straight out of the database.
  const bestROI = [...ctx.roiData].sort((a, b) => (b.roiRatio || 0) - (a.roiRatio || 0))[0];
  if (bestROI) {
    lines.push(bullet('Best modelled return on your list',
      `${bestROI.school} shows the strongest ratio of expected earnings to cost — ${money(bestROI.expectedAnnualSalary)} expected annual salary against ${money(bestROI.totalCost4yr)} of total four-year cost, graded ${bestROI.roiGrade}` +
      `${bestROI.paybackYears ? `, with a modelled payback of ${bestROI.paybackYears} years` : ''}.`));
  }

  return { text: lines.join('\n'), sources: sourcesOf(hits) };
}

// ─────────────────────────────────────────────────────────────
// 8. VISA INFO  (bulleted)
// ─────────────────────────────────────────────────────────────
function composeVisaInfo(index, ctx) {
  const queries = [
    { q: 'F-1 process I-20 SEVIS DS-160 interview embassy sequence' },
    { q: 'interview documents checklist financial proof passport' },
    { q: 'consular officer non-immigrant intent refusal 214b' },
    { q: 'maintaining status full-time enrolment DSO travel signature' },
    { q: ctx.isSTEM ? 'STEM OPT extension 24 months E-Verify I-983' : 'standard 12 month OPT unemployment limit application' },
    { q: 'CPT authorisation part-time full-time OPT eligibility' },
    { q: 'H-1B cap lottery registration March masters exempt employers' },
    { q: 'O-1A extraordinary ability evidence categories no cap' },
    { q: 'EB-2 NIW self-petition green card country caps' },
    { q: 'Canada UK EU alternative post-study work permits' },
    { q: 'long term immigration roadmap strategy green card sequence' },
  ];
  if (ctx.hasVisaDelayRisk) queries.push({ q: 'administrative processing delay security clearance country' });

  const hits = retrieveSequence(index, ctx, queries, { topic: 'visa', limit: 10 });
  hits.push(...fillRemaining(index, ctx, 'visa', hits, 1,
    `${ctx.countryName} visa processing status maintenance long term`));

  // F-1, OPT and the H-1B lottery only apply to the US. A student whose list is
  // entirely non-US gets their destinations' actual visa routes.
  const header = ctx.hasUSSchools
    ? `F-1 planning for a student from ${ctx.countryName || 'outside the US'} studying ${ctx.majorLabel}. ` +
      `${ctx.majorLabel} is ${ctx.isSTEM ? '' : 'not '}STEM-designated at most universities, which sets your post-graduation work window at ${ctx.isSTEM ? '36' : '12'} months.`
    : `Student visa and post-study work planning for ${ctx.majorLabel} in ${joinList(ctx.destinationCountries)}. ` +
      `None of these destinations use the US F-1/OPT/H-1B system — post-study work is granted directly on the strength of the degree, without an employer sponsor or a lottery.`;

  const lines = [header, ...hits.map(h => bullet(fill(h.doc.title, ctx), fill(h.doc.text, ctx)))];
  return { text: lines.join('\n'), sources: sourcesOf(hits) };
}

module.exports = {
  composeProfileStrength,
  composeStrategy,
  composeGapAnalysis,
  composeEssayStrategy,
  composeAppStrategy,
  composeTimeline,
  composeCareerOutlook,
  composeVisaInfo,
  monthSequence,
  retrieve,
  boostFor,
};
