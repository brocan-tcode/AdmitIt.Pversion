// src/data/buildOutcomes.js
// Regenerates src/data/outcomes.js from College Scorecard records.
//
//   node src/data/buildOutcomes.js <path-to-scorecard-records.json>
//
// The input is the raw `results` arrays from
// https://api.data.gov/ed/collegescorecard/v1/schools concatenated into one
// JSON array. College Scorecard is US Department of Education data — the same
// source the government publishes for its own consumer college search — which
// makes it the authoritative replacement for the hand-set `medianSalary` and
// `fitMetrics` values that previously drove ROI and fit scoring.
//
// Nothing here is written by hand: run the script again when a new cohort is
// released and the generated file is replaced wholesale.

const fs = require('fs');
const path = require('path');
const { COLLEGES } = require('../collegeData');

// Scorecard uses IPEDS naming; the database uses common names.
const ALIAS = {
  'UCLA': 'University of California-Los Angeles',
  'UC Berkeley': 'University of California-Berkeley',
  'UC San Diego': 'University of California-San Diego',
  'UC Davis': 'University of California-Davis',
  'UC Irvine': 'University of California-Irvine',
  'UC Santa Barbara': 'University of California-Santa Barbara',
  'Georgia Tech': 'Georgia Institute of Technology-Main Campus',
  'Massachusetts Institute of Technology (MIT)': 'Massachusetts Institute of Technology',
  'California Institute of Technology (Caltech)': 'California Institute of Technology',
  'University of Pennsylvania (UPenn)': 'University of Pennsylvania',
  'New York University (NYU)': 'New York University',
  'UT Dallas': 'The University of Texas at Dallas',
  'University of Texas at Austin': 'The University of Texas at Austin',
  'Texas A&M University': 'Texas A & M University-College Station',
  'Virginia Tech': 'Virginia Polytechnic Institute and State University',
  'Penn State University': 'Pennsylvania State University-Main Campus',
  'Ohio State University': 'Ohio State University-Main Campus',
  'Rutgers University': 'Rutgers University-New Brunswick',
  'Purdue University': 'Purdue University-Main Campus',
  'Indiana University Bloomington': 'Indiana University-Bloomington',
  'University of Michigan': 'University of Michigan-Ann Arbor',
  'University of Minnesota': 'University of Minnesota-Twin Cities',
  'University of Maryland': 'University of Maryland-College Park',
  'University of Pittsburgh': 'University of Pittsburgh-Pittsburgh Campus',
  'University of Washington': 'University of Washington-Seattle Campus',
  'University of Wisconsin-Madison': 'University of Wisconsin-Madison',
  'University of North Carolina at Chapel Hill': 'University of North Carolina at Chapel Hill',
  'Stony Brook University': 'Stony Brook University',
  'University of Miami': 'University of Miami',
  'Arizona State University': 'Arizona State University Campus Immersion',
  'Michigan State University': 'Michigan State University',
  'North Carolina State University': 'North Carolina State University at Raleigh',
  // Ambiguous without an alias — several institutions share a prefix.
  'Brown University': 'Brown University',
  'Trinity College (CT)': 'Trinity College',
  'Columbia University': 'Columbia University in the City of New York',
  'Tulane University': 'Tulane University of Louisiana',
  'University of Southern California (USC)': 'University of Southern California',
  'Rensselaer Polytechnic Institute (RPI)': 'Rensselaer Polytechnic Institute',
  'Worcester Polytechnic Institute (WPI)': 'Worcester Polytechnic Institute',
};

const norm = s => String(s).toLowerCase()
  .replace(/\band\b/g, '&')
  .replace(/[^a-z0-9&]/g, '');

function match(college, byNorm) {
  const target = ALIAS[college.name] || college.name;
  const exact = byNorm.get(norm(target));
  if (exact) return { rec: exact, how: ALIAS[college.name] ? 'alias' : 'exact' };

  // Fall back to PREFIX containment only. Plain substring matching bound
  // "Brown University" to "John Brown University" in Arkansas — a different
  // school in a different state, silently importing its earnings. A candidate
  // may extend the target ("Columbia University in the City of New York") or be
  // extended by it ("University of Southern California (USC)"), but it may not
  // carry extra leading words.
  const k = norm(target);
  let best = null;
  for (const [n, rec] of byNorm) {
    if (n === k || n.startsWith(k) || k.startsWith(n)) {
      // Prefer the closest length so "Purdue University" does not take
      // "Purdue University Northwest" when the main campus is present.
      const delta = Math.abs(n.length - k.length);
      if (!best || delta < best.delta) best = { n, rec, delta };
    }
  }
  return best ? { rec: best.rec, how: 'fuzzy' } : null;
}

/** Simpson diversity index over the reported race/ethnicity shares, 0–1. */
function diversityIndex(r) {
  const shares = [
    r['latest.student.demographics.race_ethnicity.white'],
    r['latest.student.demographics.race_ethnicity.black'],
    r['latest.student.demographics.race_ethnicity.hispanic'],
    r['latest.student.demographics.race_ethnicity.asian'],
    r['latest.student.demographics.race_ethnicity.non_resident_alien'],
  ].filter(v => typeof v === 'number');
  if (shares.length < 3) return null;
  const other = Math.max(0, 1 - shares.reduce((a, b) => a + b, 0));
  const all = [...shares, other];
  return Math.round((1 - all.reduce((a, p) => a + p * p, 0)) * 1000) / 1000;
}

function build(recordsPath) {
  const raw = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
  const byNorm = new Map();
  for (const r of raw) {
    const n = norm(r['school.name']);
    // Prefer the record with earnings data when names collide.
    if (!byNorm.has(n) || (!byNorm.get(n)['latest.earnings.10_yrs_after_entry.median'] &&
                            r['latest.earnings.10_yrs_after_entry.median'])) {
      byNorm.set(n, r);
    }
  }

  const out = {};
  const missing = [];
  const howCount = { exact: 0, alias: 0, fuzzy: 0 };

  for (const c of COLLEGES) {
    const m = match(c, byNorm);
    if (!m) { missing.push(c.name); continue; }
    howCount[m.how]++;
    const r = m.rec;
    out[c.name] = {
      ipeds:       r.id,
      scorecard:   r['school.name'],
      earnings10:  r['latest.earnings.10_yrs_after_entry.median'] ?? null,
      earnings6:   r['latest.earnings.6_yrs_after_entry.median'] ?? null,
      retention:   r['latest.student.retention_rate.four_year.full_time'] ?? null,
      completion:  r['latest.completion.completion_rate_4yr_150nt'] ?? null,
      carnegie:    r['school.carnegie_basic'] ?? null,
      intlShare:   r['latest.student.demographics.race_ethnicity.non_resident_alien'] ?? null,
      diversity:   diversityIndex(r),
      size:        r['latest.student.size'] ?? null,
      match:       m.how,
    };
  }

  const body = `// src/data/outcomes.js
// GENERATED FILE — do not hand-edit. Regenerate with:
//   node src/data/buildOutcomes.js <scorecard-records.json>
//
// Source: US Department of Education College Scorecard
// (api.data.gov/ed/collegescorecard). These are measured institutional
// outcomes, and they replace the hand-set \`medianSalary\` and \`fitMetrics\`
// values that previously drove the ROI engine and the fit score.
//
//   earnings10 / earnings6  median earnings 10 and 6 years after entry, USD
//   retention               first-year full-time retention rate, 0-1
//   completion              4-year completion rate (150% time), 0-1
//   carnegie                Carnegie basic classification (15 = R1 very high
//                           research activity, 16 = R2, 17 = R3/doctoral)
//   intlShare               non-resident alien share of enrolment, 0-1
//   diversity               Simpson index over reported race/ethnicity, 0-1
//
// Coverage: ${Object.keys(out).length} of ${COLLEGES.length} schools.
${missing.length ? `// Unmatched: ${missing.join(', ')}\n` : ''}
const OUTCOMES = ${JSON.stringify(out, null, 2)};

module.exports = { OUTCOMES };
`;

  const dest = path.join(__dirname, 'outcomes.js');
  fs.writeFileSync(dest, body);

  const withEarnings = Object.values(out).filter(o => o.earnings10).length;
  const withRetention = Object.values(out).filter(o => o.retention).length;
  console.log(`wrote ${dest}`);
  console.log(`  matched ${Object.keys(out).length}/${COLLEGES.length} schools (${howCount.exact} exact, ${howCount.alias} alias, ${howCount.fuzzy} fuzzy)`);
  console.log(`  with earnings: ${withEarnings} | with retention: ${withRetention}`);
  if (missing.length) console.log(`  unmatched (${missing.length}): ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`);
}

if (require.main === module) {
  const p = process.argv[2];
  if (!p) { console.error('usage: node src/data/buildOutcomes.js <scorecard-records.json>'); process.exit(1); }
  build(p);
}

module.exports = { build, diversityIndex, ALIAS };
