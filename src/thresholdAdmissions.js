// src/thresholdAdmissions.js
// Admission probability for universities that admit on a published threshold
// rather than by holistic review against a middle-50% band.
//
// The US model in matchEngine.js asks "where does this applicant sit in the
// distribution of admitted students, and what share of applicants get in?"
// Australia, Canada, the UK, Hong Kong and Singapore do not work that way:
// they publish a required grade, and clearing it is most of the decision. So
// the question here is "does this applicant clear the bar, and by how much?"
//
// Two consequences worth stating plainly:
//   1. These probabilities are usually HIGHER than US ones for the same student.
//      That is not a bug. Meeting Melbourne's published IB requirement really
//      does mean you are very likely to be admitted; meeting MIT's median SAT
//      does not.
//   2. Clearing the bar is necessary but not always sufficient. Oxford,
//      Cambridge and Imperial interview and reject a large majority of
//      applicants who meet their grade offer, so `offerRateAtThreshold` below
//      scales with selectivity.

// ── Converting a student into the school's entry currency ────────────────────
// The profile form collects a US-style 4.0 GPA, so everything is mapped from
// that. These are approximate concordances, not official conversions — a real
// application would use the student's own qualification. Flagged as an estimate
// wherever it surfaces.
//
// Anchors: 4.0 GPA is a near-perfect transcript, which maps to roughly IB 42-44,
// A*A*A at A-level, and a 95% Canadian average. The scales diverge below that:
// IB 24 is a bare pass, so the bottom of the GPA range compresses.
const GPA_TO_IB = [
  [4.00, 43], [3.90, 41], [3.80, 39], [3.70, 37], [3.60, 35],
  [3.50, 33], [3.30, 31], [3.10, 29], [2.90, 27], [2.70, 25], [2.00, 22],
];

const GPA_TO_PERCENT = [
  [4.00, 96], [3.90, 93], [3.80, 90], [3.70, 88], [3.60, 86],
  [3.50, 84], [3.30, 81], [3.10, 78], [2.90, 75], [2.70, 72], [2.00, 62],
];

// A-level offers are grade strings. Ranked so they can be compared numerically.
const ALEVEL_SCALE = ['CCC', 'BCC', 'BBC', 'BBB', 'ABB', 'AAB', 'AAA', 'A*AA', 'A*A*A', 'A*A*A*'];

const GPA_TO_ALEVEL_INDEX = [
  [4.00, 8], [3.90, 7], [3.85, 6], [3.75, 5], [3.65, 4],
  [3.50, 3], [3.35, 2], [3.20, 1], [3.00, 0], [2.00, 0],
];

/** Piecewise-linear interpolation down a descending anchor table. */
function interpolate(table, gpa) {
  if (gpa >= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [gHi, vHi] = table[i];
    const [gLo, vLo] = table[i + 1];
    if (gpa >= gLo) {
      const t = (gpa - gLo) / (gHi - gLo);
      return vLo + t * (vHi - vLo);
    }
  }
  return table[table.length - 1][1];
}

/**
 * Convert a US 4.0 GPA into the scale a school admits on.
 * @returns {{ value:number, display:string, scale:string, estimated:true }}
 */
function convertProfile(profile, scale) {
  const gpa = parseFloat(profile.gpa) || 0;

  if (scale === 'IB') {
    const v = Math.round(interpolate(GPA_TO_IB, gpa));
    return { value: v, display: `IB ${v}`, scale, estimated: true };
  }
  if (scale === 'percentage') {
    const v = Math.round(interpolate(GPA_TO_PERCENT, gpa));
    return { value: v, display: `${v}% average`, scale, estimated: true };
  }
  if (scale === 'A-level') {
    // Kept continuous. Rounding to a whole grade made the curve lump: a 3.7 GPA
    // rounded up to exactly AAB and scored 85% at Nottingham while a 3.4
    // rounded down to BBC and scored 2.5%, with nothing in between. The
    // fractional value is used for the gap; the rounded one only for display.
    const idx = interpolate(GPA_TO_ALEVEL_INDEX, gpa);
    const clamped = Math.max(0, Math.min(ALEVEL_SCALE.length - 1, idx));
    return {
      value: clamped,
      display: ALEVEL_SCALE[Math.round(clamped)],
      scale, estimated: true,
    };
  }
  return { value: 0, display: 'unknown', scale, estimated: true };
}

/** Put a school's published requirement on the same numeric scale. */
function thresholdValue(entry) {
  if (entry.scale === 'A-level') {
    const i = ALEVEL_SCALE.indexOf(String(entry.value));
    return i >= 0 ? i : 6; // default AAA
  }
  return Number(entry.value);
}

// How much of a "clears the bar" applicant pool actually receives an offer.
// Threshold systems are not lotteries, but the most selective courses still
// ration places among qualified applicants — Oxford and Cambridge interview and
// reject most applicants holding the required grades.
// Anchored to published offer rates rather than guessed: Oxford and Cambridge
// admit roughly a sixth of applicants and interview nearly all of them holding
// the required grades, so the top tier cannot sit near the 0.9 that a genuine
// threshold school like Nottingham deserves.
function offerRateAtThreshold(qsRank) {
  if (qsRank <= 10)  return 0.22;
  if (qsRank <= 30)  return 0.45;
  if (qsRank <= 60)  return 0.65;
  if (qsRank <= 120) return 0.80;
  return 0.88;
}

// Distance above/below the bar, expressed in "points of headroom" on whichever
// scale the school uses, normalised so one unit means roughly the same thing.
function normalisedGap(studentValue, thresholdVal, scale) {
  const raw = studentValue - thresholdVal;
  if (scale === 'IB')         return raw / 3;    // 3 IB points is a meaningful step
  if (scale === 'percentage') return raw / 4;    // 4 percentage points
  if (scale === 'A-level')    return raw / 1;    // one grade step
  return raw;
}

/**
 * Probability of admission at a threshold-system university.
 *
 * @param {object} profile  the student
 * @param {object} school   a row from src/data/internationalSchools.js
 * @returns {{ probability:number, meetsThreshold:boolean, studentValue:object,
 *             requirement:string, headroom:number, provenance:string }}
 */
function thresholdProbability(profile, school) {
  const entry = school.entry;
  const student = convertProfile(profile, entry.scale);
  const bar = thresholdValue(entry);
  const gap = normalisedGap(student.value, bar, entry.scale);
  const base = offerRateAtThreshold(school.qsRank);

  let p;
  if (gap >= 0) {
    // At or above the bar: rises from the base offer rate toward a ceiling as
    // headroom grows. Two clear steps above the requirement is close to the
    // ceiling — there is no further advantage to being far above it.
    p = base + (1 - base) * (1 - Math.exp(-gap / 1.2));
  } else {
    // Below the bar: steeper than the US below-band tail, because these systems
    // genuinely do gate on the published grade — but not a cliff. Published
    // requirements are minimums, universities make lower offers to strong
    // applicants, near-misses are picked up in clearing, and every one of these
    // countries runs foundation and pathway programmes into the same degrees.
    p = base * Math.exp(gap / 1.5); // gap is negative
  }

  // English proficiency is a hard gate in every one of these systems.
  const toefl = parseInt(profile.toefl) || 0;
  const ielts = parseFloat(profile.ielts) || 0;
  const hasEnglish = toefl >= 90 || ielts >= 6.5;
  const englishUnknown = toefl === 0 && ielts === 0;
  if (!hasEnglish && !englishUnknown) p *= 0.55;

  p = Math.max(0.005, Math.min(0.97, p));

  return {
    probability: Math.round(p * 1000) / 10,
    meetsThreshold: gap >= 0,
    studentValue: student,
    requirement: entry.scale === 'A-level' ? String(entry.value) : `${entry.scale} ${entry.value}`,
    headroom: Math.round(gap * 10) / 10,
    provenance: entry.provenance,
  };
}

/**
 * Tiering for threshold schools. The US bands (reach <25%, match, safety >=70%)
 * are calibrated to holistic admission and would label almost every threshold
 * school a safety, which is misleading — clearing the bar at Oxford is not a
 * safety. Tiering keys off whether the student clears the bar and by how much.
 */
function classifyThresholdTier(result, school) {
  const { probability, meetsThreshold, headroom } = result;
  const elite = school.qsRank <= 30;

  if (!meetsThreshold) {
    return headroom > -1
      ? { tier: 'reach', subLabel: 'below requirement' }
      : { tier: 'reach', subLabel: null };
  }
  if (elite && headroom < 1)     return { tier: 'reach',  subLabel: 'meets requirement' };
  if (probability >= 85)         return { tier: 'safety', subLabel: null };
  if (probability >= 70)         return { tier: 'safety', subLabel: 'match/safety' };
  if (probability >= 50)         return { tier: 'match',  subLabel: null };
  return { tier: 'match', subLabel: 'match/reach' };
}

module.exports = {
  thresholdProbability,
  classifyThresholdTier,
  convertProfile,
  offerRateAtThreshold,
  ALEVEL_SCALE,
  GPA_TO_IB,
  GPA_TO_PERCENT,
};
