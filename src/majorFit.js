// src/majorFit.js
// Decides whether a school actually offers a major, how strong it is in it,
// and how much harder (or easier) that major is to be admitted to there.
//
// Two fields in collegeData.js carry this information:
//   bestMajors      — the school's flagship programmes
//   majorDifficulty — a per-major admission multiplier (<1 = harder than the
//                     school's overall rate, >1 = easier). MIT lists
//                     business:1.1, UPenn lists business:0.7 (Wharton).
//
// The match engine previously used bestMajors for a flat ±15 on the fit score
// and ignored majorDifficulty entirely, which is why a Nursing applicant and a
// CS applicant received nearly the same school list.

const { EMPIRICAL_MAJOR_RATIOS, bandProvenance } = require('./data/majorAdmissions');
const { fitMetricsFor } = require('./data/fitMetrics');

// availability:
//   'universal'   — every four-year university teaches it; absence from
//                   bestMajors means "not a flagship", not "not offered"
//   'common'      — offered almost everywhere except small liberal arts
//                   colleges, which genuinely have no business or engineering
//   'specialized' — a real programme is required; most schools do not have one
const MAJOR_PROFILES = {
  cs: {
    availability: 'universal',
    match: ['computer science', 'computer engineering', 'data science', 'artificial intelligence',
            'machine learning', 'cybersecurity', 'informatics', 'information science', 'software'],
    difficultyKeys: ['cs', 'cybersecurity', 'cognitive'],
  },
  robotics: {
    availability: 'specialized',
    match: ['robotics', 'mechatronics', 'mechanical engineering', 'electrical engineering'],
    difficultyKeys: ['robotics', 'mechanical', 'engineering'],
  },
  engineering: {
    availability: 'common',
    match: ['engineering'],
    difficultyKeys: ['engineering', 'mechanical', 'aerospace', 'biomedical', 'bioengineering',
                     'industrial', 'optics', 'chemical', 'civil', 'electrical'],
  },
  business: {
    availability: 'common',
    match: ['business', 'finance', 'accounting', 'management', 'marketing', 'entrepreneur',
            'supply chain', 'hospitality'],
    difficultyKeys: ['business', 'finance'],
  },
  economics: {
    availability: 'universal',
    match: ['economics', 'econometrics'],
    difficultyKeys: ['economics'],
  },
  math: {
    availability: 'universal',
    match: ['mathematics', 'applied math', 'statistics', 'actuarial'],
    difficultyKeys: ['math'],
  },
  physics: {
    availability: 'universal',
    match: ['physics', 'astronomy', 'astrophysics', 'optics'],
    difficultyKeys: ['physics', 'optics'],
  },
  biology: {
    availability: 'universal',
    match: ['biology', 'pre-medicine', 'medicine', 'neuroscience', 'biochemistry',
            'molecular', 'genetics', 'physiology', 'veterinary', 'marine biology'],
    difficultyKeys: ['biology', 'medicine', 'neuroscience', 'biomedical', 'veterinary', 'marine'],
  },
  chemistry: {
    availability: 'universal',
    match: ['chemistry', 'biochemistry', 'chemical engineering', 'materials'],
    difficultyKeys: ['chemistry', 'pharmacy'],
  },
  policy: {
    availability: 'universal',
    match: ['political science', 'government', 'public policy', 'law', 'politics',
            'public affairs', 'criminal justice'],
    difficultyKeys: ['policy', 'law'],
  },
  international: {
    availability: 'specialized',
    match: ['international', 'global studies', 'foreign service', 'diplomacy', 'area studies'],
    difficultyKeys: ['international', 'globalhealth', 'languages'],
  },
  communications: {
    availability: 'common',
    match: ['communication', 'journalism', 'film', 'media', 'english', 'writing',
            'rhetoric', 'public relations', 'advertising'],
    difficultyKeys: ['communications', 'journalism', 'film', 'writing', 'drama'],
  },
  architecture: {
    availability: 'specialized',
    match: ['architecture', 'urban planning', 'urban studies', 'landscape', 'industrial design'],
    difficultyKeys: ['architecture'],
  },
  environmental: {
    availability: 'common',
    match: ['environment', 'sustainab', 'ecology', 'agricultur', 'forestry', 'marine', 'earth science'],
    difficultyKeys: ['environmental', 'agriculture', 'marine'],
  },
  publichealth: {
    availability: 'specialized',
    match: ['public health', 'global health', 'epidemiology', 'health policy'],
    difficultyKeys: ['publichealth', 'globalhealth'],
  },
  nursing: {
    availability: 'specialized',
    match: ['nursing', 'health science', 'allied health', 'pharmacy', 'physician assistant'],
    difficultyKeys: ['nursing', 'pharmacy'],
  },
  music: {
    availability: 'specialized',
    match: ['music', 'theater', 'theatre', 'drama', 'dance', 'performing arts',
            'conservatory', 'fine arts', 'studio art'],
    difficultyKeys: ['music', 'theater', 'drama', 'film'],
  },
  default: {
    availability: 'universal',
    match: [],
    difficultyKeys: [],
  },
};

// Words that carry no discriminating power when matching a free-text major
// against a school's bestMajors list.
const MAJOR_STOPWORDS = new Set([
  'and', 'of', 'the', 'in', 'for', 'studies', 'study', 'science', 'sciences',
  'arts', 'general', 'major', 'program', 'bachelor', 'bs', 'ba',
]);

function textTokens(str) {
  return String(str || '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !MAJOR_STOPWORDS.has(w));
}

/**
 * How strongly the school signals this major.
 *   3 = flagship  (named in bestMajors AND tracked in majorDifficulty)
 *   2 = named in bestMajors
 *   1 = tracked in majorDifficulty only
 *   0 = no signal in the database
 */
function majorEvidence(college, majorKey, majorText) {
  const profile = MAJOR_PROFILES[majorKey] || MAJOR_PROFILES.default;
  const bestMajors = (college.bestMajors || []).map(m => String(m).toLowerCase());
  const diffKeys = Object.keys(college.majorDifficulty || {}).filter(k => k !== 'default');

  const inBest = profile.match.some(w => bestMajors.some(m => m.includes(w)));
  const inDiff = profile.difficultyKeys.some(k => diffKeys.includes(k));

  // Free-text fallback — catches majors with no dedicated profile (Psychology,
  // History, Education, Agriculture) by matching the words the user typed.
  let rawMatch = false;
  if (!inBest && majorText) {
    const words = textTokens(majorText);
    rawMatch = words.length > 0 && bestMajors.some(m => words.some(w => m.includes(w)));
  }

  if ((inBest || rawMatch) && inDiff) return 3;
  if (inBest || rawMatch) return 2;
  if (inDiff) return 1;
  return 0;
}

/**
 * Whether it is credible that this school offers the major at all.
 * Large universities are treated as comprehensive; small colleges are not.
 */
function majorOffered(college, majorKey, evidence) {
  if (evidence > 0) return true;
  const profile = MAJOR_PROFILES[majorKey] || MAJOR_PROFILES.default;
  const size = college.studentBody || 0;

  switch (profile.availability) {
    case 'universal':   return true;
    case 'common':      return size >= 8000;   // excludes liberal arts colleges
    // Specialized programmes are never assumed. A large public may well have a
    // school of nursing or architecture, but plenty do not — Berkeley has no
    // nursing programme — so these are only offered as list filler when the
    // engine cannot fill the tiers from schools that actually name the major.
    case 'specialized': return size >= 25000 ? 'filler' : false;
    default:            return true;
  }
}

/**
 * Admission difficulty multiplier for this major at this school.
 * <1 means the major is more competitive than the school's overall rate.
 *
 * The numeric values in collegeData's `majorDifficulty` are NOT used here, and
 * that is deliberate. They were hand-set estimates with no source — UPenn
 * carried business: 0.7, implying Wharton is 30% harder than Penn overall, when
 * the published figures are 4.5% against 5.4%, or about 17%. Values like that
 * silently drove every probability in the report.
 *
 * Every number this function can return is now traceable:
 *   structural → 1.0, because the school admits university-wide (or this major
 *                sits in the Arts & Sciences division), so the school's own
 *                admit rate already IS this major's admit rate
 *   modelled   → EMPIRICAL_MAJOR_RATIOS, measured as published-major-rate over
 *                school-rate across the 12 schools that publish both
 *
 * Published schools never reach this function for a rate — majorAdmissionBand
 * returns their figures directly.
 *
 * `majorDifficulty` remains in collegeData and is still read by majorEvidence,
 * but only for the PRESENCE of a key, as a signal that the school treats the
 * major as notable. Its numbers are ignored.
 */
function majorDifficultyMultiplier(college, majorKey) {
  if (bandProvenance(college, majorKey) === 'structural') return 1;

  const empirical = EMPIRICAL_MAJOR_RATIOS[majorKey];
  return typeof empirical === 'number' ? clampMult(empirical) : 1;
}

function clampMult(v) {
  return Math.max(0.55, Math.min(1.45, Number(v) || 1));
}

/**
 * 0–100 alignment between the school and the major.
 * This is the term that makes the school list change when the major changes.
 */
function majorFitScore(college, majorKey, majorText) {
  const evidence = majorEvidence(college, majorKey, majorText);
  const avail    = majorOffered(college, majorKey, evidence);
  const offered  = avail !== false;
  // 'filler' means plausible but unverified — usable only to fill out a tier.
  const fillerOnly = avail === 'filler';
  // Computed before the early return so `difficulty` is meaningful even for a
  // school that does not offer the major. runMatchEngine filters those out, but
  // estimateForCollege answers "what would my odds be here" for any school, and
  // a hard-coded 1 there produced a band identical to the school-wide rate.
  const notOfferedMult = majorDifficultyMultiplier(college, majorKey);
  if (!offered) {
    return {
      evidence, offered: false, fillerOnly: false,
      score: 0, label: 'not offered', difficulty: notOfferedMult,
    };
  }

  // Bases leave headroom for the departmental adjustments below — if they sat
  // near 100 every flagship school would clamp to the same score and ordering
  // inside the tier would be lost.
  let score;
  let label;
  switch (evidence) {
    case 3: score = 80; label = 'flagship programme';       break;
    case 2: score = 68; label = 'named strength';           break;
    case 1: score = 56; label = 'established programme';    break;
    default:
      // Offered, but the database gives no signal that it is a strength.
      score = 36; label = 'offered, not a flagship';
  }

  // Departmental depth: research activity and earnings outcomes separate
  // schools inside the same evidence tier. Both are measured — Carnegie
  // classification and median-earnings percentile — rather than hand-rated.
  const fm = fitMetricsFor(college);
  score += Math.round((fm.research - 5) * 0.9);   // -4.5 .. +4.5
  score += Math.round((fm.pipeline - 6) * 1.1);   // -5.5 .. +4.4

  // A more competitive major at this school signals a serious department.
  const mult = majorDifficultyMultiplier(college, majorKey);
  if (mult < 0.95) score += 3;

  if (fillerOnly) label = 'may be offered — verify with the department';

  return {
    evidence, offered, fillerOnly,
    score: Math.max(0, Math.min(100, Math.round(score))),
    label,
    difficulty: mult,
  };
}

module.exports = {
  MAJOR_PROFILES,
  majorEvidence,
  majorOffered,
  majorDifficultyMultiplier,
  majorFitScore,
};
