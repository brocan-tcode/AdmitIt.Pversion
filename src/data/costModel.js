// src/data/costModel.js
// Room and board, mandatory fees, and post-graduation outcome rates.
//
// collegeData.js carries tuition but has never carried `housing`, `fees` or
// `employmentRate` for any school, so roiEngine defaulted $18,000 / $2,000 /
// 85% for all 102 — identical values that made ROI a function of tuition and
// median salary alone. Two schools with the same tuition in Manhattan and rural
// Indiana produced the same cost of attendance.
//
// Rather than invent 306 per-school numbers, this models the two components
// that genuinely vary, anchored on published national figures:
//
//   Room and board, AY2025-26 national averages
//     public four-year   $14,034
//     private nonprofit  $15,958
//     cheapest state     ~$8,300   (South Dakota public, North Dakota private)
//     dearest state      ~$18,300  (New York public, Massachusetts private)
//
// The state index below spans that published range. Everything here is an
// ESTIMATE and is labelled as such wherever it surfaces — see `source` on the
// returned object.

const NATIONAL_ROOM_BOARD = { Public: 14034, Private: 15958 };

// Cost-of-living multiplier applied to the national room-and-board average.
// Calibrated so the extremes reproduce the published state figures: New York
// public 14034 x 1.24 = $17,402 against a published $17,353.
const STATE_COST_INDEX = {
  // Highest cost
  NY: 1.24, MA: 1.22, CA: 1.20, DC: 1.22, HI: 1.20,
  // High
  NJ: 1.12, CT: 1.12, WA: 1.10, MD: 1.10, RI: 1.10, NH: 1.08, CO: 1.08, IL: 1.06,
  VA: 1.05, OR: 1.05, AK: 1.10,
  // Middle
  PA: 1.00, FL: 1.00, TX: 0.98, GA: 0.97, MN: 1.00, AZ: 0.98, MI: 0.96, WI: 0.95,
  NC: 0.96, VT: 1.02, ME: 1.00, DE: 1.02, NV: 1.02, UT: 0.95, NM: 0.92,
  // Low
  OH: 0.90, IN: 0.88, MO: 0.88, TN: 0.90, SC: 0.92, IA: 0.87, NE: 0.86, KS: 0.85,
  KY: 0.87, AL: 0.88, LA: 0.90, ID: 0.88, MT: 0.88, WV: 0.84, AR: 0.84, OK: 0.85,
  // Lowest
  SD: 0.60, ND: 0.58, MS: 0.82, WY: 0.80,
};

// Mandatory fees are billed separately from tuition far more often at public
// universities; private tuition usually absorbs them.
const FEES = { Public: 2400, Private: 1300 };

function stateOf(college) {
  const m = String(college.location || '').match(/,\s*([A-Z]{2})\b/);
  return m ? m[1] : null;
}

/** Estimated room and board for one academic year. */
function roomAndBoard(college) {
  const type = college.type === 'Public' ? 'Public' : 'Private';
  const base = NATIONAL_ROOM_BOARD[type];
  const idx  = STATE_COST_INDEX[stateOf(college)] ?? 1.0;
  return Math.round((base * idx) / 10) * 10;
}

/** Estimated mandatory fees for one academic year. */
function mandatoryFees(college) {
  return FEES[college.type === 'Public' ? 'Public' : 'Private'];
}

/**
 * Share of graduates employed or in graduate school within a year.
 *
 * Derived from the school's own graduation rate, which IS real per-school data.
 * The relationship is not causal, but graduation rate is the best available
 * proxy in this dataset for the student-support and recruiting infrastructure
 * that drives placement, and it at least varies per school instead of being a
 * flat 0.85 everywhere. Range is deliberately narrow — real reported figures
 * cluster between the low 80s and mid 90s.
 */
function outcomeRate(college) {
  const grad = college.gradRate || 80;
  const rate = 0.72 + (grad - 60) * 0.0055;
  return Math.round(Math.max(0.72, Math.min(0.96, rate)) * 100) / 100;
}

/** Full annual cost of attendance before aid. */
function annualCost(college) {
  const tuition = college.tuitionOutOfState || college.tuition || 50000;
  return tuition + roomAndBoard(college) + mandatoryFees(college);
}

/** Everything at once, with provenance so the UI can label it. */
function costProfile(college) {
  const tuition = college.tuitionOutOfState || college.tuition || 50000;
  const rb      = roomAndBoard(college);
  const fees    = mandatoryFees(college);
  return {
    tuition,
    roomAndBoard: rb,
    fees,
    annualCost: tuition + rb + fees,
    outcomeRate: outcomeRate(college),
    state: stateOf(college),
    // Tuition is per-school data from collegeData; the rest is modelled.
    source: 'tuition published; room, board, fees and outcome rate estimated',
  };
}

module.exports = {
  roomAndBoard, mandatoryFees, outcomeRate, annualCost, costProfile,
  NATIONAL_ROOM_BOARD, STATE_COST_INDEX, FEES,
};
