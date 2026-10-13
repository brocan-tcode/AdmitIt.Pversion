// src/rag/context.js
// Builds the single context object that drives the whole RAG pipeline.
//
// It does three jobs:
//   1. normalises the raw profile form into typed fields
//   2. derives the boolean signals that gate document eligibility (cond)
//   3. produces the `vars` map used to fill {{placeholders}} in retrieved text
//
// Everything here is computed from the profile plus the engine output — no
// network, no model, no randomness.

const { getMajorKey } = require('../matchEngine');
const { annualCost } = require('../data/costModel');
const { COUNTRY_PROFILES } = require('./knowledge/countries');
const { MAJOR_LABELS, COMPETITIONS, RIGOR_SUBJECTS, isStemMajor } = require('./knowledge/reference');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function money(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

function joinList(arr, conj = 'and') {
  const a = arr.filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, ${conj} ${a[a.length - 1]}`;
}

/**
 * @param {object} profile   raw form body
 * @param {object} analysis  output of matchEngine.runAnalysis()
 * @param {object} scores    { profileScore, rigorIndex, ecScore }
 * @param {Date}   now       injectable for deterministic tests
 */
function buildContext(profile = {}, analysis = {}, scores = {}, now = new Date()) {
  const activities = Array.isArray(profile.activities) ? profile.activities : [];
  const nonEmpty   = activities.filter(a => (a.years || 0) > 0 || a.description);

  const gpa   = parseFloat(profile.gpa) || 0;
  const sat   = parseInt(profile.sat) || 0;
  const act   = parseInt(profile.act) || 0;
  const satEq = sat || (act ? act * 44 : 0);
  const toefl = parseInt(profile.toefl) || 0;
  const ielts = parseFloat(profile.ielts) || 0;

  const majorKey   = getMajorKey(profile.major);
  const majorLabel = MAJOR_LABELS[majorKey] || MAJOR_LABELS.default;

  const countryName = profile.country || '';
  const cp = COUNTRY_PROFILES[countryName] || COUNTRY_PROFILES.default;

  const schools       = analysis.schools || [];
  const reaches       = schools.filter(s => s.tier === 'reach');
  const matchReaches  = schools.filter(s => s.tier === 'match'  && s.subLabel === 'match/reach');
  const matches       = schools.filter(s => s.tier === 'match'  && !s.subLabel);
  const matchSafeties = schools.filter(s => s.tier === 'safety' && s.subLabel === 'match/safety');
  const safeties      = schools.filter(s => s.tier === 'safety' && !s.subLabel);

  const topReach  = reaches[0]?.college  || schools[0]?.college || null;
  const topMatch  = matches[0]?.college  || matchReaches[0]?.college || topReach;
  const topSafety = safeties[0]?.college || matchSafeties[0]?.college || null;

  // ── Application cycle ────────────────────────────────────────
  // School year is treated as starting in August.
  const grade = parseInt(profile.grade) || 12;
  const schoolYearStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const applyYear  = schoolYearStart + Math.max(0, 12 - grade); // year applications are submitted
  const entryYear  = applyYear + 1;
  const isSenior   = grade >= 12;
  const isPostApplication = now.getFullYear() > applyYear ||
    (now.getFullYear() === applyYear + 1 && now.getMonth() >= 1);

  // ── Activity signals ─────────────────────────────────────────
  const awardsText   = String(profile.awards || '').trim();
  const researchText = String(profile.research || '').trim();

  const awardCount = nonEmpty.filter(a =>
    ['International Award / Competition', 'National Award / Competition'].includes(a.type)).length;

  const hasNationalAward = awardCount > 0 || awardsText.length > 5;
  const hasResearch      = nonEmpty.some(a => a.type === 'Research Experience') ||
                           nonEmpty.some(a => a.type === 'Published Work / Patent') ||
                           researchText.length > 20;
  const hasLeadership    = nonEmpty.some(a =>
    ['Founder / President', 'Captain / Editor'].includes(a.leadership) ||
    ['School President / Captain / Founder'].includes(a.type));
  const hasCommunityService = nonEmpty.some(a => a.type === 'Community Service');

  // ── Score bands from the matched schools ─────────────────────
  const reachSat25 = topReach?.satRange?.[0] || 1450;
  const reachSat75 = topReach?.satRange?.[1] || 1560;
  const matchSat50 = topMatch?.satRange
    ? Math.round((topMatch.satRange[0] + topMatch.satRange[1]) / 2)
    : 1400;

  const profileScore = scores.profileScore || 0;
  const rigorIndex   = scores.rigorIndex   || 0;
  const ecScore      = scores.ecScore      || 0;
  const topReachProb = reaches[0]?.probability || 0;

  // Calibrated against computeProfileScore in ragEngine.js, whose weights sum to
  // exactly 100. These thresholds were 85/72/56 when the score could only reach
  // 90; they are scaled here so a band means the same thing it always did.
  // `elite` additionally requires the top reach to be genuinely in play — a high
  // score against a list of 3% schools is not an elite position.
  const strengthBand =
    profileScore >= 88 && topReachProb >= 8 ? 'elite' :
    profileScore >= 74 ? 'strong' :
    profileScore >= 58 ? 'solid' : 'developing';

  // ── Cost, aid, and list shape ────────────────────────────────
  const costs = schools.map(s => s.annualCost ?? annualCost(s.college)).sort((a, b) => a - b);
  const oneYearCost = costs.length ? costs[Math.floor(costs.length / 2)] : 68000;

  const needBlind = schools
    .filter(s => /need-blind/i.test(s.college.financialAidIntl || ''))
    .map(s => s.college.name);

  const ucSchools = schools
    .filter(s => /University of California/i.test(s.college.name))
    .map(s => s.college.name);

  const budgetMax = parseInt(profile.budgetMax) || 0;

  // Preferred early-round target: the highest-ranked reach or match whose own
  // recommended strategy is binding/restrictive, else the strongest match.
  const edCandidate =
    [...reaches, ...matchReaches, ...matches].find(s => s.college.recommendedStrategy === 'ED') ||
    [...reaches, ...matchReaches].find(s => ['REA', 'EA'].includes(s.college.recommendedStrategy)) ||
    matches[0] || reaches[0] || null;

  const shortName = c => (c ? String(c.name).replace(/\s*\(.*?\)\s*/g, '').trim() : '');

  const ctx = {
    // raw / normalised
    profile, activities, nonEmptyActivities: nonEmpty,
    name: profile.name || 'This student',
    grade, gpa, sat, act, satEq, toefl, ielts,
    major: profile.major || '', majorKey, majorLabel,
    countryName, countryAdj: cp.adj, countryNote: cp.note,
    countryCompetition: cp.competition,
    isHighCompetitionCountry: ['very high', 'high'].includes(cp.competition),
    hasVisaDelayRisk: !!cp.visaDelayRisk,
    apCount: parseInt(profile.apCount) || 0,
    totalAPsOffered: parseInt(profile.totalAPsOffered) || 0,
    honorsCourses: parseInt(profile.honorsCourses) || 0,
    dualEnrollment: parseInt(profile.dualEnrollment) || 0,
    ibProgram: !!profile.ibProgram,
    awardsText, researchText,
    budgetMax, locationPref: profile.locationPref || 'any',

    // scores
    profileScore, rigorIndex, ecScore, strengthBand,

    // signals used by cond()
    activityCount: nonEmpty.length,
    hasAwards: awardsText.length > 5 || awardCount > 0,
    hasNationalAward, hasResearch, hasLeadership, hasCommunityService,
    awardHeavy: awardCount >= 2 && awardCount >= nonEmpty.length / 2,
    isSTEM: isStemMajor(majorKey, profile.major),
    isResearchMajor: ['cs', 'engineering', 'math', 'physics', 'biology', 'chemistry', 'robotics', 'environmental', 'publichealth'].includes(majorKey),
    needsTestRetake: satEq === 0 || (topReach ? satEq < reachSat75 : satEq < 1500),
    hasUC: ucSchools.length > 0,
    isSenior, isPostApplication,

    // Whether the matched list actually contains a safe option. The 100-school
    // database is weighted toward selective universities — only a handful admit
    // above 70% — so a student below that range gets a list with no safety in
    // it. Advice must not claim safety options exist when they do not.
    // ── Destination ────────────────────────────────────────────
    // Which admissions systems are actually on this student's list. Used to
    // gate the US-only knowledge (Common App rounds, F-1/OPT/H-1B, the US
    // deadline calendar) so it never reaches a student applying to Melbourne.
    destination: profile.destination || 'us',
    hasUSSchools: schools.some(s => s.admissionsSystem !== 'threshold'),
    hasThresholdSchools: schools.some(s => s.admissionsSystem === 'threshold'),
    visaSystems: [...new Set(schools
      .map(s => s.college.visaSystem || (s.admissionsSystem === 'threshold' ? null : 'us-f1'))
      .filter(Boolean))],
    destinationCountries: [...new Set(schools
      .map(s => s.college.country || 'United States'))],

    hasSafety: (safeties.length + matchSafeties.length) > 0,
    bestOdds: schools.length ? Math.max(...schools.map(s => s.probability)) : 0,
    belowCorpusRange: schools.length > 0 &&
      (safeties.length + matchSafeties.length) === 0 &&
      Math.max(...schools.map(s => s.probability)) < 70,

    // The stated budget excludes every school in the database. The match engine
    // still returns the cheapest options so the student gets a usable report,
    // but each is flagged over-budget and the advice has to lead with that.
    budgetInfeasible: budgetMax > 0 && schools.length > 0 && schools.every(s => s.overBudget),
    overBudgetCount: schools.filter(s => s.overBudget).length,
    cheapestCost: schools.length
      ? Math.min(...schools.map(s => s.annualCost ?? annualCost(s.college)))
      : 0,

    // school context
    schools, reaches, matchReaches, matches, matchSafeties, safeties,
    topReach, topMatch, topSafety, edCandidate,
    schoolCount: schools.length,
    reachSat25, reachSat75, matchSat50,
    oneYearCost, needBlind, ucSchools,

    // engine passthrough
    gaps: analysis.gaps || [],
    careers: analysis.careers || [],
    roiData: analysis.roiData || [],
    essaySignals: analysis.essay || null,
    activityPlan: analysis.activityPlan || [],

    // cycle
    now, applyYear, entryYear, monthNames: MONTH_NAMES,

    // helpers
    shortName, money, joinList,
  };

  // Does the student's list include this visa/admissions system? Used as the
  // eligibility gate on destination-specific knowledge documents.
  ctx.hasDestination = system => ctx.visaSystems.includes(system);

  // ── Placeholder values ───────────────────────────────────────
  ctx.vars = {
    name:        ctx.name,
    major:       ctx.major || majorLabel,
    majorLabel,
    countryName: countryName || 'your country',
    countryAdj:  cp.adj,
    countryNote: cp.note,
    gpa:         gpa ? gpa.toFixed(2) : 'unreported',
    satLabel:    satEq ? (sat ? `SAT ${sat}` : `ACT ${act} (about ${satEq} SAT-equivalent)`) : 'an application with no test score',
    rigorIndex:  rigorIndex.toFixed(1),
    ecScore:     ecScore.toFixed(1),
    profileScore: String(profileScore),
    activityCount: String(nonEmpty.length),
    schoolCount:   String(schools.length),
    // Size of the whole database, not the matched list. Two knowledge documents
    // tell the student how many schools this tool holds; hardcoding it there
    // meant the number went stale the moment a school was added or removed.
    corpusSchoolCount: String(require('../collegeData').COLLEGES.length),

    topReach:  shortName(topReach)  || 'your top reach school',
    topMatch:  shortName(topMatch)  || 'your strongest match',
    topSafety: shortName(topSafety) || 'your safety schools',

    reachSat25:      String(reachSat25),
    reachSat75:      String(reachSat75),
    reachSatTarget:  String(Math.min(1600, Math.round((reachSat25 + 20) / 10) * 10)),
    matchSat50:      String(matchSat50),

    englishTest:    toefl > 0 ? 'the TOEFL' : ielts > 0 ? 'the IELTS' : 'the TOEFL or IELTS',
    englishCurrent: toefl > 0 ? `TOEFL ${toefl}` : ielts > 0 ? `IELTS ${ielts}` : 'no English score on file',
    englishTarget:  toefl > 0 ? '110+' : ielts > 0 ? '7.5+' : 'TOEFL 105+ or IELTS 7.5+',

    rigorSubjects:   RIGOR_SUBJECTS[majorKey] || RIGOR_SUBJECTS.default,
    competitionList: COMPETITIONS[majorKey]   || COMPETITIONS.default,

    oneYearCost:  money(oneYearCost),
    budgetLabel:  budgetMax > 0 ? `under ${money(budgetMax)} per year` : 'full sticker price',
    budgetMaxLabel: budgetMax > 0 ? money(budgetMax) : 'no stated limit',
    cheapestCost: money(schools.length
      ? Math.min(...schools.map(s => s.annualCost ?? annualCost(s.college)))
      : 0),
    needBlindList: needBlind.length ? joinList(needBlind.slice(0, 3).map(n => n.replace(/\s*\(.*?\)\s*/g, ''))) : 'none currently',
    safetyList:   [...safeties, ...matchSafeties].length
      ? joinList([...safeties, ...matchSafeties].slice(0, 3).map(s => shortName(s.college)))
      : 'none on the current list',
    // Printed verbatim, NOT rounded. Rounding here put "your strongest odds are
    // 38% at Arizona State" two sentences away from "Arizona State University at
    // 37.5%" in the same paragraph — the same school quoted at two numbers.
    // Probabilities already carry exactly one decimal from calcProbability, so
    // every surface that prints one must print it unchanged.
    bestOdds: schools.length ? String(Math.max(...schools.map(s => s.probability))) : '0',
    bestOddsSchool: schools.length
      ? shortName(schools.reduce((a, b) => (b.probability > a.probability ? b : a)).college)
      : 'any school on this list',
    ucList: ucSchools.length ? joinList(ucSchools.map(n => n.replace('University of California, ', 'UC '))) : 'the UC campuses on your list',

    supplementEstimate: String(Math.max(4, Math.round(schools.length * 2.2))),
    lastTestMonth: 'October',
    edRecommendation: edCandidate
      ? `${shortName(edCandidate.college)} under ${edCandidate.college.recommendedStrategy}`
      : 'the strongest school where an early round genuinely helps',
    applyYear: String(applyYear),
    entryYear: String(entryYear),
  };

  return ctx;
}

/** Replace {{placeholders}} with context values. Unknown keys are removed. */
function fill(text, ctx) {
  if (!text) return '';
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = ctx.vars[key];
    return v === undefined || v === null ? '' : String(v);
  }).replace(/\s{2,}/g, ' ').trim();
}

module.exports = { buildContext, fill, MONTH_NAMES, money, joinList };
