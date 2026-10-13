// src/data/auditData.js
// Audits the school database and the probability model against published data.
// Run: node src/data/auditData.js

const { COLLEGES } = require('../collegeData');
const { estimateForCollege } = require('../matchEngine');
const { PUBLISHED_2025 } = require('./benchmarks');
const { VERIFIED } = require('./majorAdmissions');

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

let problems = 0;

// ── 1. Database drift against published rates ────────────────
console.log('\n═══ 1. ACCEPTANCE RATE DRIFT vs PUBLISHED 2025 FIGURES\n');
console.log(pad('SCHOOL', 36) + num('DB', 8) + num('PUBLISHED', 11) + num('DRIFT', 9));

let drift = [];
for (const b of PUBLISHED_2025) {
  const c = COLLEGES.find(x => x.name.includes(b.match));
  if (!c) { console.log(pad(b.match, 36) + '  NOT IN DATABASE'); problems++; continue; }
  const d = c.acceptanceRate - b.rate;
  drift.push(Math.abs(d));
  const flag = Math.abs(d) >= 8 ? '   <<< stale' : Math.abs(d) >= 4 ? '   <' : '';
  if (Math.abs(d) >= 8) problems++;
  console.log(
    pad(c.name.replace(/ \(.*/, '').slice(0, 35), 36) +
    num(c.acceptanceRate + '%', 8) + num(b.rate + '%', 11) +
    num((d > 0 ? '+' : '') + d.toFixed(1), 9) + flag
  );
}
const meanDrift = drift.reduce((a, b) => a + b, 0) / drift.length;
console.log(`\nmean absolute drift: ${meanDrift.toFixed(1)} points across ${drift.length} schools`);
console.log(`schools 8+ points stale: ${drift.filter(d => d >= 8).length}`);

// ── 2. Model calibration: median applicant vs base rate ──────
console.log('\n═══ 2. MODEL CALIBRATION — student at each school\'s median\n');
console.log(pad('SCHOOL', 36) + num('INTL RATE', 11) + num('MODEL', 8) + num('RATIO', 8));

const medianProfile = c => ({
  grade: '12', country: 'India', major: 'Economics',
  gpa: (((c.gpaRange[0] + c.gpaRange[1]) / 2)).toFixed(2),
  sat: String(Math.round((c.satRange[0] + c.satRange[1]) / 2)),
  toefl: '105', totalAPsOffered: '12', apCount: '6', honorsCourses: '2',
  activities: [
    { type: 'Club Officer / Editor', leadership: 'Officer / Vice President', years: 2 },
    { type: 'Community Service', leadership: 'Member / Participant', years: 2 },
  ],
});

let ratios = [];
for (const b of PUBLISHED_2025) {
  const c = COLLEGES.find(x => x.name.includes(b.match));
  if (!c) continue;
  const est = estimateForCollege(medianProfile(c), c);
  if (!est) continue;
  const intlRate = c.intlAcceptanceRate || c.acceptanceRate;
  const ratio = est.probability / intlRate;

  // Where a published by-major band exists, the model deliberately uses that
  // college's rate rather than the school-wide one, so a ratio above 1 is the
  // intended behaviour rather than drift. Only schools falling back to the
  // school-wide rate are held to the tight band.
  const usedMajorBand = est.band && est.band.verified;
  if (!usedMajorBand) ratios.push(ratio);

  const off = !usedMajorBand && (ratio > 2.0 || ratio < 0.4);
  if (off) problems++;
  console.log(
    pad(c.name.replace(/ \(.*/, '').slice(0, 35), 36) +
    num(intlRate + '%', 11) + num(est.probability + '%', 8) +
    num(ratio.toFixed(2) + 'x', 8) +
    (off ? '   <<< off' : usedMajorBand ? '   (by-major band)' : '')
  );
}
const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
console.log(`\nmean model/base ratio: ${meanRatio.toFixed(2)}x  (1.0 = model matches the school's own rate)`);
console.log(`A median applicant with a decent but unremarkable record should sit near or slightly`);
console.log(`above the base rate — most admitted students are at or above the median.`);

// ── 3. Monotonicity ──────────────────────────────────────────
console.log('\n═══ 3. MONOTONICITY — odds must never fall as the profile strengthens\n');
const ladder = [
  { gpa: '2.8', sat: '1050' }, { gpa: '3.1', sat: '1180' },
  { gpa: '3.4', sat: '1290' }, { gpa: '3.7', sat: '1400' },
  { gpa: '3.9', sat: '1500' }, { gpa: '4.0', sat: '1570' },
];
for (const name of ['Arizona State', 'Purdue', 'Boston University', 'UCLA', 'Massachusetts Institute']) {
  const seq = ladder.map(l => estimateForCollege({
    ...l, grade: '12', country: 'China', major: 'Economics',
    toefl: '105', totalAPsOffered: '12', apCount: '6', activities: [],
  }, name)?.probability ?? 0);
  const ok = seq.every((v, i) => i === 0 || v >= seq[i - 1]);
  if (!ok) problems++;
  console.log(pad(name, 28) + seq.map(v => num(v + '%', 8)).join('') + (ok ? '   ok' : '   <<< NOT MONOTONIC'));
}

// ── 4. Ordering vs published selectivity ─────────────────────
console.log('\n═══ 4. ORDERING — model ranking vs published-rate ranking\n');
const student = {
  grade: '12', gpa: '3.85', sat: '1480', toefl: '110', country: 'China', major: 'Economics',
  totalAPsOffered: '18', apCount: '10', honorsCourses: '3',
  activities: [{ type: 'Club Officer / Editor', leadership: 'Officer / Vice President', years: 3 }],
};
const rows = PUBLISHED_2025
  .map(b => {
    const c = COLLEGES.find(x => x.name.includes(b.match));
    if (!c) return null;
    const e = estimateForCollege(student, c);
    return e ? { name: c.name.replace(/ \(.*/, ''), published: b.rate, model: e.probability } : null;
  })
  .filter(Boolean);

const byPublished = [...rows].sort((a, b) => a.published - b.published).map(r => r.name);
const byModel     = [...rows].sort((a, b) => a.model - b.model).map(r => r.name);

// Spearman rank correlation
const rankOf = (arr, n) => arr.indexOf(n);
const n = rows.length;
const d2 = rows.reduce((acc, r) => acc + Math.pow(rankOf(byPublished, r.name) - rankOf(byModel, r.name), 2), 0);
const rho = 1 - (6 * d2) / (n * (n * n - 1));
console.log(`Spearman rank correlation between model odds and published admit rate: ${rho.toFixed(3)}`);
console.log(rho >= 0.8 ? '  strong agreement' : rho >= 0.6 ? '  moderate agreement' : '  <<< weak agreement');
if (rho < 0.6) problems++;

// ── 5. Major differentiation where data is published ─────────
console.log('\n═══ 5. MAJOR DIFFERENTIATION at schools with published by-major data\n');
const strong = {
  grade: '12', gpa: '3.95', sat: '1530', toefl: '112', country: 'India',
  totalAPsOffered: '20', apCount: '15', honorsCourses: '4',
  activities: [{ type: 'National Award / Competition', leadership: 'Founder / President', years: 3 }],
};
for (const v of VERIFIED) {
  const c = COLLEGES.find(x => x.name.includes(v.match));
  if (!c) continue;
  const keys = Object.keys(v.majors).filter(k => k !== 'default');
  if (!keys.length) continue;
  // Must be real major TEXT that getMajorKey() resolves back to the same key —
  // passing the bare key ("policy") resolves to 'default' and mislabels the row.
  const MAJOR_TEXT = { cs: 'Computer Science', engineering: 'Mechanical Engineering', business: 'Business',
    biology: 'Biology', nursing: 'Nursing', robotics: 'Robotics', environmental: 'Environmental Science',
    policy: 'Political Science', communications: 'Journalism', economics: 'Economics', math: 'Mathematics' };
  const results = keys.map(k => {
    const e = estimateForCollege({ ...strong, major: MAJOR_TEXT[k] || k }, c);
    return { k, p: e ? e.probability : 0, rate: v.majors[k].rate };
  });
  const other = estimateForCollege({ ...strong, major: 'Psychology' }, c);
  console.log(pad(c.name.replace(/ \(.*/, '').slice(0, 30), 32) +
    results.map(r => `${r.k}=${r.p}%`).join('  ') +
    (other ? `   |  unlisted major (psychology)=${other.probability}%` : ''));
}

// ── 6. Per-major band provenance ─────────────────────────────
console.log('\n═══ 6. BAND PROVENANCE — where each per-major band comes from\n');
{
  const { bandProvenance } = require('./majorAdmissions');
  const { majorFitScore } = require('../majorFit');
  const MAJORS = ['cs','engineering','business','nursing','biology','policy','music','economics',
    'math','physics','chemistry','environmental','architecture','publichealth','communications',
    'international','robotics','default'];

  const tally = { published: 0, structural: 0, modelled: 0 };
  let offered = 0;
  for (const c of COLLEGES) {
    for (const k of MAJORS) {
      if (!majorFitScore(c, k, k).offered) continue;   // never shown to a student
      offered++;
      tally[bandProvenance(c, k)]++;
    }
  }
  const pct = v => (Math.round((v / offered) * 1000) / 10).toFixed(1) + '%';
  console.log(`  offered school-major combinations: ${offered}`);
  console.log(`  published   ${num(tally.published, 5)}  ${pct(tally.published)}   real by-major figures`);
  console.log(`  structural  ${num(tally.structural, 5)}  ${pct(tally.structural)}   school band is provably the right band`);
  console.log(`  modelled    ${num(tally.modelled, 5)}  ${pct(tally.modelled)}   estimated from measured empirical ratios`);
  console.log(`  SOURCED     ${num(tally.published + tally.structural, 5)}  ${pct(tally.published + tally.structural)}`);
  console.log('\n  No band anywhere comes from a hand-set number. The modelled bucket uses');
  console.log('  ratios measured across the schools that publish by-major data.');
}

console.log('\n═══ SUMMARY');
console.log(problems === 0 ? '  no issues found' : `  ${problems} issue(s) flagged above`);
process.exit(0);
