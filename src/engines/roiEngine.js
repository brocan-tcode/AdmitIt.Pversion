// src/engines/roiEngine.js
// Calculates expected financial ROI for a given school + major combination.

const MAJOR_SALARY_MULTIPLIERS = {
  cs:          1.45,
  engineering: 1.30,
  business:    1.10,
  economics:   1.15,
  math:        1.20,
  biology:     0.95,
  chemistry:   1.00,
  nursing:     1.05,
  default:     1.00,
};

// Shared with the match engine and the career predictor — see src/majorKey.js.
// The local copy this replaced matched 'cs' as a substring, so Economics,
// Physics, Statistics and Mathematics were all priced with the 1.45 CS salary
// multiplier instead of their own.
const { getMajorKey } = require('../majorKey');

// Room, board, fees and outcome rate are absent from collegeData for every
// school, so these used to be flat defaults ($18,000 / $2,000 / 85%) that made
// cost of attendance identical for a Manhattan campus and a rural one. They are
// now modelled per school from type, state cost of living, and graduation rate.
const { roomAndBoard, mandatoryFees, outcomeRate } = require('../data/costModel');
const { medianEarnings } = require('../data/fitMetrics');

function calculateROI(school, student) {
  const tuition        = school.tuitionOutOfState || school.tuition || 50000;
  const housing        = school.housing ?? roomAndBoard(school);
  const fees           = school.fees    ?? mandatoryFees(school);
  const totalCost4yr   = (tuition + housing + fees) * 4;

  // Real median earnings from College Scorecard where the school is covered,
  // otherwise the editorial estimate that used to be the only source. The
  // hand-set values carried a mean absolute error of $9,448 against the
  // measured figures, with 11 schools off by more than $20,000.
  const earn          = medianEarnings(school);
  const baseSalary    = earn.value;
  const majorKey = getMajorKey(student?.major);

  // UNITS BUG, fixed here. MAJOR_SALARY_MULTIPLIERS were calibrated against a
  // hand-set *starting* salary. `baseSalary` is now measured median earnings
  // TEN YEARS after entry, across ALL majors at the school — a figure that
  // already reflects the school's own major mix. Applying the full ratio on top
  // double-counts it: MIT Computer Science came out at $207,889, which is not a
  // credible median.
  //
  // The square root is an explicit approximation of "partly already priced in",
  // not a tuning knob. The real fix is per-major earnings, which College
  // Scorecard does publish at CIP-4 level (Purdue Computer Science: $63,749
  // two years after completion) — see the note in README-RAG.md.
  const rawMult        = MAJOR_SALARY_MULTIPLIERS[majorKey] || 1.0;
  const majorMult      = Math.round(Math.sqrt(rawMult) * 1000) / 1000;
  const adjustedSalary = baseSalary * majorMult;

  const employmentRate = school.employmentRate ?? school.employment_rate ?? outcomeRate(school);
  const expectedIncome = adjustedSalary * employmentRate;

  // Simple payback period (years to break even vs no college at avg $45k)
  const opportunityCostPerYear = 45000;
  const annualPremium          = expectedIncome - opportunityCostPerYear;
  const paybackYears           = annualPremium > 0
    ? Math.round(totalCost4yr / annualPremium)
    : null;

  const roiRatio = expectedIncome / (totalCost4yr / 4); // annual income vs annual cost

  return {
    totalCost4yr,
    annualCost: tuition + housing + fees,
    tuition, roomAndBoard: housing, fees,
    baseEarnings: baseSalary,
    majorMult,
    majorMultRaw: rawMult,
    earningsSource: earn.source,
    earningsMeasured: earn.measured,
    earningsYears: earn.years,
    expectedAnnualSalary: Math.round(adjustedSalary),
    employmentRate,
    roiRatio:     Math.round(roiRatio * 100) / 100,
    paybackYears,
    roiGrade:     roiRatio >= 1.5 ? 'Excellent' : roiRatio >= 1.0 ? 'Good' : roiRatio >= 0.7 ? 'Fair' : 'Poor',
  };
}

module.exports = { calculateROI };
