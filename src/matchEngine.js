// src/matchEngine.js
// Realistic admissions probability model.
//
// DESIGN PRINCIPLES:
//   1. The student is measured against the admitted band FOR THEIR MAJOR, not
//      the school-wide band. See src/data/majorAdmissions.js — Illinois admits
//      CS at 7.2% against a 36.6% school rate, so the school rate is the wrong
//      denominator for a CS applicant.
//   2. Major competitiveness enters through that band exactly once. It is not
//      reapplied as a separate multiplier in calcProbability.
//   3. Sensitivity to being off-band scales with selectivity. At a 4% school
//      academic position is nearly everything; at a 90% school most below-band
//      applicants are still admitted.
//   4. Country competition is shown as UI context — it does not reduce the
//      probability, because the international admit rate already prices it in.
//   5. Reaches are ranked by major strength and selectivity together, so the
//      list changes when the major changes.
//
// CALIBRATION BENCHMARKS — these are asserted in src/rag/test.js. Re-run
// `npm test` after touching calcProbability.
//   4.0 / 1580 international:
//     MIT, Stanford            →  reach,  single digits
//     safeties present         →  all >= 60%
//   2.7 / 1000 international:
//     Arizona State (~90% admit rate) → NOT a reach
//   Odds must increase monotonically with profile strength at a fixed school.

const { COLLEGES } = require('./collegeData');
const { majorFitScore } = require('./majorFit');
const { majorAdmissionBand } = require('./data/majorAdmissions');
const { annualCost } = require('./data/costModel');
const { fitMetricsFor } = require('./data/fitMetrics');
const { getMajorKey } = require('./majorKey');
const { INTERNATIONAL_SCHOOLS } = require('./data/internationalSchools');
const { thresholdProbability, classifyThresholdTier } = require('./thresholdAdmissions');

// Which countries each destination preference covers. Anything not listed is
// only reachable via 'anywhere'.
const DESTINATION_COUNTRIES = {
  uk:        ['United Kingdom', 'Ireland'],
  australia: ['Australia', 'New Zealand'],
  canada:    ['Canada'],
  asia:      ['Hong Kong', 'Singapore', 'Japan', 'South Korea', 'Taiwan', 'Malaysia'],
  europe:    ['Switzerland', 'Germany', 'Netherlands', 'France', 'Sweden',
              'Belgium', 'Italy', 'Denmark'],
};

const { analyzeProfile }  = require('./engines/profileGapAnalyzer');
const { buildActivities } = require('./ai/activityBuilder');
const { essayStrategy }   = require('./ai/essayStrategy');
const { calculateROI }    = require('./engines/roiEngine');
const { predictCareer }   = require('./engines/careerPredictor');

// ─────────────────────────────────────────────────────────────
// ACADEMIC STRENGTH vs THIS SCHOOL  (0–100)
//
// Scores the student relative to the school's 25th–75th pct band.
//   96  = well above 75th pct (exceptional fit)
//   80  = at 75th pct (strong applicant)
//   50  = at median
//   35  = at 25th pct (below average for this school)
//   <20 = well below 25th pct
// ─────────────────────────────────────────────────────────────
function calcGpaScore(gpa, gLow, gHigh) {
  const gMid = (gLow + gHigh) / 2;
  if (gpa >= gHigh + 0.05) return 96;
  if (gpa >= gHigh)         return 80;
  if (gpa >= gMid)          return 55 + (gpa - gMid) / (gHigh - gMid) * 25;
  if (gpa >= gLow)          return 35 + (gpa - gLow) / (gMid  - gLow) * 20;
  // Below the band, decay smoothly rather than falling off a cliff. The old
  // formula dropped 35 → 8 across a 0.25 GPA window and then to ~0, which
  // pinned nearly every below-band applicant to the probability floor and
  // destroyed all ordering between them — a 3.8 and a 2.5 both scored the same
  // at MIT. A published band is the middle 50% OF ADMITS, so a quarter of
  // admitted students sit below its floor; this tail has to stay alive.
  // Continuous at gLow (returns exactly 35) so nothing at or above the band
  // changes.
  return 35 * Math.exp(-(gLow - gpa) / 0.45);
}

function calcSatScore(satEq, sLow, sHigh) {
  if (!satEq) return 55; // test-optional: slight benefit of doubt
  const sMid = (sLow + sHigh) / 2;
  if (satEq >= sHigh + 60) return 96;
  if (satEq >= sHigh)       return 80;
  if (satEq >= sMid)        return 55 + (satEq - sMid) / (sHigh - sMid) * 25;
  if (satEq >= sLow)        return 35 + (satEq - sLow) / (sMid  - sLow) * 20;
  // Same smooth below-band tail as GPA — see calcGpaScore. Continuous at sLow.
  return 35 * Math.exp(-(sLow - satEq) / 180);
}

// `band` is the admitted profile the student is measured against. It defaults
// to the school-wide range, but callers pass the band for the student's actual
// major, which at direct-admit schools is a very different target: Illinois
// admits CS at 7.2% against a 36.6% school-wide rate.
function academicStrength(profile, college, band) {
  const gpa   = parseFloat(profile.gpa) || 0;
  const sat   = parseInt(profile.sat)   || 0;
  const act   = parseInt(profile.act)   || 0;
  const satEq = sat || (act ? act * 44  : 0);
  const [gLow, gHigh] = band?.gpa || college.gpaRange || [3.0, 4.0];
  const [sLow, sHigh] = band?.sat || college.satRange || [1100, 1500];
  const gs = calcGpaScore(gpa,   gLow, gHigh);
  const ss = calcSatScore(satEq, sLow, sHigh);
  return Math.min(100, gs * 0.55 + ss * 0.45);
}

// The admit rate for this major, adjusted for international applicants.
// Published international figures are used directly where they exist (UW's CS
// direct admit is 2% for international applicants against a ~43% school rate).
// Otherwise the school's international-to-overall ratio is applied to the
// major's rate, which preserves the international penalty without inventing it.
function majorBaseRate(college, band) {
  if (band?.intlRate != null) return band.intlRate / 100;

  const schoolOverall = college.acceptanceRate || 50;
  const schoolIntl    = college.intlAcceptanceRate || schoolOverall;
  const intlFactor    = schoolOverall > 0 ? schoolIntl / schoolOverall : 1;

  const rate = band?.rate ?? schoolOverall;
  return Math.max(0.005, (rate * intlFactor) / 100);
}

// ─────────────────────────────────────────────────────────────
// RIGOR INDEX  0–10
// ─────────────────────────────────────────────────────────────
// AP/A-level and IB are ALTERNATIVE routes to the same ceiling, not additive.
// Previously IB was a flat +3 bonus on top of a 4-point AP component, so a
// student taking every AP their school offered capped at 7.0/10 while an IB
// student reached 10.0 — penalising students for a curriculum their school
// chose. Admissions readers judge rigour relative to what was available, so
// both tracks now top out at 7 for coursework, with the same 3 points of
// enrichment (honors, dual enrolment, school type) available to either.
function calculateRigorIndex(profile) {
  const offered = parseInt(profile.totalAPsOffered) || 0;
  const taken   = parseInt(profile.apCount)         || 0;
  const honors  = parseInt(profile.honorsCourses)   || 0;
  const dual    = parseInt(profile.dualEnrollment)  || 0;
  const ib      = profile.ibProgram;
  const type    = profile.schooltype || '';

  // Advanced coursework, 0–7 — scored against what the school offers where that
  // is known, and against an absolute count where it is not.
  let coursework = 0;
  if (offered > 0) {
    const ratio = taken / offered;
    if      (ratio >= 0.75) coursework = 7;
    else if (ratio >= 0.55) coursework = 5.5;
    else if (ratio >= 0.35) coursework = 4;
    else if (ratio >  0)    coursework = 2;
  } else {
    if      (taken >= 8) coursework = 7;
    else if (taken >= 5) coursework = 5.5;
    else if (taken >= 3) coursework = 4;
    else if (taken >= 1) coursework = 2;
  }

  // A full IB diploma is a demanding programme in its own right. Take whichever
  // route scores higher rather than adding them — an IB student with a couple of
  // extra APs should not out-score one who took the full diploma alone.
  if (ib) coursework = Math.max(coursework, 6.5);

  let score = coursework;
  if      (honors >= 6) score += 1.5;
  else if (honors >= 3) score += 1.0;
  else if (honors >= 1) score += 0.5;
  if      (dual >= 3)   score += 1.0;
  else if (dual >= 1)   score += 0.5;
  if (type.includes('International') || type.includes('Boarding')) score += 0.5;

  return Math.min(10, Math.round(score * 10) / 10);
}

// ─────────────────────────────────────────────────────────────
// EC TIER SCORING  0–20
// ─────────────────────────────────────────────────────────────
const EC_BASE = {
  'International Award / Competition':    10,
  'Published Work / Patent':               8,
  'National Award / Competition':          8,
  'State Leadership / Award':              6,
  'School President / Captain / Founder':  5,
  'Research Experience':                   5,
  'Club Officer / Editor':                 3,
  'Job / Internship':                      2,
  'Team Member / Club Member':             1.5,
  'Community Service':                     1.0,
};
const LEADERSHIP_MULT = {
  'Founder / President':      1.5,
  'Captain / Editor':         1.3,
  'Officer / Vice President': 1.1,
  'Member / Participant':     1.0,
};

function scoreEC(activities) {
  // Callers include raw request bodies, where `activities` may be any JSON
  // value. A string has .length, so the old guard passed it through to .map()
  // and returned a 500 with an internal stack message.
  if (!Array.isArray(activities) || activities.length === 0) return 0;
  const scored = activities.map(a => {
    const base = EC_BASE[a.type] || 1;
    const lead = LEADERSHIP_MULT[a.leadership] || 1.0;
    const yrs  = Math.min(a.years || 1, 6);
    const yb   = yrs >= 4 ? 1.2 : yrs >= 2 ? 1.1 : 1.0;
    return base * lead * yb;
  }).sort((a, b) => b - a);

  let total = 0;
  scored.forEach((pts, i) => {
    total += pts * [1.0, 0.85, 0.70, 0.55, 0.40][Math.min(i, 4)];
  });
  return Math.min(20, Math.round(total * 10) / 10);
}

// MAJOR KEY — the canonical mapping now lives in src/majorKey.js so the career
// and ROI engines resolve a major identically to this one. Re-exported below
// for the many callers that import it from here.

// ─────────────────────────────────────────────────────────────
// CORE PROBABILITY  (returned as %, e.g. 12.5)
//
// prob = intlAcceptanceRate × boost × rigorBonus × ecBonus
//
// boost = (raw / 50) ^ 1.4
//   raw=96 → 2.64  (exceptional — well above 75th pct)
//   raw=87 → 2.19  (strong — above 75th pct)
//   raw=80 → 2.02  (at 75th pct of admits)
//   raw=50 → 1.00  (at median of admits — base rate applies)
//   raw=35 → 0.58  (at 25th pct — below average for this school)
//   raw=15 → 0.17  (very weak)
//
// KEY: intlAcceptanceRate already reflects international applicant
// competition and major competitiveness at each school. We do NOT
// apply a separate competition dampener — that would double-count.
//
// Country competition context is surfaced to the user in the UI
// as an informational competition awareness card.
// ─────────────────────────────────────────────────────────────
function calcProbability(college, profile, rigorIndex, ecScore, majorInfo, band) {
  const raw   = academicStrength(profile, college, band);
  const boost = Math.pow(Math.max(0.01, raw / 50), 1.4);

  // Base rate is now the MAJOR's admit rate, not the school's. The band already
  // encodes major competitiveness — for verified schools from published data,
  // for the rest by applying majorDifficulty — so the separate majorDifficulty
  // multiplier that used to sit in this formula is deliberately not reapplied
  // here. Doing both would double-count it.
  const baseRate   = majorBaseRate(college, band);
  const rigorBonus = 1 + (rigorIndex / 10) * 0.08;  // up to +8%
  const ecBonus    = 1 + (ecScore    / 20) * 0.08;  // up to +8%
  const extraBonus = 1
    + ((profile.research?.length > 20) ? 0.04 : 0)
    + ((profile.awards?.length   > 20) ? 0.04 : 0);

  // Major competitiveness at THIS school. collegeData carries a per-major
  // multiplier (Wharton business 0.7, MIT business 1.1) that the model used to
  // ignore — applying it is what makes CS odds at a CS-heavy school differ from
  // that school's headline rate.
  // How much sitting off the admitted band actually moves the odds, scaled by
  // how selective the school is.
  //
  // At a 4%-admit school, academic position is almost the whole decision — a
  // below-band applicant really is near-hopeless. At a school that admits 90%
  // of applicants, most below-band applicants are still admitted, because the
  // band describes enrolled students rather than an admissions bar.
  //
  // Applying the raw boost everywhere produced absurdities: a 2.7 GPA / 1000
  // SAT student was given 16% at Arizona State, which admits roughly 90% of
  // applicants, and the school was labelled a "reach". Damping the boost toward
  // the base rate as the base rate rises fixes the open-access end while
  // leaving the selective end — where the model was already calibrated —
  // untouched.
  // Sensitivity is a property of the INSTITUTION's openness, not of the major's
  // admit rate. This was calibrated against the school's international rate,
  // but when per-major bands landed `baseRate` became the major's rate and this
  // line silently started reading that instead — at Arizona State, which admits
  // 90% of applicants, sensitivity went from 0.29 to 0.63, so a below-band CS
  // applicant was punished 2.2x harder than the calibration intended and a
  // 90%-admit school came back as a 17% reach.
  //
  // Major competitiveness is already priced into `baseRate` via the band; it
  // must not also decide how steeply being off-band is penalised. A university
  // that admits nine applicants in ten does not have the machinery to finely
  // reject the tenth, whatever they are majoring in.
  // The damping is also ASYMMETRIC. Openness means "being below the band hurts
  // less", not "being above it helps less" — a 90%-admit school still takes
  // essentially every strong applicant. Damping both directions equally cost a
  // 4.0/1580 student every safety school on the list: the bonus at Arizona State
  // was compressed until a perfect profile came back at 59.8%, just under the
  // 60% safety line. Above-band applicants therefore get the boost in full and
  // are limited only by maxProb below; only the downside is damped.
  const schoolOpenness = (college.intlAcceptanceRate || college.acceptanceRate || 50) / 100;
  const sensitivity = Math.max(0.25, Math.min(1, 1.05 - schoolOpenness));
  const dampedBoost = boost >= 1 ? boost : 1 + (boost - 1) * sensitivity;

  let prob = baseRate * dampedBoost * rigorBonus * ecBonus * extraBonus;

  // Ceiling per school. Safety schools cap at 80 (never show 97%).
  // Reach schools (low intlRate) are allowed up to 24.9%.
  // This keeps displayed odds within the user's intended ranges:
  //   Reach:  3% – 24.9%
  //   Match: 25% – 49.9%
  //   Safety: 60% – 80%
  const maxProb = Math.min(0.95, 0.04 + baseRate * 2.6 + (raw / 100) * 0.50);

  // Floor at 0.1% rather than 1%. The old 1% floor was high enough that whole
  // stretches of the below-band range flattened onto it, so a 3.8/1450 and a
  // 2.5/950 came back identical at a selective school. Nothing below 3% is
  // shown to the student either way, but ordering has to survive for sorting
  // and for the audit's monotonicity check to mean anything.
  prob = Math.min(maxProb, Math.max(0.001, prob));
  return Math.round(prob * 1000) / 10; // percentage with 1 decimal, e.g. 12.5
}

// ─────────────────────────────────────────────────────────────
// TIER CLASSIFICATION  — 5 groups
//
//   reach:         3%  – 24.9%   no sub-label
//   match/reach:  25%  – 34.9%   orange sub-label
//   match:        35%  – 59.9%   no sub-label
//   match/safety: 60%  – 69.9%   green  sub-label
//   safety:       70%  – 95%     no sub-label
//
//   Below 3% → excluded (pure lottery, not actionable)
// ─────────────────────────────────────────────────────────────
function classifyTier(prob) {
  if (prob >= 70) return { tier: 'safety',   subLabel: null };
  if (prob >= 60) return { tier: 'safety',   subLabel: 'match/safety' };
  if (prob >= 35) return { tier: 'match',    subLabel: null };
  if (prob >= 25) return { tier: 'match',    subLabel: 'match/reach' };
  if (prob >=  3) return { tier: 'reach',    subLabel: null };
  return null; // below 3% — excluded
}

// ─────────────────────────────────────────────────────────────
// FIT SCORE  0–100
//
// An explicit weighted composite of four independently meaningful components,
// each scored 0–100 so the weights mean what they say. The breakdown is
// returned alongside the score so the UI can show why a school scored what it
// did rather than presenting an unexplainable number.
//
//   major          40%  — does this school actually teach your subject well
//   admission      25%  — can you realistically get in
//   affordability  20%  — can you pay for it
//   preference     15%  — location, campus size, and student outcomes
//
// Major is weighted highest because it is the component the student cannot
// compensate for after enrolling.
// ─────────────────────────────────────────────────────────────
const FIT_WEIGHTS = { major: 0.40, admission: 0.25, affordability: 0.20, preference: 0.15 };

// Attainability rises with the odds but saturates, so a 95% safety does not
// outrank a 60% strong match by much. Without saturation the highest-fit school
// would always be the least selective one on the list, which is not "fit".
function admissionScore(probability) {
  return Math.round(100 * (1 - Math.exp(-(probability || 0) / 28)));
}

function affordabilityScore(college, profile) {
  const budget = parseInt(profile.budgetMax) || 0;
  const cost   = annualCost(college);

  if (budget === 0) {
    // No stated budget: mild preference for lower cost, since every school on
    // this list is expensive for an international student paying full price.
    return Math.max(35, Math.min(85, Math.round(95 - (cost - 35000) / 900)));
  }
  if (cost <= budget * 0.85) return 100;
  if (cost <= budget)        return 92;
  if (cost <= budget * 1.15) return 70;
  if (cost <= budget * 1.30) return 45;
  return 15;
}

function preferenceScore(college, profile, majorKey) {
  let score = 55; // neutral starting point

  const loc  = (profile.locationPref || 'any').toLowerCase();
  const cLoc = (college.location || '').toLowerCase();
  const locMatch =
    loc === 'any'       ? null :
    loc === 'northeast' ? /,\s*(ma|ny|pa|ct|ri|nh|me|nj|vt)/i.test(cLoc) :
    loc === 'west'      ? /,\s*(ca|wa|or)/i.test(cLoc) :
    loc === 'south'     ? /,\s*(tx|ga|nc|va|fl|tn|la|dc)/i.test(cLoc) :
    loc === 'midwest'   ? /,\s*(il|mi|oh|in|mn|wi|mo)/i.test(cLoc) : null;
  if      (locMatch === true)  score += 22;
  else if (locMatch === false) score -= 18;

  const size = (profile.sizePref || '').toLowerCase();
  const sb   = college.studentBody || 10000;
  if (size) {
    const sizeMatch =
      size === 'small'  && sb < 5000                 ? true :
      size === 'medium' && sb >= 5000 && sb <= 20000 ? true :
      size === 'large'  && sb > 20000                ? true : false;
    score += sizeMatch ? 15 : -10;
  }

  // Student experience and outcomes, which belong to preference rather than to
  // the major or the odds. Sourced from College Scorecard where available —
  // see src/data/fitMetrics.js.
  //
  // `vibe` is deliberately absent: campus culture has no measurable proxy in
  // any public dataset, and an unsourced number has no business inside a
  // scoring formula. It remains an editorial descriptor in the UI only.
  const fm = fitMetricsFor(college);
  score += (fm.satisfaction - 6) * 2.2;
  score += (fm.diversity    - 6) * 1.0;
  score += ((college.gradRate || 82) - 82) / 15 * 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calcFitScore(college, profile, majorKey, majorInfo, probability) {
  const components = {
    major:         Math.max(0, Math.min(100, majorInfo?.score ?? 50)),
    admission:     admissionScore(probability),
    affordability: affordabilityScore(college, profile),
    preference:    preferenceScore(college, profile, majorKey),
  };

  let score =
    components.major         * FIT_WEIGHTS.major +
    components.admission     * FIT_WEIGHTS.admission +
    components.affordability * FIT_WEIGHTS.affordability +
    components.preference    * FIT_WEIGHTS.preference;

  // Deterministic micro-variation per college (±2) — breaks exact ties without
  // being large enough to reorder genuinely different schools.
  const nameSum = (college.name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  score += (((college.id || 1) * 19 + nameSum % 31) % 5) - 2;

  return {
    score: Math.max(1, Math.min(99, Math.round(score))),
    components,
    weights: FIT_WEIGHTS,
  };
}


// ─────────────────────────────────────────────────────────────
// SELECTIVITY LABEL
// Shown instead of `rank`. The rank field in collegeData is unreliable — 49 of
// 102 schools claim a top-25 national rank — and it is presented to students as
// fact. Acceptance rate carries the same signal, is audited against published
// figures, and cannot be double-claimed.
// ─────────────────────────────────────────────────────────────
function selectivityLabel(rate) {
  if (rate <= 8)  return 'Most selective';
  if (rate <= 20) return 'Highly selective';
  if (rate <= 40) return 'Selective';
  if (rate <= 65) return 'Moderately selective';
  return 'Accessible';
}

// ─────────────────────────────────────────────────────────────
// APP STRATEGY
// ─────────────────────────────────────────────────────────────
function getAppStrategy(college, tier, prob) {
  const rec = college.recommendedStrategy || 'RD';
  if (tier === 'reach') {
    if (rec === 'ED' && prob >= 6)
      return { strategy:'ED',  reason:'ED gives a meaningful boost at this school — worth committing if it is your top choice.' };
    if (rec === 'REA' || rec === 'EA')
      return { strategy: rec,  reason:'Apply early to show strong interest and gain an admission timing advantage.' };
    return { strategy:'RD', reason:'Your odds are low regardless of round — invest time in other applications.' };
  }
  if (tier === 'match') {
    if (rec === 'ED')
      return { strategy:'ED',  reason:'ED could significantly improve your odds here.' };
    if (rec === 'EA' || rec === 'REA')
      return { strategy: rec,  reason:'Apply early to secure your spot and get merit decisions sooner.' };
    return { strategy:'RD', reason:'Your profile is competitive — apply RD with a polished, tailored application.' };
  }
  return { strategy:'RD', reason:'Safety school — apply RD and focus energy on reach applications.' };
}

// ─────────────────────────────────────────────────────────────
// PROFILE NORMALISATION
// The profile arrives straight from an HTTP body, so every field can be any
// JSON value. Sub-engines (activityBuilder, essayStrategy, profileGapAnalyzer)
// all did `student.activities || []` and then called .some()/.filter() on it,
// which turned `"activities": "x"` or a null row into a 500 with an internal
// stack message. Normalise once here rather than guarding in each engine.
// ─────────────────────────────────────────────────────────────
function normalizeProfile(profile) {
  const p = (profile && typeof profile === 'object') ? profile : {};
  const activities = Array.isArray(p.activities)
    ? p.activities.filter(a => a && typeof a === 'object')
    : [];
  return { ...p, activities };
}

// ─────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────
function runMatchEngine(rawProfile) {
  const profile    = normalizeProfile(rawProfile);
  const rigorIndex = calculateRigorIndex(profile);
  const ecScore    = scoreEC(profile.activities);
  const majorKey   = getMajorKey(profile.major);
  const budget     = parseInt(profile.budgetMax) || 0;

  // Budget filter. The cheapest school in the database costs about $47,000 a
  // year all-in, so the lowest budget option the form offers ($30,000) excludes
  // every single school. Returning an empty list for that was a silent failure:
  // the student saw a blank Schools tab and a report that still talked about
  // "your list". Instead, fall back to the cheapest schools available and mark
  // them over-budget, so the report can say plainly what the shortfall is.
  const budgetCap  = budget > 0 ? budget * 1.35 : Infinity;
  // Modelled per school (type + state cost of living) rather than a flat
  // +$18,000 — see src/data/costModel.js.
  const totalCost  = c => annualCost(c);
  const affordable = COLLEGES.filter(c => totalCost(c) <= budgetCap);

  const MIN_USABLE_LIST = 5;
  let pool = affordable;
  if (budget > 0 && affordable.length < MIN_USABLE_LIST) {
    const cheapest = [...COLLEGES].sort((a, b) => totalCost(a) - totalCost(b)).slice(0, 25);
    pool = [...new Set([...affordable, ...cheapest])];
  }

  const scored = pool
    .map(college => ({ college, majorInfo: majorFitScore(college, majorKey, profile.major) }))
    .filter(x => x.majorInfo.offered);

  // Two passes. The primary pool is schools the database actually associates
  // with this major; schools that merely might offer it are held back and used
  // only if a tier cannot be filled from the primary pool.
  const primaryPool = scored.filter(x => x.majorInfo.evidence > 0 || (!x.majorInfo.fillerOnly && x.majorInfo.score >= 30));
  const fillerPool  = scored.filter(x => !primaryPool.includes(x));

  const evaluate = ({ college, majorInfo }) => {
      const band        = majorAdmissionBand(college, majorKey, majorInfo.difficulty);
      const prob        = calcProbability(college, profile, rigorIndex, ecScore, majorInfo, band);
      const tierObj     = classifyTier(prob);
      if (!tierObj) return null;
      const { tier, subLabel } = tierObj;
      const fit         = calcFitScore(college, profile, majorKey, majorInfo, prob);
      const appStrategy = getAppStrategy(college, tier, prob);
      return {
        college, probability: prob, tier, subLabel, appStrategy,
        // True when this school only appears because the stated budget excluded
        // everything — the report must not present it as affordable.
        selectivityLabel: selectivityLabel(college.acceptanceRate),
        // Measured where College Scorecard covers the school; each key carries
        // its own source string so the UI can say which are real.
        metrics: fitMetricsFor(college),
        overBudget: budget > 0 && totalCost(college) > budgetCap,
        annualCost: totalCost(college),
        fitScore: fit.score,
        fitBreakdown: fit.components,
        fitWeights: fit.weights,
        majorFit: majorInfo.score,
        majorFitLabel: majorInfo.label,
        majorDifficulty: majorInfo.difficulty,
        majorVerified: majorInfo.evidence > 0,
        // The admitted profile for THIS major, and where it came from.
        majorBand: {
          gpa: band.gpa, sat: band.sat, rate: band.rate, intlRate: band.intlRate,
          verified: band.verified, exact: band.exact, source: band.source,
          schoolRate: college.acceptanceRate,
        },
      };
  };

  // ── Threshold-system universities (non-US) ─────────────────────────────────
  // Scored against a published entry requirement rather than a middle-50% band
  // — see src/thresholdAdmissions.js for why they cannot share the US path.
  // Only included when the student's destination preference allows it, because
  // the report's application-round and visa advice is destination-specific.
  const evaluateThreshold = (school) => {
    const majorInfo = majorFitScore(school, majorKey, profile.major);
    if (!majorInfo.offered) return null;

    const res  = thresholdProbability(profile, school);
    const tierObj = classifyThresholdTier(res, school);
    const cost = (school.tuitionUSD || 0) + (school.livingCostUSD || 0);
    const fit  = calcFitScore(school, profile, majorKey, majorInfo, res.probability);

    return {
      college: school,
      probability: res.probability,
      tier: tierObj.tier,
      subLabel: tierObj.subLabel,
      // These schools have no ED/EA/RD system. The round advice is written by
      // the destination-specific knowledge docs, not by getAppStrategy().
      appStrategy: { strategy: 'DIRECT', reason: `${school.country} universities admit on published entry requirements; apply directly or through the national admissions centre.` },
      admissionsSystem: 'threshold',
      entryRequirement: res.requirement,
      studentEquivalent: res.studentValue.display,
      meetsThreshold: res.meetsThreshold,
      entryProvenance: res.provenance,
      selectivityLabel: `QS #${school.qsRank} worldwide`,
      metrics: school.fitMetrics,
      overBudget: budget > 0 && cost > budgetCap,
      annualCost: cost,
      fitScore: fit.score,
      fitBreakdown: fit.components,
      fitWeights: fit.weights,
      majorFit: majorInfo.score,
      majorFitLabel: majorInfo.label,
      majorDifficulty: majorInfo.difficulty,
      majorVerified: majorInfo.evidence > 0,
      // Deliberately no majorBand: there is no published admitted middle-50%
      // for these, and inventing one is the failure mode this whole path exists
      // to avoid. The UI shows the entry requirement instead.
      majorBand: null,
    };
  };

  const wantsInternational = profile.destination && profile.destination !== 'us';
  const internationalPool = wantsInternational
    ? INTERNATIONAL_SCHOOLS.filter(s =>
        profile.destination === 'anywhere' ||
        DESTINATION_COUNTRIES[profile.destination]?.includes(s.country))
    : [];

  const international = internationalPool.map(evaluateThreshold).filter(Boolean);

  const usPrimary = primaryPool.map(evaluate).filter(Boolean); // drops sub-3% odds
  // A student who asked for Australia only should not be shown US schools.
  const includeUS = !profile.destination || ['us', 'anywhere'].includes(profile.destination);
  const primary = includeUS ? [...usPrimary, ...international] : international;
  const filler  = includeUS ? fillerPool.map(evaluate).filter(Boolean) : [];

  // Sort helper: fit × 0.6 + prob × 0.4 (fitScore is now major-dominant)
  // fitScore is now a composite that already contains the admission odds, so
  // adding probability again here would double-count it.
  const byFit = arr => arr.sort((a, b) => b.fitScore - a.fitScore);

  // 5 buckets — 4 schools each (16–20 total depending on available pool)
  // REACH (3–24.9%): balance how strong the school is in THIS major against how
  // selective it is. Sorting on selectivity alone returned the same handful of
  // elite schools regardless of what the student wanted to study.
  // Threshold schools have no acceptance rate by design, so their selectivity
  // is read off the QS rank instead.
  const selectivityScore = c => {
    if (c.admissionsSystem === 'threshold') {
      return Math.max(0, Math.min(100, 100 - (c.qsRank || 200) * 0.35));
    }
    return Math.max(0, Math.min(100, 100 - (c.intlAcceptanceRate || c.acceptanceRate) * 2.2));
  };

  const byReach = arr => arr.sort((a, b) =>
    (b.majorFit * 0.55 + selectivityScore(b.college) * 0.45) -
    (a.majorFit * 0.55 + selectivityScore(a.college) * 0.45)
  );

  // For a specialized major, a school with no recorded programme is not a
  // weaker option — it may not be an option at all. Padding a Nursing reach
  // tier with schools that have no nursing school is worse than a short tier,
  // so filler is only used when the honest list would be unusably small.
  const useFiller = primary.length < 6;

  const isReach       = r => r.tier === 'reach';
  const isMatchReach  = r => r.tier === 'match'  && r.subLabel === 'match/reach';
  const isMatch       = r => r.tier === 'match'  && !r.subLabel;
  const isMatchSafety = r => r.tier === 'safety' && r.subLabel === 'match/safety';
  const isSafety      = r => r.tier === 'safety' && !r.subLabel;

  // Display order: reach first, safety last.
  const TIERS = [
    { match: isReach,       sorter: byReach },
    { match: isMatchReach,  sorter: byFit },
    { match: isMatch,       sorter: byFit },
    { match: isMatchSafety, sorter: byFit },
    { match: isSafety,      sorter: byFit },
  ];

  const BASE_QUOTA = 4;
  // Only SHORT lists get topped up. Padding a list that is already usable costs
  // major sensitivity for nothing: the extra picks come from the big public
  // universities that are strong in everything, so at 20 schools a Business list
  // and a CS list converge (56% -> 75% overlap when every list was expanded).
  // A student with 18 schools does not need two more; a student with 6 does.
  const MIN_LIST = 16;

  const tierState = TIERS.map(t => ({
    primary: t.sorter(primary.filter(t.match)),
    filler:  useFiller ? t.sorter(filler.filter(t.match)) : [],
    taken:   0,
  }));

  // Pass 1 — the base quota each tier has always had.
  const picks = tierState.map(s => {
    const take = s.primary.slice(0, BASE_QUOTA);
    if (take.length < BASE_QUOTA) {
      take.push(...s.filler.slice(0, BASE_QUOTA - take.length));
    }
    s.taken = take.length;
    return take;
  });

  // Pass 2 — redistribute the slots that empty tiers leave behind.
  //
  // The quota used to be a hard 4 per tier with no reallocation, so a student
  // with no safeties simply lost those slots: a 3.6/1350 applicant got 12
  // schools and a 2.8/1020 applicant got 6, four of which were reaches. The
  // list shrank exactly as the student's need for options grew.
  //
  // Slack flows to the most accessible tier that still has candidates, because
  // a student whose safety tier came back empty needs more realistic options,
  // not more reaches.
  //
  // Overflow is ordered by fit and odds together. Ordering it by odds alone is
  // the obvious choice and it is wrong: it ranks on a quantity that does not
  // depend on the major, so every major's overflow came back as the same list of
  // accessible schools and Business/CS overlap went from ~50% to 75%. Blending
  // in fitScore — which is 40% major — keeps the extra picks pointed at schools
  // that actually teach the subject, while still surfacing the gettable ones
  // ahead of the hopeless.
  //
  // Overflow draws only on `primary`, never on `filler`, so a specialized major
  // (nursing, music, architecture) still never gets padded with schools that
  // have no such programme.
  const accessibleFit = r => r.fitScore * 0.5 + r.probability * 0.5;
  const byOdds = arr => [...arr].sort((a, b) => accessibleFit(b) - accessibleFit(a));

  let slack = MIN_LIST - picks.reduce((n, p) => n + p.length, 0);
  for (let i = TIERS.length - 1; i >= 0 && slack > 0; i--) {
    const extra = tierState[i].primary.slice(tierState[i].taken);
    if (!extra.length) continue;
    const add = byOdds(extra).slice(0, slack);
    picks[i].push(...add);
    tierState[i].taken += add.length;
    slack -= add.length;
  }

  const picked = picks.flat();

  // Guard against a school occupying two slots on one list. The duplicate row
  // that made this necessary (Lehigh, ids 53 and 89) has been removed from
  // collegeData, but the check is cheap and the failure it prevents is ugly.
  const seenNames = new Set();
  return picked.filter(r => {
    const key = r.college.name.trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
// SINGLE-SCHOOL ESTIMATE
// Evaluates one named school regardless of whether it would make the top-20
// list. Used for testing, for answering "what are my odds at X", and for
// benchmarking this model against external chancing tools.
// ─────────────────────────────────────────────────────────────
function estimateForCollege(rawProfile, collegeOrName) {
  const profile = normalizeProfile(rawProfile);
  const college = typeof collegeOrName === 'string'
    ? COLLEGES.find(c => c.name.toLowerCase().includes(collegeOrName.toLowerCase()))
    : collegeOrName;
  if (!college) return null;

  const rigorIndex = calculateRigorIndex(profile);
  const ecScore    = scoreEC(profile.activities || []);
  const majorKey   = getMajorKey(profile.major);

  const majorInfo = majorFitScore(college, majorKey, profile.major);
  const band      = majorAdmissionBand(college, majorKey, majorInfo.difficulty);
  const prob      = calcProbability(college, profile, rigorIndex, ecScore, majorInfo, band);
  const tierObj   = classifyTier(prob) || { tier: 'excluded', subLabel: null };
  const fit       = calcFitScore(college, profile, majorKey, majorInfo, prob);

  return {
    college: college.name,
    probability: prob,
    tier: tierObj.tier,
    subLabel: tierObj.subLabel,
    fitScore: fit.score,
    fitBreakdown: fit.components,
    majorOffered: majorInfo.offered,
    majorFit: majorInfo.score,
    majorFitLabel: majorInfo.label,
    band,
    academicStrength: Math.round(academicStrength(profile, college, band)),
  };
}

// ─────────────────────────────────────────────────────────────
// FULL ANALYSIS — combines matchEngine + all modular engines
// Called by server.js to get the complete enriched output
// ─────────────────────────────────────────────────────────────
function runAnalysis(rawProfile) {
  const profile      = normalizeProfile(rawProfile);
  const schools      = runMatchEngine(profile);
  const topReach     = schools.find(s => s.tier === 'reach')?.college || schools[0]?.college;

  // Gap analysis is normally measured against the top reach school — the point
  // is to show what stands between the student and their most ambitious target.
  // But when the list contains no safe option at all, the top reach is a
  // single-digit-odds school, and measuring against it produces score targets
  // the student cannot reach in one cycle. In that case anchor to the most
  // realistic school on the list so the gaps are actionable.
  const hasSafety  = schools.some(s => s.tier === 'safety');
  const gapAnchor  = hasSafety
    ? topReach
    : (schools.filter(s => s.tier === 'match').sort((a, b) => b.probability - a.probability)[0]?.college
       || topReach);

  // Gaps are measured against the band for the student's MAJOR at the anchor
  // school, so the numbers agree with what the school card shows.
  const analysisMajorKey = getMajorKey(profile.major);
  const anchorMajorInfo  = gapAnchor ? majorFitScore(gapAnchor, analysisMajorKey, profile.major) : null;
  const anchorBand       = gapAnchor
    ? majorAdmissionBand(gapAnchor, analysisMajorKey, anchorMajorInfo.difficulty)
    : null;

  const gaps         = analyzeProfile(profile, gapAnchor, anchorBand);

  // Activity improvement plan
  const activities   = buildActivities(profile);

  // Essay strategy signals (injected into AI prompt)
  const essay        = essayStrategy(profile);

  // ROI for every school — attached to each result AND as a flat list
  const schoolsWithROI = schools.map(r => ({
    ...r,
    roi: calculateROI(r.college, profile),
  }));
  const roiData = schoolsWithROI.map(r => ({ school: r.college.name, ...r.roi }));

  // Career predictions for top match school
  const topMatch     = schools.find(s => s.tier === 'match')?.college;
  const careers      = topMatch ? predictCareer(profile, topMatch) : [];

  return { schools: schoolsWithROI, gaps, activityPlan: activities, essay, roiData, careers };
}

module.exports = { runMatchEngine, runAnalysis, calculateRigorIndex, scoreEC, getMajorKey, estimateForCollege, selectivityLabel, normalizeProfile };
