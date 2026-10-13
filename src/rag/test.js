// src/rag/test.js — smoke tests for the local RAG build.
// Run: node src/rag/test.js
//
// Checks the things that break silently: unfilled placeholders, sections that
// come back empty, and output that the frontend/PDF parsers cannot read.

const { analyze } = require('./ragEngine');
const { answer } = require('./qa');
const { index } = require('./corpus');

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

const SECTIONS = ['profileStrength', 'aiStrategy', 'gapAnalysis', 'essayStrategy',
  'appStrategy', 'timeline', 'careerOutlook', 'visaInfo'];

// Mirrors of the parsers in public/index.html — if these find nothing, the UI
// falls back to a raw text dump.
const parseBullets = t => (t || '').split('\n').filter(l => /^(?:[-•]|\d+[.)])\s/.test(l.trim()));
const MONTHS = ['January','February','March','April','May','June','July','August',
  'September','October','November','December','Summer','Fall','Winter','Spring'];
const parseTimeline = t => (t || '').split(new RegExp(`(${MONTHS.join('|')})[^\\n]*:`, 'gi')).length - 1;
const parseSalaries = t => (t || '').split('\n')
  .map(l => l.trim().replace(/^[-•*\d.]+\s*/, ''))
  .filter(l => /^([^:$\d]{3,55})[:\s–\-]+\$?([\d]{2,3},?\d{3})/.test(l));
const parseRounds = t => (t || '').split('\n')
  .filter(l => /^(Early Decision|Early Action|Restrictive|Regular Decision|UC System|Coalition|QuestBridge)\s*:/i.test(l.trim()));

const PROFILES = {
  'CS senior from China': {
    name: 'Li Wei', grade: '12', gpa: '3.8', sat: '1450', toefl: '102',
    major: 'Computer Science', country: 'China', schooltype: 'International School',
    totalAPsOffered: '18', apCount: '7', honorsCourses: '3',
    awards: 'First place in provincial informatics olympiad 2025', research: '',
    activities: [
      { type: 'Club Officer / Editor', leadership: 'Officer / Vice President', years: 3, description: 'Robotics club software lead' },
      { type: 'Community Service', leadership: 'Member / Participant', years: 2, description: 'Taught coding at a primary school' },
      { type: 'National Award / Competition', leadership: 'Member / Participant', years: 1, description: 'NOIP provincial first prize' },
    ],
  },
  'empty profile': {},
  'non-STEM junior, budget cap': {
    name: 'Ana', grade: '11', gpa: '3.4', major: 'Political Science', country: 'Brazil',
    ielts: '6.5', budgetMax: '40000', activities: [],
  },
  'strong grade 10, no test': {
    name: 'Yuki', grade: '10', gpa: '3.95', major: 'Biology', country: 'Japan',
    ibProgram: true, honorsCourses: '5', research: 'Two years in a university genetics lab, poster at a national symposium',
    activities: [
      { type: 'Research Experience', leadership: 'Member / Participant', years: 2, description: 'Genetics lab' },
      { type: 'School President / Captain / Founder', leadership: 'Founder / President', years: 2, description: 'Founded science outreach club' },
    ],
  },
  'elite profile, business': {
    name: 'Omar', grade: '12', gpa: '4.0', sat: '1580', toefl: '115',
    major: 'Business', country: 'Singapore', totalAPsOffered: '20', apCount: '16',
    awards: 'National DECA champion; regional case competition winner',
    research: 'Independent market research published in a student journal',
    activities: [
      { type: 'International Award / Competition', leadership: 'Founder / President', years: 3, description: 'DECA' },
      { type: 'School President / Captain / Founder', leadership: 'Founder / President', years: 4, description: 'Student body president' },
      { type: 'Job / Internship', leadership: 'Member / Participant', years: 2, description: 'Fintech internship' },
    ],
  },
};

console.log(`\nCorpus: ${JSON.stringify(index.stats())}\n`);

for (const [label, profile] of Object.entries(PROFILES)) {
  console.log(`── ${label}`);
  const r = analyze(profile, { now: new Date('2026-08-02') });

  for (const s of SECTIONS) {
    const text = r[s] || '';
    check(`${s} non-empty`, text.length > 120, `${text.length} chars`);
    check(`${s} has no unfilled placeholder`, !/\{\{|\}\}/.test(text),
      (text.match(/\{\{\w+\}\}/g) || []).join(','));
    check(`${s} has no double spaces or dangling punctuation`,
      !/ {2}|\s,|\(\)|\s\./.test(text));
  }

  check('aiStrategy parses as bullets', parseBullets(r.aiStrategy).length >= 6,
    `${parseBullets(r.aiStrategy).length} bullets`);
  check('gapAnalysis parses as bullets', parseBullets(r.gapAnalysis).length >= 3,
    `${parseBullets(r.gapAnalysis).length} items`);
  check('essayStrategy parses as bullets', parseBullets(r.essayStrategy).length >= 4);
  check('visaInfo parses as bullets', parseBullets(r.visaInfo).length >= 6);
  check('timeline parses into months', parseTimeline(r.timeline) >= 4,
    `${parseTimeline(r.timeline)} month headers`);
  check('careerOutlook yields salary rows', parseSalaries(r.careerOutlook).length >= 4,
    `${parseSalaries(r.careerOutlook).length} rows`);
  check('appStrategy yields round lines', parseRounds(r.appStrategy).length >= 3,
    `${parseRounds(r.appStrategy).length} rounds`);
  check('every retrieved document is real', r.rag.documents.every(d => index.all(x => x.id === d.id).length === 1));
  check('runs under 250ms', r.rag.elapsedMs < 250, `${r.rag.elapsedMs}ms`);
  console.log('');
}

// ── The school list must actually respond to the major ──────────
console.log('── major sensitivity');
{
  const { runMatchEngine } = require('../matchEngine');
  const base = { grade: '12', gpa: '3.8', sat: '1450', toefl: '102', country: 'China',
                 totalAPsOffered: '18', apCount: '7', activities: [] };
  const listFor = m => runMatchEngine({ ...base, major: m });
  const names = m => listFor(m).map(r => r.college.name);

  const cs = names('Computer Science');
  const overlapWithCS = m => {
    const n = names(m);
    return { pct: n.filter(x => cs.includes(x)).length / Math.max(1, n.length), n };
  };

  // SPECIALIZED majors must diverge sharply — a nursing list and a CS list
  // should barely resemble each other, because most universities have no
  // nursing school at all.
  //
  // The grouping here follows `availability` in src/majorFit.js rather than
  // intuition about which subjects feel unrelated. Business used to sit in this
  // strict group and passed at 56% against a 60% bar — but business is classed
  // `common`, not `specialized`: it is a flagship programme at essentially every
  // large public university, exactly like computer science. The two lists SHOULD
  // share Minnesota, Ohio State, Rutgers, Penn State and Michigan State, because
  // those schools really are strong in both. The old 56% was a 4-point margin
  // that happened to hold while lists were short, not evidence of divergence.
  for (const m of ['Nursing', 'Music', 'Architecture']) {
    const { pct, n } = overlapWithCS(m);
    check(`${m} list differs from CS list`, pct < 0.6, `${Math.round(pct * 100)}% overlap`);
    check(`  ${m} returns a usable list`, n.length >= 6, `${n.length} schools`);
    check(`  ${m} has no duplicate schools`, new Set(n).size === n.length);
  }

  // UNIVERSAL and COMMON majors SHOULD share schools — Wisconsin and Virginia
  // Tech are genuinely strong in both CS and mechanical engineering, and the
  // big publics are strong in CS and business alike. The requirement is that the
  // list still moves, not that it becomes unrecognisable.
  for (const m of ['Mechanical Engineering', 'Mathematics', 'Business']) {
    const { pct, n } = overlapWithCS(m);
    check(`${m} overlaps CS but is not identical to it`, pct < 0.9 && pct > 0.1,
      `${Math.round(pct * 100)}% overlap`);
    check(`  ${m} has no duplicate schools`, new Set(n).size === n.length);
  }

  // Specialized majors are never padded: a school with no recorded programme is
  // not a weaker option, it may not be an option at all. Short tiers are the
  // correct outcome here.
  for (const m of ['Nursing', 'Music', 'Architecture', 'Public Health']) {
    const l = listFor(m);
    check(`${m}: every school on the list actually has the programme`,
      l.every(r => r.majorVerified), `${l.filter(r => !r.majorVerified).length} unverified`);
    check(`  ${m}: every school carries a major-fit label`,
      l.every(r => r.majorFit > 0 && r.majorFitLabel));
  }

  // Universal majors are different — every university teaches mathematics, so
  // schools that do not name it are legitimate and correctly labelled.
  {
    const l = listFor('Mathematics');
    check('Mathematics list mixes flagships with ordinary departments',
      l.some(r => r.majorVerified) && l.some(r => !r.majorVerified));
    const firstUnverified = l.findIndex(r => !r.majorVerified);
    const verifiedAfter   = l.slice(firstUnverified + 1).filter(r => r.majorVerified).length;
    check('  named-strength maths departments rank at the top',
      firstUnverified === -1 || firstUnverified >= 3, `first unverified at index ${firstUnverified}`);
  }

  // A CS applicant with elite numbers should see CS powerhouses, not whichever
  // school happens to be most selective overall.
  const elite = runMatchEngine({ ...base, gpa: '4.0', sat: '1570', major: 'Computer Science' });
  const topFour = elite.slice(0, 4).map(r => r.college.name).join(' ');
  check('elite CS profile surfaces CS powerhouses',
    /MIT|Caltech|Stanford|Carnegie Mellon|Berkeley|Columbia/.test(topFour), topFour);

  // The multiplier must come from a measured source, never from collegeData's
  // hand-set majorDifficulty numbers.
  const { majorDifficultyMultiplier } = require('../majorFit');
  const { COLLEGES } = require('../collegeData');
  const { EMPIRICAL_MAJOR_RATIOS, bandProvenance } = require('../data/majorAdmissions');
  const gated = COLLEGES.find(c => bandProvenance(c, 'business') === 'modelled');
  check('gated division uses the measured empirical ratio',
    gated && majorDifficultyMultiplier(gated, 'business') === EMPIRICAL_MAJOR_RATIOS.business,
    gated ? `${majorDifficultyMultiplier(gated, 'business')} vs ${EMPIRICAL_MAJOR_RATIOS.business}` : 'none');
  const structural = COLLEGES.find(c => bandProvenance(c, 'economics') === 'structural');
  check('  structural major uses the school band unchanged',
    structural && majorDifficultyMultiplier(structural, 'economics') === 1);
  // UPenn carried business:0.7 by hand; the published figures give 4.5/5.4.
  const penn = COLLEGES.find(c => /UPenn/.test(c.name));
  check('  hand-set collegeData values are no longer used',
    majorDifficultyMultiplier(penn, 'business') !== 0.7,
    `${majorDifficultyMultiplier(penn, 'business')}`);
}
console.log('');

// ── Calibration at the accessible end of the range ──────────────
console.log('── probability calibration');
{
  const { runMatchEngine } = require('../matchEngine');
  const { COLLEGES } = require('../collegeData');
  const find = (list, name) => list.find(r => r.college.name.includes(name));

  const weak = { grade: '12', gpa: '2.7', sat: '1000', toefl: '85', major: 'Communications',
                 country: 'Thailand', totalAPsOffered: '8', apCount: '0', activities: [] };
  const wl = runMatchEngine(weak);
  const asu = find(wl, 'Arizona State');
  // ASU admits ~90% of applicants; a below-band applicant is not a "reach" there.
  check('open-access school is not a reach for a weak profile',
    !asu || asu.tier !== 'reach', asu ? `ASU = ${asu.probability}% ${asu.tier}` : 'ASU absent');
  check('  weak profile still gets a usable list', wl.length >= 8, `${wl.length} schools`);

  // The same must hold for a competitive major. The original damping was keyed
  // to the school's admit rate; when per-major bands landed it silently started
  // reading the MAJOR's rate, so at Arizona State it went 0.29 -> 0.63 and a
  // 90%-admit school came back as a 17% reach for a below-band CS applicant.
  const weakCS = { ...weak, major: 'Computer Science' };
  const asuCS = find(runMatchEngine(weakCS), 'Arizona State');
  check('  open-access school is not a reach in a competitive major either',
    !asuCS || asuCS.tier !== 'reach', asuCS ? `ASU CS = ${asuCS.probability}%` : 'absent');

  // Openness damps the penalty for being below the band, not the reward for
  // being above it. Damping both directions cost a perfect profile every safety
  // school on the list.
  {
    const { estimateForCollege } = require('../matchEngine');
    const { COLLEGES } = require('../collegeData');
    const asuC = COLLEGES.find(c => c.name.includes('Arizona State'));
    const perfect = estimateForCollege({ gpa: '4.0', sat: '1580', major: 'Computer Science',
      country: 'China', grade: '12', activities: [] }, asuC).probability;
    check('  a perfect profile is still a safety at a 90%-admit school',
      perfect >= 70, `ASU = ${perfect}%`);
  }

  // A published band is the middle 50% OF ADMITS, so a quarter of admitted
  // students sit below its floor. An applicant at the 25th percentile should
  // land near the major's own rate, not a fraction of it.
  {
    const { estimateForCollege } = require('../matchEngine');
    const { majorAdmissionBand } = require('../data/majorAdmissions');
    const { majorDifficultyMultiplier } = require('../majorFit');
    const { COLLEGES } = require('../collegeData');
    for (const nm of ['Carnegie Mellon', 'Georgia Tech', 'Purdue', 'Arizona State']) {
      const c = COLLEGES.find(x => x.name.includes(nm));
      const b = majorAdmissionBand(c, 'cs', majorDifficultyMultiplier(c, 'cs'));
      const [gL] = b.gpa || c.gpaRange;
      const [sL] = b.sat || c.satRange;
      let rate;
      if (b.intlRate != null) rate = b.intlRate;
      else { const so = c.acceptanceRate, si = c.intlAcceptanceRate || so; rate = (b.rate ?? so) * (si / so); }
      const p = estimateForCollege({ gpa: gL.toFixed(2), sat: String(sL), major: 'Computer Science',
        country: 'China', grade: '12', activities: [] }, c).probability;
      const ratio = p / rate;
      check(`  25th-percentile applicant lands near the major rate at ${nm}`,
        ratio >= 0.55 && ratio <= 0.95, `${ratio.toFixed(2)}x (${p}% of ${rate.toFixed(1)}%)`);
    }
  }

  // The below-band tail must keep decaying. It used to flatten onto a 1% floor,
  // so a 3.8/1450 and a 2.5/950 were indistinguishable at a selective school.
  {
    const { estimateForCollege } = require('../matchEngine');
    const { COLLEGES } = require('../collegeData');
    const mit = COLLEGES.find(c => c.name.includes('Massachusetts'));
    const ps = [[3.9, 1510], [3.8, 1450], [3.6, 1350]].map(([g, s]) =>
      estimateForCollege({ gpa: String(g), sat: String(s), major: 'Computer Science',
        country: 'China', grade: '12', activities: [] }, mit).probability);
    check('  below-band odds keep decreasing rather than flattening onto a floor',
      ps[0] > ps[1] && ps[1] > ps[2], ps.join(' > '));
  }

  // Weaker students need MORE accessible options, not fewer. The list used to
  // shrink to four pure reaches because plausible schools fell under the 3%
  // exclusion threshold and were deleted.
  {
    const mid = runMatchEngine({ gpa: '3.4', sat: '1250', major: 'Computer Science',
      country: 'China', grade: '12', totalAPsOffered: '18', apCount: '12', activities: [] });
    check('  a mid-range profile gets more than a handful of schools',
      mid.length >= 9, `${mid.length} schools`);
    check('    and they are not all reaches',
      mid.filter(r => r.tier !== 'reach').length >= 4,
      `${mid.filter(r => r.tier !== 'reach').length} non-reach`);
  }

  // Selective-end calibration must be unchanged by the damping fix.
  const elite = { grade: '12', gpa: '4.0', sat: '1580', toefl: '115', major: 'Computer Science',
                  country: 'India', totalAPsOffered: '20', apCount: '18', activities: [] };
  const el = runMatchEngine(elite);
  const mit = find(el, 'Massachusetts Institute');
  check('elite profile still faces single-digit odds at MIT',
    !mit || (mit.probability < 15 && mit.tier === 'reach'),
    mit ? `${mit.probability}% ${mit.tier}` : 'MIT absent');
  const anySafety = el.filter(r => r.tier === 'safety');
  check('  elite profile gets high-odds safeties',
    anySafety.length > 0 && anySafety.every(r => r.probability >= 60),
    `${anySafety.length} safeties`);

  // Probability must rise monotonically with academic strength at a fixed school.
  const at = gpa => {
    const l = runMatchEngine({ ...weak, gpa: String(gpa), sat: String(900 + (gpa - 2.5) * 300) });
    return find(l, 'Arizona State')?.probability ?? 0;
  };
  const curve = [2.6, 3.0, 3.4, 3.8].map(at);
  check('odds increase monotonically with profile strength',
    curve.every((v, i) => i === 0 || v >= curve[i - 1]), curve.join(' → '));
}
console.log('');

// ── Honesty when the database has nothing safe ──────────────────
// ── The list must not shrink as the student gets weaker ─────────
// The tier quota used to be a hard 4 per bucket with no reallocation, so a
// student with no safeties silently lost those slots. The list inverted: a
// 4.0/1580 applicant got 20 schools while a 2.8/1020 applicant got 6, four of
// which were reaches. The weaker the student, the fewer options they were shown
// — exactly backwards. Empty tiers now release their slots to the tiers that do
// have schools, accessible end first.
console.log('── list size across the strength range');
{
  const { runMatchEngine } = require('../matchEngine');
  const at = (gpa, sat) => runMatchEngine({
    gpa: String(gpa), sat: String(sat), major: 'Computer Science', country: 'China',
    grade: '12', totalAPsOffered: '18', apCount: '12', activities: [],
  });

  const rungs = [[4.0, 1580], [3.8, 1450], [3.6, 1350], [3.4, 1250], [3.1, 1120], [2.8, 1020]];
  const lists = rungs.map(([g, s]) => ({ g, s, l: at(g, s) }));

  for (const { g, s, l } of lists) {
    check(`${g.toFixed(1)}/${s} gets a usable list`, l.length >= 14, `${l.length} schools`);
    check(`  ${g.toFixed(1)}/${s} has no duplicate schools`,
      new Set(l.map(r => r.college.name)).size === l.length);
  }

  // The weakest profile must not be handed a list made only of long shots.
  const weakest = lists[lists.length - 1].l;
  const bestOdds = Math.max(...weakest.map(r => r.probability));
  check('weakest profile still sees its most accessible options',
    bestOdds >= 25, `best odds on the list ${bestOdds}%`);

  // Strong and weak students should get comparably sized lists.
  const spread = lists[0].l.length - weakest.length;
  check('list size does not collapse with profile strength',
    spread <= 6, `strongest ${lists[0].l.length} vs weakest ${weakest.length}`);

  // Topping up a short list must not quietly smuggle in schools that may not
  // teach the subject. Overflow draws only on the primary pool, so it can only
  // add verified programmes. A weak profile for a specialized major can still
  // fall under the documented `useFiller` threshold (honest pool below six
  // schools), and that padding is deliberate — but every padded entry has to
  // carry the warning label rather than passing as a real programme.
  for (const m of ['Nursing', 'Music', 'Architecture']) {
    const l = runMatchEngine({ gpa: '3.1', sat: '1120', major: m, country: 'China',
      grade: '12', totalAPsOffered: '18', apCount: '12', activities: [] });
    const unverified = l.filter(r => !r.majorVerified);
    check(`  ${m}: every unverified entry is flagged for a weak profile`,
      unverified.every(r => /verify with the department/i.test(r.majorFitLabel || '')),
      `${unverified.length} unverified, ${unverified.filter(r => !/verify/i.test(r.majorFitLabel || '')).length} unflagged`);
    check(`  ${m}: the verified programmes still lead the list`,
      l.slice(0, 3).every(r => r.majorVerified));
  }
}
console.log('');

console.log('── honesty for below-range students');
{
  const weakP = { name: 'Minh', grade: '12', gpa: '3.0', sat: '1100', toefl: '90', major: 'Business',
                  country: 'Vietnam', totalAPsOffered: '10', apCount: '1',
                  activities: [{ type: 'Team Member / Club Member', leadership: 'Member / Participant', years: 2 }] };
  const r = analyze(weakP, { now: new Date('2026-08-02') });
  const hasSafety = r.schools.some(s => s.tier === 'safety');

  check('no-safety case is detected', !hasSafety);
  check('report says the list has no safe option',
    /no safe option|no safety school/i.test(r.profileStrength + r.gapAnalysis));
  check('report does NOT claim safety-band options exist',
    !/options in the match and safety bands where you would be a strong candidate/i.test(r.profileStrength));
  check('strategy leads with widening the list',
    /realistic half of your list|guaranteed-admission|direct admissions/i.test(
      r.aiStrategy.split('\n').slice(0, 6).join(' ')));

  // Gap targets must be reachable, not anchored to a 3%-odds school.
  const satTarget = (r.gapAnalysis.match(/retake score of (\d{4})/) || [])[1];
  check('SAT gap target is realistic for this profile',
    !satTarget || Number(satTarget) <= 1350, `target ${satTarget}`);
}
console.log('');

// ── Major resolution must be shared and exact ───────────────────
// A private copy of getMajorKey in the career and ROI engines tested
// `major.includes('cs')`, which also matches the tail of "economics",
// "physics", "statistics" and "mathematics".
console.log('── major key resolution');
{
  const { getMajorKey } = require('../majorKey');
  const { predictCareer } = require('../engines/careerPredictor');
  const { calculateROI }  = require('../engines/roiEngine');
  const { COLLEGES } = require('../collegeData');
  const school = COLLEGES[0];

  for (const [major, expected] of [
    ['Economics', 'economics'], ['Physics', 'physics'], ['Statistics', 'math'],
    ['Mathematics', 'math'], ['Computer Science', 'cs'], ['Software Engineering', 'cs'],
    ['Mechanical Engineering', 'engineering'], ['Nursing', 'nursing'],
  ]) {
    check(`"${major}" resolves to ${expected}`, getMajorKey(major) === expected, getMajorKey(major));
  }

  const csCareers = predictCareer({ major: 'Computer Science' }, school).map(c => c.title);
  for (const major of ['Economics', 'Physics']) {
    const careers = predictCareer({ major }, school).map(c => c.title);
    check(`${major} careers are not the CS list`,
      JSON.stringify(careers) !== JSON.stringify(csCareers), careers.slice(0, 2).join(', '));
  }
  check('Economics is not priced with the CS salary multiplier',
    calculateROI(school, { major: 'Economics' }).expectedAnnualSalary !==
    calculateROI(school, { major: 'Computer Science' }).expectedAnnualSalary);

  // The chart and the report text must cover the same majors, or the Career tab
  // contradicts the salary figures printed beside it.
  const { SALARY_TABLE } = require('./knowledge/careers');
  const { CAREER_PATHS } = require('../engines/careerPredictor');
  if (CAREER_PATHS) {
    const missing = Object.keys(SALARY_TABLE).filter(k => !CAREER_PATHS[k]);
    check('career chart covers every major the salary table does', missing.length === 0, missing.join(','));
  }
}
console.log('');

// ── Scoring must not privilege one curriculum over another ──────
console.log('── scoring scale');
{
  const { calculateRigorIndex, scoreEC } = require('../matchEngine');
  const { computeProfileScore } = require('./ragEngine');

  const maxed = { totalAPsOffered: '20', apCount: '20', honorsCourses: '8',
                  dualEnrollment: '5', schooltype: 'International School' };
  check('AP-track student can reach a 10 rigour index',
    calculateRigorIndex(maxed) === 10, `${calculateRigorIndex(maxed)}/10`);
  check('  IB-track student reaches the same ceiling',
    calculateRigorIndex({ ...maxed, ibProgram: true }) === 10);
  check('  IB diploma alone still scores well',
    calculateRigorIndex({ ibProgram: true }) >= 6.5, `${calculateRigorIndex({ ibProgram: true })}/10`);

  const perfect = { gpa: '4.0', sat: '1600', toefl: '120',
                    research: 'x'.repeat(40), awards: 'y'.repeat(40) };
  check('profile score can actually reach 100',
    computeProfileScore(perfect, 10, 20) === 100, `${computeProfileScore(perfect, 10, 20)}/100`);
}
console.log('');

// ── A budget below the whole database must fail loudly ──────────
console.log('── budget below database range');
{
  const { COLLEGES } = require('../collegeData');
  const cheapest = Math.min(...COLLEGES.map(c => (c.tuitionOutOfState || 50000) + 18000));
  const r = analyze({ gpa: '3.9', sat: '1500', major: 'Computer Science', grade: '12',
                      country: 'China', budgetMax: '30000' }, { now: new Date('2026-08-02') });

  check('budget below the cheapest school still returns a usable list',
    r.schools.length >= 5, `${r.schools.length} schools (cheapest is $${cheapest.toLocaleString()})`);
  check('  every school returned is flagged over budget', r.schools.every(s => s.overBudget));
  check('  the report says the budget fits nothing', /no school in this database fits a budget/i.test(r.profileStrength));
  check('  the first gap is the budget, not an academic one',
    /budget/i.test(r.gapAnalysis.split('\n')[0]), r.gapAnalysis.split('\n')[0].slice(0, 70));
  check('  strategy leads with the affordable alternatives',
    /community.college|merit|low.tuition/i.test(r.aiStrategy.split('\n').slice(0, 4).join(' ')));
  check('  career and ROI data still populate', r.careers.length > 0 && r.roiData.length > 0);

  // A workable budget must NOT trip the infeasible path.
  const ok = analyze({ gpa: '3.9', sat: '1500', major: 'Computer Science', grade: '12',
                       country: 'China', budgetMax: '70000' }, { now: new Date('2026-08-02') });
  check('a realistic budget is unaffected',
    !/no school in this database fits a budget/i.test(ok.profileStrength) &&
    ok.schools.some(s => !s.overBudget));
}
console.log('');

// ── The database must not list a school twice ───────────────────
{
  const { COLLEGES } = require('../collegeData');
  const names = COLLEGES.map(c => c.name.trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  check('collegeData contains no duplicate schools', dupes.length === 0, [...new Set(dupes)].join(', '));
  const ids = COLLEGES.map(c => c.id);
  check('  and no duplicate ids', new Set(ids).size === ids.length);
}
console.log('');

// ── Per-major coverage: published data and the empirical fallback ──
console.log('── per-major admission data');
{
  const { COLLEGES } = require('../collegeData');
  const { VERIFIED, EMPIRICAL_MAJOR_RATIOS, majorAdmissionBand } = require('../data/majorAdmissions');
  const { majorDifficultyMultiplier } = require('../majorFit');
  const { estimateForCollege } = require('../matchEngine');

  check(`published by-major data covers ${VERIFIED.length} schools`, VERIFIED.length >= 12,
    `${VERIFIED.length} schools`);
  check('every VERIFIED entry matches a school in the database',
    VERIFIED.every(v => COLLEGES.some(c => c.name.includes(v.match))),
    VERIFIED.filter(v => !COLLEGES.some(c => c.name.includes(v.match))).map(v => v.match).join(','));

  // Published rates must be used verbatim, not re-derived.
  const uclaNursing = majorAdmissionBand(COLLEGES.find(c => c.name.includes('UCLA')), 'nursing', 0.7);
  check('UCLA nursing uses the published 0.5% rate',
    uclaNursing.verified && uclaNursing.rate === 0.5, `${uclaNursing.rate}% verified=${uclaNursing.verified}`);

  // The empirical fallback must differentiate majors at schools whose
  // majorDifficulty map has no entry — 99 of 102 for nursing before this.
  // Nursing is a gated division everywhere, so no school may fall back to its
  // own school-wide rate for it.
  const { bandProvenance: prov } = require('../data/majorAdmissions');
  const nursingSchools = COLLEGES.filter(c => prov(c, 'nursing') !== 'published');
  const differentiated = nursingSchools.filter(c => majorDifficultyMultiplier(c, 'nursing') !== 1);
  check('nursing is never scored at the school-wide rate',
    differentiated.length === nursingSchools.length,
    `${differentiated.length}/${nursingSchools.length}`);

  // Competitive majors must come out below life-science majors on the ratios.
  check('CS ratio is below biology ratio',
    EMPIRICAL_MAJOR_RATIOS.cs < EMPIRICAL_MAJOR_RATIOS.biology,
    `cs ${EMPIRICAL_MAJOR_RATIOS.cs} vs biology ${EMPIRICAL_MAJOR_RATIOS.biology}`);

  // A school with no published data should still separate a capped major from
  // an uncapped one for the same student.
  const p = { grade: '12', gpa: '3.85', sat: '1470', toefl: '108', country: 'India',
              totalAPsOffered: '18', apCount: '12', activities: [] };
  const cs  = estimateForCollege({ ...p, major: 'Computer Science' }, 'Syracuse');
  const pol = estimateForCollege({ ...p, major: 'Political Science' }, 'Syracuse');
  check('unpublished school still separates capped from uncapped majors',
    cs && pol && cs.probability < pol.probability,
    cs && pol ? `cs ${cs.probability}% vs policy ${pol.probability}%` : 'missing');

  // A not-offered major must still report a coherent band rather than the
  // school-wide rate.
  const miamiNursing = estimateForCollege({ ...p, major: 'Nursing' }, 'University of Miami');
  const miami = COLLEGES.find(c => c.name.includes('University of Miami'));
  check('not-offered major reports a major band, not the school rate',
    miamiNursing && miamiNursing.band.rate < miami.acceptanceRate,
    miamiNursing ? `band ${miamiNursing.band.rate}% vs school ${miami.acceptanceRate}%` : 'missing');
}
console.log('');

// ── Cost model ────────────────────────────────────────────────
console.log('── cost of attendance model');
{
  const { COLLEGES } = require('../collegeData');
  const { costProfile, roomAndBoard } = require('../data/costModel');
  const { calculateROI } = require('../engines/roiEngine');

  const profiles = COLLEGES.map(costProfile);

  check('every school gets a cost profile', profiles.every(p => p.annualCost > 0));
  check('no school uses the old flat $18,000 room and board',
    profiles.every(p => p.roomAndBoard !== 18000));

  // Must reproduce the published national averages within a sane margin. Our
  // sample skews to expensive coastal states, so it should sit slightly above.
  const pub = COLLEGES.filter(c => c.type === 'Public').map(roomAndBoard);
  const pri = COLLEGES.filter(c => c.type !== 'Public').map(roomAndBoard);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  check('public room and board tracks the $14,034 national average',
    Math.abs(mean(pub) - 14034) / 14034 < 0.15, `$${Math.round(mean(pub)).toLocaleString()}`);
  check('private room and board tracks the $15,958 national average',
    Math.abs(mean(pri) - 15958) / 15958 < 0.15, `$${Math.round(mean(pri)).toLocaleString()}`);

  // Cost of living must actually move the number.
  const ny = COLLEGES.find(c => /,\s*NY/.test(c.location) && c.type === 'Private');
  const mw = COLLEGES.find(c => /,\s*IN|,\s*OH/.test(c.location) && c.type === 'Public');
  check('a New York campus costs more to live at than a midwestern one',
    ny && mw && roomAndBoard(ny) > roomAndBoard(mw),
    ny && mw ? `${roomAndBoard(ny)} vs ${roomAndBoard(mw)}` : 'missing');

  // ROI must now discriminate rather than tracking tuition alone.
  const st = { major: 'Computer Science' };
  const rois = COLLEGES.map(c => calculateROI(c, st));
  const grades = new Set(rois.map(r => r.roiGrade));
  check('ROI produces more than one grade across the database', grades.size >= 3,
    [...grades].join(','));
  const paybacks = rois.map(r => r.paybackYears).filter(Boolean);
  check('payback periods vary', new Set(paybacks).size >= 4,
    `${Math.min(...paybacks)}–${Math.max(...paybacks)} years`);
  check('employment rate is no longer flat 0.85 everywhere',
    new Set(rois.map(r => r.employmentRate)).size > 5);
  check('ROI exposes its cost breakdown',
    rois.every(r => r.roomAndBoard > 0 && r.fees > 0 && r.annualCost > 0));
}
console.log('');

// ── The Q&A endpoint must be reachable from the UI ─────────────
console.log('── Q&A is wired into the interface');
{
  const html = require('fs').readFileSync(
    require('path').join(__dirname, '../../public/index.html'), 'utf8');
  // The question-answering path was once fully implemented and tested with
  // nothing in the UI calling it, so it was unreachable for a real user. Both
  // ask surfaces — the Improve tab panel and the floating chat — now post to
  // /api/chat, which computes result questions and falls through to the same
  // retrieval for everything else.
  check('the page calls /api/chat', /fetch\(\s*['"]\/api\/chat/.test(html));
  check('  a question input exists', /id="ask-input"/.test(html));
  check('  answers render their sources', /ask-sources/.test(html));
  check('  the analysis is stored for question context', /LAST_DATA/.test(html));

  // The floating chat box itself.
  check('  the chat box is on the page', /id="chat-panel"/.test(html) && /id="chat-fab"/.test(html));
  check('  the chat has an input and a send control', /id="chat-in"/.test(html) && /chatSend/.test(html));
  check('  the chat panel has an opaque background',
    /background:#0e1a2e/.test(html), 'a floating panel on var(--card) renders see-through');
  check('  the chat labels where an answer came from', /chat-kind/.test(html));
}
console.log('');

// ── Retrieval quality, measured not assumed ────────────────────
console.log('── retrieval quality');
{
  const { run } = require('./evalRetrieval');
  // Silence the detailed report; we only want the numbers here.
  const log = console.log; console.log = () => {};
  let m;
  try { m = run(); } finally { console.log = log; }

  // Thresholds are set just below current measured values so a regression
  // fails the build, rather than being aspirational targets.
  check(`retrieval recall@5 >= 85%`, m.recall >= 0.85, `${(m.recall * 100).toFixed(1)}%`);
  check(`  mean reciprocal rank >= 0.68`, m.mrr >= 0.68, m.mrr.toFixed(3));
  check(`  paraphrase agreement >= 85%`, m.robustness >= 0.85, `${(m.robustness * 100).toFixed(1)}%`);
  check(`  corpus coverage >= 95%`, m.coverage >= 0.95, `${(m.coverage * 100).toFixed(1)}%`);
  check(`  at most 2 documents are structurally unselectable`, m.crowded <= 2, `${m.crowded} unselectable`);
}
console.log('');

// ── The Q&A path, not just raw retrieval ───────────────────────
console.log('── question answering routing');
{
  const P = { gpa: '3.9', sat: '1500', major: 'Computer Science', country: 'India', activities: [] };
  // Appending the student's major and country to the query string used to
  // outweigh the question itself: "what happens if I get deferred" returned CS
  // portfolio advice. These assert the question drives the answer.
  const CASES = [
    ['what happens if I get deferred',                 /^round-deferral/],
    ['how does the waitlist work',                     /^round-(waitlist|deferral)/],
    ['what should I write my personal statement about', /^essay-/],
    ['can I get a green card without an employer',     /^visa-/],
    ['how do I ask for recommendation letters',        /recommend/],
  ];
  for (const [q, want] of CASES) {
    const r = answer(q, P, {});
    const top = (r.sources[0] || {}).id || '';
    check(`"${q.slice(0, 42)}"`, want.test(top), `top=${top}`);
  }
  // A profile term must not be able to outrank the question.
  const a = answer('what happens if I get deferred', P, {});
  check('  profile context does not swamp a short question',
    !/school-|strat-cs/.test((a.sources[0] || {}).id || ''), (a.sources[0] || {}).id);
}
console.log('');

// ── Stemmer must not corrupt ordinary words ────────────────────
console.log('── tokenizer');
{
  const { stem, tokenize } = require('./tokenize');
  // "deferred" once stemmed to `deferr` while the tag "defer" stemmed to
  // `defer`, so a question about deferral could never match its own answer.
  check('doubled consonants collapse after -ed/-ing',
    stem('deferred') === 'defer' && stem('planned') === 'plan' && stem('running') === 'run',
    `${stem('deferred')} ${stem('planned')} ${stem('running')}`);
  // The -ly rule turned "apply" into "app" while "applying" became "apply".
  check('  words ending in -ly are not truncated',
    stem('apply') === 'apply' && stem('early') === 'early' && stem('family') === 'family',
    `${stem('apply')} ${stem('early')} ${stem('family')}`);
  check('  inflections of the same word agree',
    stem('apply') === stem('applying') && stem('submit') === stem('submitted'));
  // Filler verbs must be dropped on the stem, not only the literal form.
  check('  filler words are dropped after stemming',
    !tokenize('what happens if I get deferred').includes('happen'),
    tokenize('what happens if I get deferred').join(','));
  check('  domain terms survive stop-listing',
    ['decision', 'financial', 'research'].every(w => tokenize(`early ${w} aid`).includes(w)));
}
console.log('');

// ── Measured outcome data replaces hand-set ratings ────────────
console.log('── measured outcomes (College Scorecard)');
{
  const { COLLEGES } = require('../collegeData');
  const { OUTCOMES } = require('../data/outcomes');
  const { fitMetricsFor, medianEarnings, coverage } = require('../data/fitMetrics');
  const { calculateROI } = require('../engines/roiEngine');

  const cov = coverage();
  check('Scorecard covers every school in the database', cov.measured === cov.total,
    `${cov.measured}/${cov.total}`);
  check('  every school has measured earnings', cov.withEarnings === cov.total,
    `${cov.withEarnings}/${cov.total}`);

  // The matcher once bound "Brown University" to "John Brown University" in
  // Arkansas. Every match must be a prefix relationship, never a school that
  // merely contains the name with extra leading words.
  const norm = x => String(x).toLowerCase().replace(/\band\b/g, '&').replace(/[^a-z0-9&]/g, '');
  // Alias matches are curated by hand in buildOutcomes.js and are their own
  // verification; the prefix rule applies to everything resolved automatically.
  const bad = Object.entries(OUTCOMES).filter(([name, o]) => {
    if (o.match === 'alias') return false;
    const a = norm(name.replace(/\s*\(.*?\)\s*/g, '')), b = norm(o.scorecard);
    return !(a === b || a.startsWith(b) || b.startsWith(a));
  }).map(([n, o]) => `${n} -> ${o.scorecard}`);
  check('  no school is auto-matched to a different institution', bad.length === 0, bad.join(' | '));

  // Each alias must still resolve to exactly the record it names.
  const { ALIAS } = require('../data/buildOutcomes');
  const aliasWrong = Object.entries(OUTCOMES)
    .filter(([n, o]) => o.match === 'alias' && ALIAS[n] && norm(ALIAS[n]) !== norm(o.scorecard))
    .map(([n, o]) => `${n}: expected ${ALIAS[n]}, got ${o.scorecard}`);
  check('  every alias resolves to the record it names', aliasWrong.length === 0, aliasWrong.join(' | '));

  // Metrics must actually vary now — the hand-set ratings had ~15 distinct
  // values across 102 schools.
  const all = COLLEGES.map(fitMetricsFor);
  // The continuous metrics must genuinely spread.
  for (const k of ['satisfaction', 'diversity', 'pipeline']) {
    const distinct = new Set(all.map(m => m[k])).size;
    check(`  ${k} varies across schools`, distinct >= 10, `${distinct} distinct values`);
  }
  // `research` comes from Carnegie classification, which is categorical — four
  // levels appear in this database. Cardinality is the wrong test; ordering and
  // a bounded spread are the right ones, because a 4-level signal must not
  // dominate a score.
  const { CARNEGIE_RESEARCH } = require('../data/fitMetrics');
  check('  research is ordered R1 > R2 > R3 >= baccalaureate',
    CARNEGIE_RESEARCH[15] > CARNEGIE_RESEARCH[16] &&
    CARNEGIE_RESEARCH[16] > CARNEGIE_RESEARCH[17] &&
    CARNEGIE_RESEARCH[17] >= CARNEGIE_RESEARCH[21]);
  const rSpread = Math.max(...all.map(m => m.research)) - Math.min(...all.map(m => m.research));
  check('  research spread stays proportionate to a 4-level signal',
    rSpread <= 3.0, `spread ${rSpread.toFixed(1)}`);
  // Liberal arts colleges must not be flatly out-ranked on outcomes.
  const mudd = COLLEGES.find(c => c.name.includes('Harvey Mudd'));
  const asu  = COLLEGES.find(c => c.name.includes('Arizona State'));
  check('  a strong liberal arts college beats a large R1 on earnings',
    fitMetricsFor(mudd).pipeline > fitMetricsFor(asu).pipeline,
    `Mudd ${fitMetricsFor(mudd).pipeline} vs ASU ${fitMetricsFor(asu).pipeline}`);

  // vibe has no source and must never reach a score.
  check('  vibe is labelled as unscored',
    all.every(m => /not used in scoring/.test(m.sources.vibe)));
  const engineSrc = require('fs').readFileSync(require('path').join(__dirname, '../matchEngine.js'), 'utf8');
  check('  vibe is absent from preferenceScore',
    !/fm\.vibe/.test(engineSrc));

  // Earnings must be the measured figure where available.
  const withReal = COLLEGES.filter(c => OUTCOMES[c.name]?.earnings10);
  check('  ROI uses measured earnings where available',
    withReal.every(c => calculateROI(c, {}).baseEarnings === OUTCOMES[c.name].earnings10),
    `${withReal.length} schools`);
  check('  ROI reports whether earnings were measured',
    COLLEGES.every(c => typeof calculateROI(c, {}).earningsMeasured === 'boolean'));

  // Every school still resolves, measured or not.
  check('  every school yields complete metrics',
    all.every(m => ['satisfaction','research','diversity','pipeline','vibe']
      .every(k => typeof m[k] === 'number' && m[k] >= 0 && m[k] <= 10)));
}
console.log('');

// ── One number, one value, on every surface ────────────────────
console.log('── cross-surface consistency');
{
  const { COLLEGES } = require('../collegeData');
  const { SCHOOL_DOCS } = require('./corpus');
  const { medianEarnings } = require('../data/fitMetrics');
  const { calculateROI } = require('../engines/roiEngine');
  const { annualCost } = require('../data/costModel');
  const { runMatchEngine } = require('../matchEngine');

  // The RAG school documents used to quote the hand-set salary while the school
  // card showed the measured one — $112,000 vs $143,372 for MIT in the same app.
  const docByName = new Map(SCHOOL_DOCS.map(d => [d.title, d.text]));
  const mismatched = COLLEGES.filter(c => {
    const text = docByName.get(c.name) || '';
    const m = text.match(/median earnings near \$([\d,]+)/);
    if (!m) return true;
    return Number(m[1].replace(/,/g, '')) !== medianEarnings(c).value;
  }).map(c => c.name);
  check('RAG school documents quote the measured earnings figure',
    mismatched.length === 0, mismatched.slice(0, 4).join(', '));

  // Cost of attendance must agree between the cost model, ROI and the engine.
  const costMismatch = COLLEGES.filter(c => calculateROI(c, {}).annualCost !== annualCost(c))
    .map(c => c.name);
  check('  ROI annual cost matches the cost model', costMismatch.length === 0,
    costMismatch.slice(0, 4).join(', '));

  const list = runMatchEngine({ grade: '12', gpa: '3.8', sat: '1450', major: 'Computer Science',
    country: 'China', activities: [] });
  const engineMismatch = list.filter(r => r.annualCost !== r.roi?.annualCost && r.roi)
    .map(r => r.college.name);
  check('  engine annual cost matches ROI annual cost', engineMismatch.length === 0,
    engineMismatch.slice(0, 4).join(', '));

  // A units bug once multiplied 10-year all-majors earnings by a starting-salary
  // multiplier, producing a $207,889 "median" for MIT Computer Science.
  const inflated = COLLEGES.filter(c => {
    const r = calculateROI(c, { major: 'Computer Science' });
    return r.expectedAnnualSalary > r.baseEarnings * 1.30;
  }).map(c => c.name);
  check('  major adjustment cannot inflate earnings beyond 30%',
    inflated.length === 0, inflated.slice(0, 4).join(', '));

  const maxExpected = Math.max(...COLLEGES.map(c =>
    calculateROI(c, { major: 'Computer Science' }).expectedAnnualSalary));
  check('  no school reports an implausible median salary', maxExpected < 190000,
    `max $${maxExpected.toLocaleString()}`);

  // The salary the UI prints must be the one ROI actually used.
  const salaryMismatch = COLLEGES.filter(c => {
    const roi = calculateROI(c, {});
    return roi.baseEarnings !== medianEarnings(c).value;
  }).map(c => c.name);
  check('  ROI base earnings match the measured figure', salaryMismatch.length === 0,
    salaryMismatch.slice(0, 4).join(', '));
}
console.log('');

// ── Early-round policy must match published practice ───────────
console.log('── application round policy');
{
  const { COLLEGES } = require('../collegeData');
  // Well-documented policies. Recommending ED at a school with no ED programme
  // is actively wrong advice, not a ranking nuance.
  const KNOWN = { Harvard: 'REA', Yale: 'REA', Princeton: 'REA', Stanford: 'REA',
    'Massachusetts Institute': 'EA', 'California Institute': 'EA',
    'University of Chicago': 'ED', Georgetown: 'EA', 'Notre Dame': 'REA',
    'Boston College': 'ED', Columbia: 'ED' };
  const wrong = Object.entries(KNOWN).filter(([n, exp]) => {
    const c = COLLEGES.find(x => x.name.includes(n));
    return c && c.recommendedStrategy !== exp;
  }).map(([n, exp]) => `${n} should be ${exp}`);
  check('documented early-round policies are correct', wrong.length === 0, wrong.join(' | '));

  // Public universities essentially never run binding Early Decision.
  const edPublics = COLLEGES.filter(c => c.type === 'Public' && c.recommendedStrategy === 'ED');
  check('  no public university is recommended for binding ED',
    edPublics.length === 0, edPublics.map(c => c.name).join(', '));

  // The UCs have no early round at all.
  const ucEarly = COLLEGES.filter(c => /UC |University of California/.test(c.name) &&
    ['ED', 'EA', 'REA'].includes(c.recommendedStrategy));
  check('  no UC campus is recommended for an early round',
    ucEarly.length === 0, ucEarly.map(c => c.name).join(', '));
}
console.log('');

// ── Hostile and malformed input must not 500 ───────────────────
console.log('── input robustness');
{
  const { runAnalysis, normalizeProfile } = require('../matchEngine');
  const BAD = [
    {},
    { activities: 'not-an-array' },
    { activities: { a: 1 } },
    { activities: [null, { type: 'X' }] },
    { activities: [1, 2, 3] },
    { gpa: 'abc', sat: 'nope', grade: '99' },
    { gpa: '-5', sat: '-100', budgetMax: '-1' },
    { gpa: '99', sat: '9999', toefl: '999' },
    { major: '<script>alert(1)</script>', name: '"><img src=x onerror=alert(1)>' },
    { activities: [{ type: 'X', years: 1e9 }] },
  ];
  let survived = 0; const crashed = [];
  for (const p of BAD) {
    try { analyze(p, { now: new Date('2026-08-02') }); survived++; }
    catch (e) { crashed.push(`${JSON.stringify(p).slice(0, 40)}: ${e.message}`); }
  }
  check('analyze survives malformed input', survived === BAD.length, crashed.join(' | '));
  check('  normalizeProfile always yields an activities array',
    BAD.every(p => Array.isArray(normalizeProfile(p).activities)));
  check('  runAnalysis survives a null profile',
    (() => { try { runAnalysis(null); return true; } catch { return false; } })());
}
console.log('');

// ── PDF export must survive every applicant name ───────────────
console.log('── PDF export encoding');
{
  const { generatePDF } = require('../pdfExport');
  const NAMES = ['李伟', '김민준', 'Ayşe Yılmaz', 'José García', 'Аня Иванова',
                 'राहुल शर्मा', 'محمد', 'Nguyễn Văn A', 'Student'];
  let ok = 0, failed = [];
  const run = async () => {
    for (const name of NAMES) {
      const data = analyze({
        name, grade: '12', gpa: '3.8', sat: '1450', toefl: '105',
        major: 'Computer Science', country: 'China', apCount: '10', totalAPsOffered: '18',
        awards: '全国青少年信息学奥林匹克竞赛一等奖', research: '서울대학교 연구실',
      }, { now: new Date('2026-08-02') });

      const chunks = [];
      const headers = {};
      const res = {
        headersSent: false,
        setHeader: (k, v) => { headers[k] = v; },
        send: b => chunks.push(b),
        status() { return this; },
        json: o => { failed.push(`${name}: ${o.error}`); },
      };
      try {
        await generatePDF(data, res);
        const buf = Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)));
        // Headers are latin-1 only; a raw name here threw ERR_INVALID_CHAR.
        const cd = headers['Content-Disposition'] || '';
        if (buf.length > 20000 && buf.slice(0, 5).toString() === '%PDF-' && /^[\x00-\xFF]*$/.test(cd)) ok++;
        else failed.push(`${name}: bad output`);
      } catch (e) {
        failed.push(`${name}: ${e.message}`);
      }
    }
    check('PDF exports for every script tested', ok === NAMES.length,
      failed.length ? failed.join(' | ') : `${ok}/${NAMES.length}`);
    check('  Content-Disposition stays header-safe',
      failed.every(f => !/Invalid character/.test(f)));
    console.log('');
    
// ── Destination routing and US-content gating ───────────────────
// The failure this guards against: a student applying only to Australian
// universities being told to file Early Decision and plan an H-1B lottery.
// 66 documents describe US-only mechanics and must never reach them.
console.log('── destination gating');
{
  const { runMatchEngine } = require('../matchEngine');
  const { index: idx } = require('./corpus');
  const base = { gpa: '3.9', sat: '1500', toefl: '105', major: 'Computer Science',
                 country: 'Vietnam', grade: '12', totalAPsOffered: '18', apCount: '14' };

  const EXPECT = {
    australia: ['Australia', 'New Zealand'],
    uk:        ['United Kingdom', 'Ireland'],
    canada:    ['Canada'],
    asia:      ['Hong Kong', 'Singapore', 'Japan', 'South Korea', 'Taiwan', 'Malaysia'],
  };

  for (const [dest, countries] of Object.entries(EXPECT)) {
    const list = runMatchEngine({ ...base, destination: dest });
    check(`${dest} returns schools`, list.length >= 3, `${list.length} schools`);
    check(`  ${dest} returns only ${dest} countries`,
      list.every(r => countries.includes(r.college.country)),
      [...new Set(list.map(r => r.college.country))].join(', '));
    check(`  ${dest} returns no US schools`,
      !list.some(r => r.admissionsSystem !== 'threshold'));

    // The gate itself.
    const r = analyze({ ...base, destination: dest }, { now: new Date('2026-08-02') });
    const usDocs = r.rag.documents.filter(d => {
      const doc = idx.all(x => x.id === d.id)[0];
      return doc && doc.system === 'us';
    });
    check(`  ${dest} report uses no US-only document`,
      usDocs.length === 0, usDocs.map(d => d.id).join(', '));
    check(`  ${dest} report gives no Early Decision instruction`,
      !/^Early Decision:/m.test(r.appStrategy));
    check(`  ${dest} report gives no H-1B or OPT instruction`,
      !/H-1B (cap|lottery|registration)|apply for the initial OPT|STEM extension/i.test(
        r.visaInfo + r.careerOutlook + r.timeline));
    check(`  ${dest} report still has a visa section`, (r.visaInfo || '').length > 200);
  }

  // US destination must be completely unaffected.
  const us = analyze({ ...base, destination: 'us' }, { now: new Date('2026-08-02') });
  check('US destination still gets Early Decision guidance', /^Early Decision:/m.test(us.appStrategy));
  check('  US destination still gets F-1/OPT guidance', /F-1|OPT/.test(us.visaInfo));
  check('  US destination list is all US schools',
    us.schools.every(s => s.admissionsSystem !== 'threshold'));

  // Mixed lists must carry both without either being dropped.
  const any = runMatchEngine({ ...base, destination: 'anywhere' });
  check('anywhere mixes both admissions systems',
    any.some(r => r.admissionsSystem === 'threshold') &&
    any.some(r => r.admissionsSystem !== 'threshold'),
    `${any.filter(r => r.admissionsSystem === 'threshold').length} international of ${any.length}`);

  // Threshold results must expose a requirement and must NOT carry a band.
  const au = runMatchEngine({ ...base, destination: 'australia' });
  check('  threshold results expose an entry requirement',
    au.every(r => r.entryRequirement && r.studentEquivalent));
  check('  threshold results carry no invented admitted band',
    au.every(r => r.majorBand === null));
  check('  threshold results declare provenance',
    au.every(r => ['VERIFIED', 'DERIVED'].includes(r.entryProvenance)));
}
console.log('');

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nAll checks passed.\n');
    process.exit(failures ? 1 : 0);
  };
  // Deferred to the end: this block is async and must own process exit.
  process.on('beforeExit', () => {});
  module.exports = { run };
  global.__pdfRun = run;
}

// ── The chat box ────────────────────────────────────────────────
// Questions about the student's own result are computed, not retrieved. The
// invariant that matters most: a number the chat quotes must be the number the
// report shows. computeProfileScore is now the sum of scoreBreakdown, and the
// odds the chat quotes come from the same estimateForCollege the list uses.
console.log('── chat box');
{
  const { chat, detectIntent } = require('./chat');
  const { scoreBreakdown } = require('./scoreBreakdown');
  const { computeProfileScore } = require('./ragEngine');
  const { calculateRigorIndex, scoreEC, estimateForCollege, runMatchEngine } = require('../matchEngine');
  const { COLLEGES } = require('../collegeData');

  const P = PROFILES['CS senior from China'];

  // Intent routing
  for (const [q, want] of [
    ['Why did I get this score?', 'score'],
    ['where did I lose points?', 'score'],
    ['What are my chances at Cornell?', 'odds'],
    ['Should I switch my major?', 'major'],
    ['Which schools should I apply to?', 'schools'],
    ['How do I get into a better school?', 'improve'],
    ['What happens if I get deferred?', null],
  ]) {
    check(`routes "${q.slice(0, 34)}" to ${want || 'knowledge'}`, detectIntent(q) === want, String(detectIntent(q)));
  }

  // The score the chat explains must be the score the dashboard shows.
  const rigor = calculateRigorIndex(P), ec = scoreEC(P.activities);
  const bd = scoreBreakdown(P, rigor, ec);
  check('breakdown total equals computeProfileScore', bd.total === computeProfileScore(P, rigor, ec),
    `${bd.total} vs ${computeProfileScore(P, rigor, ec)}`);
  check('  component maxima sum to 100', bd.components.reduce((n, c) => n + c.max, 0) === 100);
  check('  earned never exceeds max', bd.components.every(c => c.earned <= c.max && c.earned >= 0));

  const scoreAns = chat('Why did I get this score?', P, {});
  check('score answer is computed, not retrieved', scoreAns.kind === 'score');
  check('  quotes the dashboard score', scoreAns.answer.includes(`${bd.total}/100`), `expected ${bd.total}/100`);
  check('  names every component', bd.components.every(c => scoreAns.answer.includes(c.label)));

  // The odds the chat quotes must equal the model's own number for that school.
  const cornell = COLLEGES.find(c => /Cornell/.test(c.name));
  const est = estimateForCollege(P, cornell);
  const oddsAns = chat('What are my chances at Cornell University?', P, {});
  check('odds answer is computed', oddsAns.kind === 'odds');
  check('  quotes the engine probability', oddsAns.answer.includes(`${est.probability}%`),
    `expected ${est.probability}%`);
  check('  names the school', /Cornell/.test(oddsAns.answer));
  check('  suggests what would move it', /moves this number|no single change/i.test(oddsAns.answer));

  // Major advice must prefer adjacent subjects over unrelated ones.
  const majorAns = chat('Should I switch my major?', P, {});
  check('major answer is computed', majorAns.kind === 'major');
  check('  unrelated suggestions carry the caveat',
    !/Further afield/.test(majorAns.answer) || /different degrees/.test(majorAns.answer));

  // School recommendations must come from the student's own matched list.
  const list = runMatchEngine(P).map(r => r.college.name);
  const schoolAns = chat('Which schools should I apply to?', P, {});
  check('school answer is computed', schoolAns.kind === 'schools');
  check('  recommends only schools from the matched list',
    (schoolAns.answer.match(/^• ([^—]+) —/gm) || [])
      .every(m => list.some(n => m.includes(n.slice(0, 18)))));

  check('improve answer is computed', chat('How do I improve my chances?', P, {}).kind === 'improve');

  // Result questions without a profile must say so rather than inventing one.
  const blank = chat('Why did I get this score?', {}, {});
  check('no-profile case is handled', blank.kind === 'no-profile' && /run an analysis/i.test(blank.answer));
  check('  knowledge questions still work without a profile',
    chat('What happens if I get deferred?', {}, {}).answer.length > 150);

  // Nothing may leak an unfilled placeholder, and every answer must be usable.
  for (const q of ['Why did I get this score?', 'What are my chances at Cornell University?',
                   'Should I switch my major?', 'Which schools should I apply to?',
                   'How do I get into a better school?', 'What happens if I get deferred?']) {
    const a = chat(q, P, {});
    check(`answers "${q.slice(0, 30)}"`, a.success && a.answer.length > 120);
    check('  no unfilled placeholder', !/\{\{|\}\}/.test(a.answer));
  }

  const t0 = Date.now();
  chat('Should I switch my major?', P, {});
  check('major comparison runs fast enough for a chat', Date.now() - t0 < 400, `${Date.now() - t0}ms`);
}
console.log('');

// ── Deployment safety ───────────────────────────────────────────
// This app is meant to face the open internet, and the folder it lives in also
// holds three live API keys and four unrelated projects. These checks fail
// loudly if the protections against shipping them are removed.
console.log('── deployment safety');
{
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '../..');
  const S = require('../security');

  // The CSP must keep allowing inline event handlers. helmet's default is
  // script-src-attr 'none', which silently kills every onclick= on the page —
  // the UI looked fine and no button worked.
  let csp = '';
  S.securityHeaders({ headers: {} }, {
    setHeader: (k, v) => { if (/content-security-policy/i.test(k)) csp = v; },
    removeHeader: () => {}, getHeader: () => undefined,
  }, () => {});
  check('CSP allows inline event handlers', /script-src-attr 'unsafe-inline'/.test(csp),
    'helmet defaults to none, which breaks every onclick on the page');
  check('  CSP allows the Google Fonts stylesheet', /fonts\.googleapis\.com/.test(csp));
  check('  CSP confines network calls to this origin', /connect-src 'self'/.test(csp));
  check('  CSP forbids framing', /frame-ancestors 'none'/.test(csp));

  // Corpus dump stays off in production — it is the product.
  const realEnv = process.env.NODE_ENV, realDebug = process.env.RAG_DEBUG;
  process.env.NODE_ENV = 'production'; delete process.env.RAG_DEBUG;
  check('corpus dump route is off in production', S.debugRoutesEnabled() === false);
  process.env.RAG_DEBUG = '1';
  check('  but can be re-enabled deliberately', S.debugRoutesEnabled() === true);
  process.env.NODE_ENV = realEnv; if (realDebug === undefined) delete process.env.RAG_DEBUG; else process.env.RAG_DEBUG = realDebug;

  // Input caps.
  const dirty = { __proto__: { bad: 1 }, constructor: { bad: 1 },
                  gpa: 'x'.repeat(99999), activities: new Array(9999).fill({ type: 'x' }) };
  const clean = S.sanitizeProfile(dirty);
  check('sanitizer drops prototype keys',
    !Object.prototype.hasOwnProperty.call(clean, 'constructor') && clean.bad === undefined);
  check('  caps very long strings', clean.gpa.length <= S.MAX_STRING);
  check('  caps very long arrays', clean.activities.length <= S.MAX_ACTIVITIES);
  check('  body limit is well under the old 5mb', S.BODY_LIMIT === '1mb');

  // Errors must not leak internals once live.
  process.env.NODE_ENV = 'production';
  let sent = null;
  // safeError logs the real stack server-side on purpose; muted here so the
  // test output stays readable.
  const realErr = console.error; console.error = () => {};
  S.safeError({ headersSent: false, status() { return this; }, json(o) { sent = o; } },
    new Error('ENOENT: /Users/someone/secret/path.js'), 'test');
  console.error = realErr;
  check('production errors do not leak internals',
    sent && !/\/Users\/|ENOENT/.test(sent.error), sent && sent.error);
  process.env.NODE_ENV = realEnv;

  // The things that must never ship.
  const gi = fs.existsSync(path.join(root, '.gitignore'))
    ? fs.readFileSync(path.join(root, '.gitignore'), 'utf8') : '';
  for (const must of ['.env', 'trend/', 'ultrawork/', 'server.js', 'node_modules/', '.claude/']) {
    check(`.gitignore excludes ${must}`, gi.split('\n').some(l => l.trim() === must));
  }

  // The public server must not be able to reach an API key even by accident.
  const serverSrc = fs.readFileSync(path.join(root, 'server-rag.js'), 'utf8');
  check('public server never references an API key',
    !/ANTHROPIC|api[_-]?key/i.test(serverSrc));
  check('  and does not load the Anthropic SDK', !/@anthropic-ai/.test(serverSrc));

  // No personal data anywhere in what ships.
  const shipped = ['server-rag.js', 'public/index.html', 'package.json'];
  for (const f of shipped) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    check(`${f} carries no personal path or email`,
      !/\/Users\/[a-z]/i.test(txt) && !/szhanhong|suzhanhong/i.test(txt));
  }

  // ── Phone layout ──────────────────────────────────────────────
  // On a 360px Android screen the page was 519px wide, so the whole site
  // scrolled sideways and the tier badges were clipped mid-word. Each rule
  // below fixes one cause; losing any of them brings the bug back, and it is
  // invisible unless someone opens the site on a phone.
  {
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const mq = html.slice(html.indexOf('@media(max-width:430px)'));
    const block = mq.slice(0, mq.indexOf('\n}') + 2);
    check('a small-phone media query exists', html.includes('@media(max-width:430px)'));
    check('  tab strip can shrink (flex min-width:auto is what broke it)',
      /\.nav-tabs\s*{[^}]*min-width:0/.test(block));
    check('  tab strip gets its own row so tabs are not clipped',
      /\.nav-tabs\s*{[^}]*flex:1 1 100%/.test(block));
    check('  page top padding clears the taller two-row header',
      /\.page\s*{[^}]*padding-top:116px/.test(block));
    check('  school card header wraps so the tier badge is not cut off',
      /\.school-header\s*{[^}]*flex-wrap:wrap/.test(block));
    check('  score rows stack instead of forcing a 130px label',
      /\.score-row \.lbl\s*{[^}]*min-width:0/.test(block));
    check('  nothing can force the page wider than the screen',
      /overflow-x:hidden/.test(block));
    check('  the viewport meta tag is present', /name="viewport"[^>]*width=device-width/.test(html));
    check('  the logo is a cached file, not re-inlined as base64',
      !/data:image\/png;base64/.test(html) && /src="\/logo\.png"/.test(html));
  }

  // Launch polish that is invisible to tests but obvious to a visitor.
  for (const f of ['favicon.ico', 'apple-touch-icon.png', 'logo.png', 'robots.txt', 'sitemap.xml']) {
    check(`public/${f} ships`, fs.existsSync(path.join(root, 'public', f)));
  }
  {
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    check('the page declares a tab icon', /rel="icon"/.test(html));
    check('  and a home-screen icon for phones', /apple-touch-icon/.test(html));
    check('  and tells students their answers are not stored',
      /nothing is saved on our server/i.test(html));
    const server = fs.readFileSync(path.join(root, 'server-rag.js'), 'utf8');
    check('unknown URLs return a real 404, not the homepage',
      /res\.status\(404\)/.test(server) && !/app\.get\('\*'/.test(server),
      'a 200 for a missing page is a soft 404 and Google marks the site down for it');
  }

  // ── Guide pages (the SEO content) ───────────────────────────
  // The tool is one page with almost no text, which Google ranks badly however
  // good it is. These pages are the only thing giving it something to read, and
  // they are generated — so a data fix must regenerate them, not orphan them.
  {
    const guideDir = path.join(root, 'public/guide');
    check('guide pages are generated', fs.existsSync(guideDir));
    const files = fs.existsSync(guideDir) ? fs.readdirSync(guideDir).filter(f => f.endsWith('.html')) : [];
    check(`  at least 10 guide pages exist`, files.length >= 10, `${files.length} pages`);
    check('  the pillar comparison page exists',
      files.includes('acceptance-rate-by-major.html'));
    check('  there is an index linking them', files.includes('index.html'));

    for (const f of files.slice(0, 6)) {
      const h = fs.readFileSync(path.join(guideDir, f), 'utf8');
      check(`  ${f.slice(0, 30)} has a unique title and description`,
        /<title>[^<]{25,}<\/title>/.test(h) && /<meta name="description" content="[^"]{60,}"/.test(h));
      check(`    …links back to the tool`, /href="\/"/.test(h));
      // Only pages that actually contain a table need the scroll wrapper —
      // the guide index is a list of links.
      if (/<table/.test(h)) {
        check(`    …tables scroll rather than widening the page`, /class="tscroll"/.test(h));
      }
    }

    // Pages are built from published figures only. Shipping modelled estimates
    // as published fact on a public page would be the worst kind of SEO.
    const { VERIFIED } = require('../data/majorAdmissions');
    check('  one page per school with PUBLISHED by-major data',
      files.length >= VERIFIED.length, `${files.length} pages vs ${VERIFIED.length} sourced schools`);

    const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
    check('  sitemap lists the guides', (sitemap.match(/<loc>/g) || []).length >= 10);
    check('  the deploy build regenerates them',
      /build-content\.js/.test(fs.readFileSync(path.join(root, 'scripts/build-deploy.sh'), 'utf8')));
  }

  // ── Analytics is opt-in and must not leak into the committed files ──
  {
    const realP = process.env.PLAUSIBLE_DOMAIN, realC = process.env.CF_ANALYTICS_TOKEN;
    delete process.env.PLAUSIBLE_DOMAIN; delete process.env.CF_ANALYTICS_TOKEN;
    check('analytics is off unless configured', S.analyticsSnippet() === '' && S.analyticsHosts().length === 0);
    process.env.CF_ANALYTICS_TOKEN = 'tok123';
    check('  one env var turns it on', /cloudflareinsights/.test(S.analyticsSnippet()));
    check('  and CSP is widened to match, or the browser blocks it',
      S.analyticsHosts().some(h => /cloudflareinsights/.test(h)));
    delete process.env.CF_ANALYTICS_TOKEN;
    if (realP) process.env.PLAUSIBLE_DOMAIN = realP;
    if (realC) process.env.CF_ANALYTICS_TOKEN = realC;

    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    check('  no analytics token is committed in the HTML',
      !/cloudflareinsights|plausible\.io/.test(html));
  }

  check('a deploy build script exists', fs.existsSync(path.join(root, 'scripts/build-deploy.sh')));
  check('  robots.txt ships', fs.existsSync(path.join(root, 'public/robots.txt')));
  check('  the page has a search-result title and description',
    /<meta name="description"/.test(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')));
}
console.log('');

console.log('── question answering');
const QUESTIONS = [
  'Should I apply early decision or early action?',
  'How do I improve my chances at MIT?',
  'What can I do about my low TOEFL score?',
  'Can I stay and work in the US after graduation?',
  'Which schools are need-blind for international students?',
  'asdfgh qwerty zxcvb',
];
for (const q of QUESTIONS) {
  const a = answer(q, PROFILES['CS senior from China'], {});
  check(`answers: "${q.slice(0, 40)}"`, a.success && a.answer.length > 150);
  check('  no unfilled placeholder', !/\{\{|\}\}/.test(a.answer));
}
const mit = answer('How do I improve my chances at MIT?', PROFILES['CS senior from China'], {});
check('names MIT when MIT is asked about', /Massachusetts Institute of Technology/.test(mit.answer));

// Determinism: the same input must always produce the same report.
const a1 = analyze(PROFILES['CS senior from China'], { now: new Date('2026-08-02') });
const a2 = analyze(PROFILES['CS senior from China'], { now: new Date('2026-08-02') });
check('\ndeterministic across runs', SECTIONS.every(s => a1[s] === a2[s]));

// The PDF block is async and prints the final summary itself.
global.__pdfRun();

// ── Threshold-admission universities (non-US QS top 200) ────────
// These schools do not admit the way US schools do. The tests below guard the
// two things most likely to go wrong: a fabricated US-style number appearing on
// a school that publishes none, and the below-threshold cliff that the US model
// already had to have fixed once.
console.log('── threshold admissions');
{
  const { INTERNATIONAL_SCHOOLS } = require('../data/internationalSchools');
  const { thresholdProbability, classifyThresholdTier, convertProfile } =
    require('../thresholdAdmissions');
  const pick = n => INTERNATIONAL_SCHOOLS.find(s => s.name.includes(n));

  check('international schools loaded', INTERNATIONAL_SCHOOLS.length >= 60,
    `${INTERNATIONAL_SCHOOLS.length} schools`);
  check('  no mainland China schools included',
    !INTERNATIONAL_SCHOOLS.some(s => s.country === 'China'),
    INTERNATIONAL_SCHOOLS.filter(s => s.country === 'China').map(s => s.name).join(', '));
  check('  Hong Kong is included as instructed',
    INTERNATIONAL_SCHOOLS.some(s => s.country === 'Hong Kong'));
  check('  every school declares an admissions system and visa system',
    INTERNATIONAL_SCHOOLS.every(s => s.admissionsSystem === 'threshold' && s.visaSystem));
  check('  every school declares entry provenance',
    INTERNATIONAL_SCHOOLS.every(s => ['VERIFIED', 'DERIVED'].includes(s.entry.provenance)));

  // The whole point of the separate schema: no invented US-style figures.
  const fabricated = INTERNATIONAL_SCHOOLS.filter(s =>
    s.acceptanceRate != null || s.intlAcceptanceRate != null ||
    s.satRange != null || s.gpaRange != null || s.recommendedStrategy != null);
  check('  no fabricated US-style admit rate or SAT band on any of them',
    fabricated.length === 0, fabricated.map(s => s.name).join(', '));

  // Clearing a published bar should be worth a lot more than it is in the US
  // model — that is the real difference between the two systems.
  const melb = pick('Melbourne');
  const strong = thresholdProbability({ gpa: '4.0', toefl: '100' }, melb);
  check('  meeting the published requirement is a strong position',
    strong.probability >= 70 && strong.meetsThreshold, `${strong.probability}%`);

  // ...but not at the handful of places that reject most qualified applicants.
  const ox = thresholdProbability({ gpa: '4.0', toefl: '110' }, pick('Oxford'));
  check('  except where qualified applicants are still mostly rejected',
    ox.probability <= 30, `Oxford = ${ox.probability}%`);
  check('    and Oxford is not labelled a safety for a perfect profile',
    classifyThresholdTier(ox, pick('Oxford')).tier === 'reach');

  // The below-threshold tail must decay smoothly. A-level grades rounding to
  // whole steps previously made Nottingham drop 85% -> 2.5% across 0.3 GPA.
  {
    const nott = pick('Nottingham');
    const ps = ['4.0', '3.8', '3.6', '3.4', '3.2'].map(g =>
      thresholdProbability({ gpa: g, toefl: '100' }, nott).probability);
    check('  below-threshold odds decay smoothly, not in cliffs',
      ps.every((v, i) => i === 0 || v < ps[i - 1]) &&
      ps.every((v, i) => i === 0 || ps[i - 1] / Math.max(v, 0.1) < 8),
      ps.join(' → '));
  }

  // Grade conversion has to be monotone or the whole ordering is meaningless.
  for (const scale of ['IB', 'percentage', 'A-level']) {
    const vals = ['4.0', '3.7', '3.4', '3.0', '2.6'].map(g => convertProfile({ gpa: g }, scale).value);
    check(`  ${scale} conversion is monotone in GPA`,
      vals.every((v, i) => i === 0 || v <= vals[i - 1]), vals.join(' ≥ '));
  }
  check('  conversions are flagged as estimates',
    convertProfile({ gpa: '3.8' }, 'IB').estimated === true);

  // Cheap sanity on the cost data: these countries are mostly cheaper than the
  // US, and a zero would silently break ROI.
  check('  every school carries a positive or explicitly-zero tuition figure',
    INTERNATIONAL_SCHOOLS.every(s => typeof s.tuitionUSD === 'number' && s.tuitionUSD >= 0));
}
console.log('');
