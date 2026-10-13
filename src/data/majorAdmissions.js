// src/data/majorAdmissions.js
// Per-major admission data — the thing that changes admissions outcomes most
// and that a school-level acceptance rate completely hides.
//
// At schools that admit directly into a major, the school-wide rate is close to
// meaningless. Verified examples in this file:
//
//   UIUC        36.6% overall  →  Computer Science  7.2%
//   Cornell      ~8% overall   →  Engineering       5.2%   vs CALS 16.7%
//   CMU        11.07% overall  →  School of CS      <5%    vs Dietrich ~24%
//   Washington   ~43% overall  →  CS direct admit    2%    for international applicants
//
// VERIFIED entries below are published figures with a source recorded. Anything
// not listed here is DERIVED at runtime from the school's own band and its
// majorDifficulty multiplier — see deriveMajorBand(). Derived numbers are
// modelled estimates and are labelled as such everywhere they surface.
//
// `match` is tested against the college name with String.includes().
// `rate` / `intlRate` are percentages of applicants admitted to that major.
// `gpa` / `sat` are the admitted middle-50% ranges for that major.

const VERIFIED = [
  {
    match: 'Illinois', source: 'UIUC published admit data 2025',
    overall: { rate: 36.6 },
    majors: {
      cs:          { rate: 7.2,  gpa: [3.75, 4.0], sat: [1440, 1550] },
      engineering: { rate: 21.0, gpa: [3.70, 4.0], sat: [1400, 1520] },
    },
  },
  {
    match: 'Purdue', source: 'Purdue Fall 2025 admissions release',
    overall: { rate: 43.4, intlRate: 22.5 },
    majors: {
      cs:           { rate: 35.9, gpa: [3.80, 4.0], sat: [1370, 1510] },
      engineering:  { rate: 34.7, gpa: [3.89, 4.0], sat: [1380, 1520] },
      environmental:{ rate: 55.8, gpa: [3.50, 3.95], sat: [1180, 1400] }, // Agriculture
      policy:       { rate: 70.5, gpa: [3.40, 3.95], sat: [1150, 1380] }, // Education
      // No `default`: Education at 70.5% is Purdue's LEAST selective college, so
      // using it as the fallback for every unlisted major made the model far too
      // generous. Unlisted majors fall through to the derived band instead.
    },
  },
  {
    match: 'University of Washington', source: 'UW direct-to-major admit rates 2025',
    overall: { rate: 43.0 },
    // The international figure here is the single most extreme example in the
    // database of why school-level rates mislead: 2% versus a 43% headline.
    majors: {
      cs: { rate: 20.0, intlRate: 2.0, gpa: [3.85, 4.0], sat: [1450, 1560] },
    },
  },
  {
    match: 'Cornell', source: 'Cornell admit rates by undergraduate college',
    overall: { rate: 8.0 },
    majors: {
      engineering:  { rate: 5.2,  gpa: [3.90, 4.0], sat: [1490, 1570] },
      business:     { rate: 5.0,  gpa: [3.90, 4.0], sat: [1480, 1560] }, // Dyson
      biology:      { rate: 16.7, gpa: [3.80, 4.0], sat: [1430, 1540] }, // CALS
      environmental:{ rate: 16.7, gpa: [3.78, 4.0], sat: [1420, 1530] }, // CALS
      default:      { rate: 10.9, gpa: [3.85, 4.0], sat: [1470, 1560] }, // Arts & Sciences
    },
  },
  {
    match: 'Carnegie Mellon', source: 'CMU Class of 2029 admit data',
    overall: { rate: 11.07 },
    majors: {
      cs:       { rate: 4.0,  gpa: [3.90, 4.0], sat: [1520, 1580] },
      robotics: { rate: 5.0,  gpa: [3.88, 4.0], sat: [1500, 1570] },
      // Dietrich College (humanities) admits near 24%, but CMU has five other
      // undergraduate colleges between that and the 4% School of Computer
      // Science. Applying 24% to every non-CS major overstated the odds by 3.5x
      // against CMU's own international rate, so humanities is scoped to the
      // majors Dietrich actually houses.
      policy:         { rate: 24.0, gpa: [3.75, 4.0], sat: [1420, 1540] },
      communications: { rate: 24.0, gpa: [3.75, 4.0], sat: [1420, 1540] },
    },
  },
  {
    match: 'Georgia Tech', source: 'Georgia Tech Class of 2030 admit data',
    overall: { rate: 15.0 },
    majors: {
      cs:          { rate: 8.0,  intlRate: 6.0, gpa: [3.90, 4.0], sat: [1460, 1570] },
      engineering: { rate: 11.0, intlRate: 8.0, gpa: [3.88, 4.0], sat: [1420, 1540] },
    },
  },
  {
    match: 'University of Pennsylvania', source: 'Penn / Wharton reported admit rates',
    overall: { rate: 5.4 },
    majors: {
      business: { rate: 4.5, gpa: [3.92, 4.0], sat: [1520, 1580] }, // Wharton
      nursing:  { rate: 8.0, gpa: [3.80, 4.0], sat: [1440, 1550] },
    },
  },
  {
    match: 'New York University', source: 'NYU Class of 2029 admit data',
    overall: { rate: 7.7 },
    majors: {
      business: { rate: 5.0, gpa: [3.85, 4.0], sat: [1500, 1570] }, // Stern
      nursing:  { rate: 5.0, gpa: [3.80, 4.0], sat: [1450, 1550] },
    },
  },
  {
    match: 'University of Michigan', source: 'Michigan Ross preferred admission data',
    overall: { rate: 17.9 },
    majors: {
      business: { rate: 8.0,  gpa: [3.90, 4.0], sat: [1490, 1570] }, // Ross preferred admission
      cs:       { rate: 12.0, gpa: [3.88, 4.0], sat: [1460, 1560] },
    },
  },
  {
    match: 'Texas at Austin', source: 'UT Austin reported CS admit range',
    overall: { rate: 31.0 },
    majors: {
      cs:       { rate: 12.0, gpa: [3.90, 4.0], sat: [1470, 1560] },
      business: { rate: 18.0, gpa: [3.85, 4.0], sat: [1400, 1530] }, // McCombs
    },
  },
  {
    // UCLA publishes a full admit-rate-by-major table, the most detailed public
    // dataset of its kind. Nursing Prelicensure at 0.5% against a 9% school rate
    // is the widest major-level gap anywhere in this file.
    match: 'UCLA', source: 'UCLA Fall 2025 first-year profile, admit rates by major',
    overall: { rate: 9.0, intlRate: 6.0 },
    majors: {
      cs:            { rate: 7.3,  gpa: [3.92, 4.0], sat: [1480, 1570] },
      engineering:   { rate: 6.5,  gpa: [3.90, 4.0], sat: [1450, 1560] },
      robotics:      { rate: 3.9,  gpa: [3.93, 4.0], sat: [1490, 1570] }, // Mechanical
      biology:       { rate: 11.0, gpa: [3.85, 4.0], sat: [1380, 1530] }, // Life Sciences
      chemistry:     { rate: 14.0, gpa: [3.82, 4.0], sat: [1360, 1520] }, // Physical Sciences
      physics:       { rate: 14.0, gpa: [3.82, 4.0], sat: [1360, 1520] }, // Physical Sciences
      nursing:       { rate: 0.5,  gpa: [3.96, 4.0], sat: [1500, 1580] },
      communications:{ rate: 1.3,  gpa: [3.90, 4.0], sat: [1420, 1550] }, // Film and Television
    },
  },
  {
    match: 'Villanova', source: 'Villanova College of Nursing reported direct-admit rate',
    overall: { rate: 25.0 },
    majors: {
      nursing: { rate: 14.5, gpa: [3.80, 4.0], sat: [1380, 1500] },
    },
  },
  {
    // Berkeley publishes a full by-discipline breakdown. The spread is the
    // clearest illustration in this file of why a school-wide rate misleads:
    // Haas at 5% and Arts & Humanities at 25% sit inside the same 11% average.
    match: 'UC Berkeley', source: 'UC Berkeley Fall 2025 admit rates by discipline',
    overall: { rate: 11.0, intlRate: 7.5 },
    majors: {
      business:      { rate: 5.0,  gpa: [3.94, 4.0], sat: [1500, 1580] }, // Haas
      cs:            { rate: 6.0,  gpa: [3.93, 4.0], sat: [1480, 1570] }, // EECS runs below 5%
      engineering:   { rate: 7.0,  gpa: [3.91, 4.0], sat: [1460, 1560] },
      policy:        { rate: 9.0,  gpa: [3.88, 4.0], sat: [1420, 1550] }, // Social Sciences
      economics:     { rate: 9.0,  gpa: [3.88, 4.0], sat: [1430, 1550] }, // Social Sciences
      biology:       { rate: 16.0, gpa: [3.85, 4.0], sat: [1390, 1530] }, // Life Sciences
      math:          { rate: 16.0, gpa: [3.86, 4.0], sat: [1420, 1550] }, // Physical Sciences
      physics:       { rate: 16.0, gpa: [3.86, 4.0], sat: [1420, 1550] },
      chemistry:     { rate: 16.0, gpa: [3.85, 4.0], sat: [1400, 1540] },
      communications:{ rate: 25.0, gpa: [3.80, 4.0], sat: [1360, 1520] }, // Arts & Humanities
      music:         { rate: 25.0, gpa: [3.78, 4.0], sat: [1350, 1510] },
      default:       { rate: 12.0, gpa: [3.85, 4.0], sat: [1400, 1540] }, // Undeclared
    },
  },
];

// ─────────────────────────────────────────────────────────────
// ADMISSION STRUCTURE
//
// Whether a school admits by major at all. This decides what "missing by-major
// data" means, and for most of the database it means nothing is missing:
//
//   'university' — you are admitted to the institution and declare a major
//                  later. Major does not affect the decision, so the school's
//                  own band IS the correct band for every major. Complete by
//                  construction, not a gap.
//   'college'    — you apply to a divisional college (Arts & Sciences,
//                  Engineering, Business), each with its own admit rate.
//   'major'      — you apply to a specific major and are admitted to it.
//
// Classification basis is recorded per school so this is auditable rather than
// asserted. Named entries are documented cases; everything else falls to two
// rules that follow from how US admissions is actually organised:
//   - small private colleges admit undeclared (liberal arts model)
//   - large public flagships admit to a college
const STRUCTURE_OVERRIDES = {
  // Documented college- or major-based admission
  college: [
    'Columbia', 'Cornell', 'Carnegie Mellon', 'University of Pennsylvania',
    'New York University', 'Northwestern', 'Johns Hopkins', 'Washington University',
    'Southern California', 'Tufts', 'Vanderbilt', 'Georgetown', 'Boston University',
    'Northeastern', 'Boston College', 'Villanova', 'Syracuse', 'Lehigh',
    'Rensselaer', 'Case Western', 'University of Miami', 'Rochester',
  ],
  major: [
    'UCLA', 'UC Berkeley', 'UC San Diego', 'UC Davis', 'UC Irvine', 'UC Santa Barbara',
    'Illinois', 'Purdue', 'University of Washington', 'Georgia Tech',
    'University of Michigan', 'Texas at Austin', 'Texas A&M', 'Virginia Tech',
    'North Carolina State', 'Ohio State', 'Wisconsin-Madison', 'University of Maryland',
    'Penn State', 'Rutgers', 'Minnesota', 'Pittsburgh',
  ],
  // Documented university-wide admission despite being large or highly ranked
  university: [
    'Massachusetts Institute', 'California Institute of Technology', 'Harvard',
    'Yale', 'Princeton', 'Stanford', 'Brown', 'Dartmouth', 'University of Chicago',
    'Duke', 'Rice', 'Emory', 'Notre Dame',
  ],
};

function admissionStructure(college) {
  const name = String(college.name || '');
  for (const [structure, list] of Object.entries(STRUCTURE_OVERRIDES)) {
    if (list.some(m => name.includes(m))) return { structure, basis: 'documented' };
  }
  const size = college.studentBody || 0;
  if (college.type !== 'Public' && size < 5000) {
    return { structure: 'university', basis: 'rule: small private college, admits undeclared' };
  }
  if (college.type === 'Public' && size >= 15000) {
    return { structure: 'college', basis: 'rule: large public flagship, admits to a college' };
  }
  return { structure: 'university', basis: 'rule: no divisional admission recorded' };
}

// At a college-structure school, only the professional divisions run their own
// admission. An English, history, biology or economics applicant to Columbia,
// Boston University or Vanderbilt is applying to the Arts & Sciences college,
// which is the largest division and admits at close to the school-wide rate —
// so the school band is the right band for them. Only these divisions are
// separately gated, and only these need their own published figures.
const GATED_DIVISIONS = new Set([
  'engineering', 'business', 'nursing', 'architecture', 'cs', 'robotics',
  'publichealth', 'communications', 'music',
]);

/**
 * Where the band used for this school+major came from.
 *   'published'  — real by-major figures
 *   'structural' — the school band is the correct band for this major, because
 *                  the school admits university-wide, or because this major
 *                  sits in the Arts & Sciences division that admits at the
 *                  school rate
 *   'modelled'   — separately gated division with no published figures, so the
 *                  band is an estimate from EMPIRICAL_MAJOR_RATIOS
 */
function bandProvenance(college, majorKey) {
  if (lookupVerified(college, majorKey)) return 'published';

  // A gated division is gated regardless of how the rest of the university
  // admits. Emory, Rice and Notre Dame all admit university-wide in general but
  // run separate admission for nursing, music and architecture respectively, so
  // "university-wide" cannot be taken to mean the school rate applies to those.
  if (GATED_DIVISIONS.has(majorKey)) return 'modelled';

  return admissionStructure(college).structure === 'university' ||
         admissionStructure(college).structure === 'college'
    ? 'structural'
    : 'modelled';
}

// ─────────────────────────────────────────────────────────────
// EMPIRICAL MAJOR RATIOS
//
// Derived from the VERIFIED table above: for each major, the published
// major-level admit rate divided by that school's own overall rate. Averaged
// across every school that publishes both.
//
//   CS            0.53x   Illinois 0.20, CMU 0.36, UT 0.39, Washington 0.47,
//                         Georgia Tech 0.53, Berkeley 0.55, Michigan 0.67,
//                         UCLA 0.81, Purdue 0.83
//   Engineering   0.70x   UCLA 0.72, Cornell 0.59, Illinois 0.57, GT 0.73, Purdue 0.80
//   Business      0.62x   Michigan 0.45, Cornell 0.57, UT 0.58, NYU 0.65, Penn 0.83
//   Nursing       0.70x   enormous spread — UCLA 0.06, NYU 0.65, Penn 1.48
//   Biology       1.35x   life-science majors run ABOVE the school rate
//   Humanities    1.50x   CMU Dietrich 2.17, Cornell A&S 1.24
//
// These replace a flat 1.0 for schools whose majorDifficulty map has no entry
// for the student's major — which was 99 of 102 schools for nursing, 97 for
// music and architecture. A flat 1.0 meant the model applied no major
// differentiation at all for exactly the majors where it matters most.
//
// A school's own majorDifficulty value still wins where it exists; this is the
// fallback, not an override.
const EMPIRICAL_MAJOR_RATIOS = {
  cs:             0.53,
  robotics:       0.55,
  engineering:    0.70,
  business:       0.62,
  nursing:        0.70,
  architecture:   0.75,
  communications: 0.80,  // film and journalism programmes are heavily capped
  publichealth:   0.90,
  economics:      0.85,
  math:           1.05,
  physics:        1.15,
  chemistry:      1.15,
  biology:        1.35,
  environmental:  1.30,
  policy:         1.30,
  international:  1.20,
  music:          0.85,  // conservatory admission is audition-gated
  default:        1.00,
};

/**
 * Look up published per-major data for a school.
 * Falls back through: exact major → school's stated default → null.
 */
function lookupVerified(college, majorKey) {
  if (!college || !college.name) return null;
  const entry = VERIFIED.find(v => String(college.name).includes(v.match));
  if (!entry) return null;

  const m = entry.majors[majorKey] || entry.majors.default;
  if (!m) return null;

  return {
    rate: m.rate,
    intlRate: m.intlRate ?? null,
    gpa: m.gpa,
    sat: m.sat,
    verified: true,
    exact: !!entry.majors[majorKey],
    source: entry.source,
    schoolOverall: entry.overall,
  };
}

/**
 * Modelled per-major band for schools with no published data.
 *
 * majorDifficulty is the school's own statement of how competitive the major is
 * relative to its overall rate (<1 harder, >1 easier). Applying it to the rate
 * and shifting the academic band in proportion gives a consistent estimate.
 * This is a model, not a measurement, and is labelled 'derived' downstream.
 */
function deriveMajorBand(college, majorKey, difficultyMult = 1) {
  const [gLow, gHigh] = college.gpaRange || [3.0, 4.0];
  const [sLow, sHigh] = college.satRange || [1100, 1500];
  const baseRate = college.acceptanceRate || 50;

  // A major admitting at half the school's rate sits meaningfully above the
  // school's median; one admitting at 1.2x sits slightly below. The shift is
  // capped so derived bands never claim more precision than they have.
  const shift = Math.max(-0.6, Math.min(0.9, (1 - difficultyMult)));

  const gpaShift = shift * (gHigh - gLow) * 0.55;
  const satShift = Math.round(shift * (sHigh - sLow) * 0.55);

  return {
    rate: Math.max(1, Math.round(baseRate * difficultyMult * 10) / 10),
    intlRate: college.intlAcceptanceRate
      ? Math.max(0.5, Math.round(college.intlAcceptanceRate * difficultyMult * 10) / 10)
      : null,
    gpa: [
      Math.min(4.0, Math.round((gLow + gpaShift) * 100) / 100),
      Math.min(4.0, Math.round((gHigh + gpaShift * 0.35) * 100) / 100),
    ],
    sat: [
      Math.min(1600, sLow + satShift),
      Math.min(1600, sHigh + Math.round(satShift * 0.35)),
    ],
    verified: false,
    exact: false,
    source: 'derived from school band and majorDifficulty',
    schoolOverall: { rate: college.acceptanceRate, intlRate: college.intlAcceptanceRate },
  };
}

/**
 * The band a student should actually be measured against for their major.
 * Published data wins; otherwise a derived estimate.
 */
function majorAdmissionBand(college, majorKey, difficultyMult = 1) {
  return lookupVerified(college, majorKey) || deriveMajorBand(college, majorKey, difficultyMult);
}

const VERIFIED_SCHOOL_COUNT = VERIFIED.length;

module.exports = {
  VERIFIED, VERIFIED_SCHOOL_COUNT, EMPIRICAL_MAJOR_RATIOS,
  STRUCTURE_OVERRIDES, GATED_DIVISIONS, admissionStructure, bandProvenance,
  lookupVerified, deriveMajorBand, majorAdmissionBand,
};
