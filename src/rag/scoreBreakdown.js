// src/rag/scoreBreakdown.js
// The 100-point profile score, decomposed.
//
// This file is the ONLY place the score weights and thresholds exist.
// `computeProfileScore` in ragEngine.js is now the sum of what this returns, so
// the chat's "here is where you lost points" can never disagree with the number
// on the dashboard — the project rule is that a figure shown twice is read from
// one place.
//
// Weights sum to exactly 100 for a maximal profile:
//   GPA 25 + test 22 + English 10 + rigour 16 + activities 14
//   + research 6 + awards 7 = 100

function gpaComponent(profile) {
  const gpa = parseFloat(profile.gpa) || 0;
  const max = 25;
  if (gpa >= 3.9) return { earned: 25, max, detail: `GPA ${gpa.toFixed(2)} is in the top band (3.90+)`, nextStep: null, nextGain: 0 };
  if (gpa >= 3.7) return { earned: 18, max, detail: `GPA ${gpa.toFixed(2)} sits in the 3.70–3.89 band`, nextStep: 'lift the GPA to 3.90', nextGain: 7 };
  if (gpa >= 3.5) return { earned: 11, max, detail: `GPA ${gpa.toFixed(2)} sits in the 3.50–3.69 band`, nextStep: 'lift the GPA to 3.70', nextGain: 7 };
  return {
    earned: 5, max,
    detail: gpa ? `GPA ${gpa.toFixed(2)} is below 3.50` : 'no GPA on file',
    nextStep: gpa ? 'lift the GPA to 3.50' : 'enter your GPA', nextGain: 6,
  };
}

function testComponent(profile) {
  const sat = parseInt(profile.sat) || 0;
  const act = parseInt(profile.act) || 0;
  const ts  = sat || act * 44;
  const max = 22;
  const label = sat ? `SAT ${sat}` : act ? `ACT ${act} (≈${ts} SAT)` : null;

  if (!ts) return {
    earned: 0, max, detail: 'no test score on file — this is the largest single block of unclaimed points',
    nextStep: 'sit the SAT or ACT and score 1300+', nextGain: 11,
  };
  if (ts >= 1500) return { earned: 22, max, detail: `${label} is in the top band (1500+)`, nextStep: null, nextGain: 0 };
  if (ts >= 1400) return { earned: 16, max, detail: `${label} sits in the 1400–1499 band`, nextStep: 'reach 1500', nextGain: 6 };
  if (ts >= 1300) return { earned: 11, max, detail: `${label} sits in the 1300–1399 band`, nextStep: 'reach 1400', nextGain: 5 };
  return { earned: 5, max, detail: `${label} is below 1300`, nextStep: 'reach 1300', nextGain: 6 };
}

function englishComponent(profile) {
  const toefl = parseInt(profile.toefl) || 0;
  const ielts = parseFloat(profile.ielts) || 0;
  const max = 10;
  if (toefl >= 110 || ielts >= 8.0) return { earned: 10, max, detail: `${toefl ? `TOEFL ${toefl}` : `IELTS ${ielts}`} is in the top band`, nextStep: null, nextGain: 0 };
  if (toefl >= 100 || ielts >= 7.0) return { earned: 7, max, detail: `${toefl ? `TOEFL ${toefl}` : `IELTS ${ielts}`} clears the 100 / 7.0 line but not the top band`, nextStep: 'reach TOEFL 110 or IELTS 8.0', nextGain: 3 };
  if (toefl > 0 || ielts > 0) return { earned: 3, max, detail: `${toefl ? `TOEFL ${toefl}` : `IELTS ${ielts}`} is below the 100 / 7.0 line most selective schools expect`, nextStep: 'reach TOEFL 100 or IELTS 7.0', nextGain: 4 };
  return { earned: 0, max, detail: 'no English test score on file', nextStep: 'sit the TOEFL or IELTS', nextGain: 7 };
}

function rigorComponent(rigorIndex) {
  const max = 16;
  const earned = Math.round(rigorIndex * 1.6);
  return {
    earned, max,
    detail: `course rigour ${rigorIndex.toFixed(1)}/10 converts to ${earned} of ${max}`,
    nextStep: earned >= max ? null : 'take more of the advanced courses your school offers',
    nextGain: Math.min(max - earned, 3),
  };
}

function activitiesComponent(ecScore) {
  const max = 14;
  const earned = Math.round(ecScore * 0.7);
  return {
    earned, max,
    detail: `extracurricular impact ${ecScore.toFixed(1)}/20 converts to ${earned} of ${max}`,
    nextStep: earned >= max ? null : 'take a leadership title, or add depth to your strongest activity',
    nextGain: Math.min(max - earned, 4),
  };
}

function researchComponent(profile) {
  const has = !!(profile.research && profile.research.length > 20);
  return {
    earned: has ? 6 : 0, max: 6,
    detail: has ? 'research recorded' : 'nothing in the research field',
    nextStep: has ? null : 'add a mentored research project or independent study',
    nextGain: has ? 0 : 6,
  };
}

function awardsComponent(profile) {
  const has = !!(profile.awards && profile.awards.length > 20);
  return {
    earned: has ? 7 : 0, max: 7,
    detail: has ? 'awards recorded' : 'nothing in the awards field',
    nextStep: has ? null : 'enter a recognised competition and record the result',
    nextGain: has ? 0 : 7,
  };
}

/**
 * @returns {{ total:number, max:number, components:Array }}
 *   components: { key, label, earned, max, lost, detail, nextStep, nextGain }
 */
function scoreBreakdown(profile = {}, rigorIndex = 0, ecScore = 0) {
  const parts = [
    { key: 'gpa',        label: 'GPA',                 ...gpaComponent(profile) },
    { key: 'test',       label: 'SAT / ACT',           ...testComponent(profile) },
    { key: 'english',    label: 'English proficiency', ...englishComponent(profile) },
    { key: 'rigor',      label: 'Course rigour',       ...rigorComponent(rigorIndex) },
    { key: 'activities', label: 'Activities',          ...activitiesComponent(ecScore) },
    { key: 'research',   label: 'Research',            ...researchComponent(profile) },
    { key: 'awards',     label: 'Awards',              ...awardsComponent(profile) },
  ].map(c => ({ ...c, lost: c.max - c.earned }));

  const total = Math.min(100, parts.reduce((n, c) => n + c.earned, 0));
  const max   = parts.reduce((n, c) => n + c.max, 0);
  return { total, max, components: parts };
}

/** Components that cost the most points, biggest loss first. */
function biggestLosses(breakdown, n = 3) {
  return breakdown.components
    .filter(c => c.lost > 0)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, n);
}

/** Cheapest realistic gains — what actually moves the number soonest. */
function quickestGains(breakdown, n = 3) {
  return breakdown.components
    .filter(c => c.nextStep && c.nextGain > 0)
    .sort((a, b) => b.nextGain - a.nextGain)
    .slice(0, n);
}

module.exports = { scoreBreakdown, biggestLosses, quickestGains };
