// src/data/fitMetrics.js
// Derives the five fitMetrics from measured institutional data instead of the
// hand-assigned 1-10 ratings that used to sit in collegeData.
//
// The originals had ~15 distinct values across 102 schools, no source, and fed
// 15% of the fit score plus the research and pipeline adjustments inside
// majorFit. Four of the five now come from College Scorecard (see
// src/data/outcomes.js); the fifth does not, and is handled explicitly below.
//
//   satisfaction  first-year retention rate         measured
//   research      Carnegie basic classification     measured
//   diversity     Simpson index over demographics   measured
//   pipeline      median earnings percentile        measured
//   vibe          — no objective source exists —    see VIBE below
//
// VIBE: campus culture has no measurable proxy in any public dataset. Rather
// than keep an unsourced number in a scoring formula, `vibe` is excluded from
// scoring entirely (see preferenceScore in matchEngine). The collegeData value
// is still surfaced in the UI as an editorial descriptor, clearly labelled.

const { OUTCOMES } = require('./outcomes');

const clamp10 = v => Math.max(0, Math.min(10, Math.round(v * 10) / 10));

// The spread here is deliberately compressed. Carnegie is a FOUR-level
// categorical in this database (67 R1, 6 R2, 2 R3, 27 baccalaureate), and it
// measures institutional research VOLUME — doctoral programmes, faculty, grant
// funding — not undergraduate research ACCESS, which is what actually matters
// to an applicant and which no public dataset measures.
//
// A wider mapping put every liberal arts college at 5.0 against 9.5 for every
// R1, which fed a flat ~4-point majorFit penalty to all 27 of them purely for
// their institutional type. Harvey Mudd graduates out-earn most of the R1s in
// this database. Reading a 4-level signal that hard over-states what it knows,
// so the range is narrowed and the continuous measured metric (earnings
// percentile) is left to do the finer differentiation.
const CARNEGIE_RESEARCH = {
  15: 9.0,  // R1: very high research activity
  16: 7.5,  // R2: high research activity
  17: 7.0,  // R3 / doctoral professional
  18: 6.5, 19: 6.5, 20: 6.5,  // master's universities
  21: 6.5, 22: 6.5, 23: 6.5,  // baccalaureate colleges
};

// Earnings percentile is computed once across every school that has data, so
// `pipeline` is a rank within this database rather than an absolute figure.
const EARNINGS_SORTED = Object.values(OUTCOMES)
  .map(o => o.earnings10)
  .filter(v => typeof v === 'number')
  .sort((a, b) => a - b);

function earningsPercentile(v) {
  if (typeof v !== 'number' || !EARNINGS_SORTED.length) return null;
  let below = 0;
  for (const e of EARNINGS_SORTED) { if (e < v) below++; else break; }
  return below / EARNINGS_SORTED.length;
}

/**
 * Metrics for one school, each tagged with where it came from.
 * Falls back to the hand-set collegeData value only where Scorecard has no
 * record for that school, and says so in `sources`.
 */
function fitMetricsFor(college) {
  const hand = college.fitMetrics || {};
  const o = OUTCOMES[college.name];
  const sources = {};
  const m = {};

  // satisfaction ← retention. 0.65 anchors the bottom so the selective range
  // this database covers (0.87–0.99) still spreads across the upper scale.
  if (o && typeof o.retention === 'number') {
    m.satisfaction = clamp10((o.retention - 0.65) / 0.35 * 10);
    sources.satisfaction = 'retention rate (College Scorecard)';
  } else {
    m.satisfaction = hand.satisfaction ?? 6;
    sources.satisfaction = 'editorial estimate';
  }

  if (o && CARNEGIE_RESEARCH[o.carnegie] != null) {
    m.research = CARNEGIE_RESEARCH[o.carnegie];
    sources.research = 'Carnegie classification (College Scorecard)';
  } else {
    m.research = hand.research ?? 5;
    sources.research = 'editorial estimate';
  }

  if (o && typeof o.diversity === 'number') {
    m.diversity = clamp10((o.diversity - 0.45) / 0.40 * 10);
    sources.diversity = 'Simpson index over enrolment demographics (College Scorecard)';
  } else {
    m.diversity = hand.diversity ?? 6;
    sources.diversity = 'editorial estimate';
  }

  const pct = o ? earningsPercentile(o.earnings10) : null;
  if (pct != null) {
    m.pipeline = clamp10(pct * 10);
    sources.pipeline = 'median earnings percentile (College Scorecard)';
  } else {
    m.pipeline = hand.pipeline ?? 6;
    sources.pipeline = 'editorial estimate';
  }

  // Retained for display only — never used in scoring.
  m.vibe = hand.vibe ?? 5;
  sources.vibe = 'editorial descriptor, not used in scoring';

  return { ...m, sources, measured: !!o };
}

/** Median earnings for ROI. Real figure where available. */
function medianEarnings(college) {
  const o = OUTCOMES[college.name];
  if (o && typeof o.earnings10 === 'number') {
    return { value: o.earnings10, years: 10, source: 'College Scorecard', measured: true };
  }
  return {
    value: college.medianSalary || 65000,
    years: null,
    source: 'editorial estimate',
    measured: false,
  };
}

function coverage() {
  const { COLLEGES } = require('../collegeData');
  const measured = COLLEGES.filter(c => OUTCOMES[c.name]).length;
  const withEarnings = COLLEGES.filter(c => OUTCOMES[c.name]?.earnings10).length;
  return { total: COLLEGES.length, measured, withEarnings };
}

module.exports = { fitMetricsFor, medianEarnings, earningsPercentile, coverage, CARNEGIE_RESEARCH };
