// src/data/internationalSchools.js
// Non-US universities from the QS World University Rankings 2026 top 200.
//
// WHY THIS FILE EXISTS SEPARATELY FROM collegeData.js
// ---------------------------------------------------
// These universities do not admit the way US universities do, so they cannot be
// described with the US schema. Australian universities publish no acceptance
// rate at all — they publish ATAR/IB cut-offs per course, and meeting the
// cut-off is the offer. UK offers are conditional A-level/IB grades. Canadian
// admission runs on a published grade minimum per programme. In all of these,
// "what percentage of applicants are admitted" is not the question the system
// answers, and the acceptance-rate figures circulating for them online come
// from commercial aggregators rather than institutions.
//
// So instead of inventing an admit rate and an SAT band for each, every school
// here carries a published-style ENTRY THRESHOLD, and src/matchEngine.js scores
// the student against that threshold rather than against a middle-50% band.
//
// PROVENANCE — same VERIFIED/DERIVED split that src/data/majorAdmissions.js uses
// ------------------------------------------------------------------------------
//   qsRank, name, country, city   VERIFIED — QS World University Rankings 2026
//   entry, tuitionUSD             DERIVED  — from the country norms below and
//                                            the school's rank within its country,
//                                            unless a `verified` block overrides
//                                            it with an institutional figure.
//
// Everything DERIVED is labelled as such wherever it surfaces, and
// `node src/data/auditData.js` reports the split. Do not present a DERIVED
// threshold to a student as a published entry requirement.

// ── Country admission and cost norms ─────────────────────────────────────────
// `entryScale` is the currency the country actually admits in. `bands` give the
// typical requirement at the strongest / mid / lower end of that country's
// representation in the QS top 200. Tuition is annual international
// undergraduate tuition in USD, before living costs.
const COUNTRY_PROFILES = {
  Australia: { livingCostUSD: 19000,
    visaSystem: 'au-500', entryScale: 'IB',
    // ATAR is the domestic currency; international applicants are assessed on
    // IB or their national qualification against a published equivalent.
    bands: { top: 38, mid: 34, low: 31 },
    atar: { top: 98, mid: 92, low: 85 },
    tuitionUSD: { top: 39000, mid: 34000, low: 29000 },
    english: 'IELTS 6.5-7.0',
    postStudyWork: 'Temporary Graduate visa (subclass 485): 2-3 years',
  },
  Canada: { livingCostUSD: 15000,
    visaSystem: 'ca-permit', entryScale: 'percentage',
    bands: { top: 92, mid: 87, low: 83 },
    tuitionUSD: { top: 45000, mid: 36000, low: 28000 },
    english: 'IELTS 6.5-7.0',
    postStudyWork: 'Post-Graduation Work Permit: up to 3 years',
  },
  'United Kingdom': { livingCostUSD: 10000,
    visaSystem: 'uk-student', entryScale: 'A-level',
    bands: { top: 'A*A*A', mid: 'AAA', low: 'AAB' },
    ib: { top: 40, mid: 36, low: 34 },
    tuitionUSD: { top: 46000, mid: 34000, low: 28000 },
    english: 'IELTS 6.5-7.5',
    postStudyWork: 'Graduate route: 2 years',
  },
  'Hong Kong': { livingCostUSD: 13000,
    visaSystem: 'hk-visa', entryScale: 'IB',
    bands: { top: 38, mid: 34, low: 31 },
    tuitionUSD: { top: 23000, mid: 21000, low: 18000 },
    english: 'IELTS 6.5',
    postStudyWork: 'IANG: 2 years, no job offer required',
  },
  Singapore: { livingCostUSD: 12000,
    visaSystem: 'sg-pass', entryScale: 'IB',
    bands: { top: 40, mid: 37, low: 34 },
    tuitionUSD: { top: 30000, mid: 26000, low: 22000 },
    english: 'IELTS 6.5-7.0',
    postStudyWork: 'Long-Term Visit Pass: 1 year to find work',
  },
  Japan: { livingCostUSD: 11000,
    visaSystem: 'jp-student', entryScale: 'IB',
    bands: { top: 38, mid: 34, low: 31 },
    tuitionUSD: { top: 9000, mid: 8000, low: 7000 },
    english: 'IELTS 6.5 / Japanese for most tracks',
    postStudyWork: 'Designated Activities: 1 year job-seeking',
  },
  'South Korea': { livingCostUSD: 10000,
    visaSystem: 'kr-d2', entryScale: 'IB',
    bands: { top: 38, mid: 34, low: 31 },
    tuitionUSD: { top: 12000, mid: 10000, low: 8000 },
    english: 'IELTS 6.5 / TOPIK for Korean-taught tracks',
    postStudyWork: 'D-10 job-seeking visa: up to 2 years',
  },
  Germany: { livingCostUSD: 12000,
    visaSystem: 'de-student', entryScale: 'IB',
    bands: { top: 36, mid: 33, low: 30 },
    tuitionUSD: { top: 4000, mid: 2000, low: 500 }, // public universities charge almost nothing
    english: 'IELTS 6.5 / German C1 for German-taught tracks',
    postStudyWork: '18-month job-seeking residence permit',
  },
  Netherlands: { livingCostUSD: 13000,
    visaSystem: 'nl-student', entryScale: 'IB',
    bands: { top: 36, mid: 33, low: 30 },
    tuitionUSD: { top: 24000, mid: 18000, low: 14000 },
    english: 'IELTS 6.5-7.0',
    postStudyWork: 'Orientation year (zoekjaar): 1 year',
  },
  Switzerland: { livingCostUSD: 20000,
    visaSystem: 'ch-student', entryScale: 'IB',
    bands: { top: 38, mid: 35, low: 32 },
    tuitionUSD: { top: 2000, mid: 1800, low: 1600 },
    english: 'IELTS 7.0 / German or French for many tracks',
    postStudyWork: '6-month job-seeking permit',
  },
  France: { livingCostUSD: 13000,
    visaSystem: 'fr-student', entryScale: 'IB',
    bands: { top: 38, mid: 34, low: 31 },
    tuitionUSD: { top: 18000, mid: 9000, low: 3000 },
    english: 'IELTS 6.5 / French B2 for French-taught tracks',
    postStudyWork: 'APS: 1 year job-seeking',
  },
  Sweden:      { livingCostUSD: 12000, visaSystem: 'eu-student', entryScale: 'IB', bands: { top: 36, mid: 33, low: 30 }, tuitionUSD: { top: 17000, mid: 15000, low: 13000 }, english: 'IELTS 6.5', postStudyWork: '1 year job-seeking permit' },
  Belgium:     { livingCostUSD: 11000, visaSystem: 'eu-student', entryScale: 'IB', bands: { top: 35, mid: 32, low: 30 }, tuitionUSD: { top: 6000,  mid: 4500,  low: 3000  }, english: 'IELTS 6.5', postStudyWork: 'Search year: 1 year' },
  Ireland:     { livingCostUSD: 14000, visaSystem: 'ie-student', entryScale: 'IB', bands: { top: 38, mid: 34, low: 31 }, tuitionUSD: { top: 30000, mid: 26000, low: 22000 }, english: 'IELTS 6.5', postStudyWork: 'Third Level Graduate Scheme: 2 years' },
  Italy:       { livingCostUSD: 11000, visaSystem: 'eu-student', entryScale: 'IB', bands: { top: 34, mid: 31, low: 28 }, tuitionUSD: { top: 5000,  mid: 4000,  low: 2500  }, english: 'IELTS 6.5', postStudyWork: '1 year job-seeking permit' },
  Denmark:     { livingCostUSD: 14000, visaSystem: 'eu-student', entryScale: 'IB', bands: { top: 36, mid: 33, low: 30 }, tuitionUSD: { top: 18000, mid: 16000, low: 14000 }, english: 'IELTS 6.5', postStudyWork: 'Establishment card: 2 years' },
  'New Zealand': { livingCostUSD: 16000, visaSystem: 'nz-student', entryScale: 'IB', bands: { top: 36, mid: 32, low: 29 }, tuitionUSD: { top: 28000, mid: 25000, low: 22000 }, english: 'IELTS 6.0-6.5', postStudyWork: 'Post-study work visa: up to 3 years' },
  Malaysia:    { livingCostUSD: 6000, visaSystem: 'my-student', entryScale: 'IB', bands: { top: 34, mid: 31, low: 28 }, tuitionUSD: { top: 9000,  mid: 7000,  low: 5000  }, english: 'IELTS 6.0', postStudyWork: 'Graduate pass: 1 year' },
  Taiwan:      { livingCostUSD: 7000, visaSystem: 'tw-student', entryScale: 'IB', bands: { top: 36, mid: 32, low: 29 }, tuitionUSD: { top: 6000,  mid: 5000,  low: 4000  }, english: 'IELTS 6.0 / Chinese for many tracks', postStudyWork: 'Job-seeking extension: 1 year' },
  Argentina:   { livingCostUSD: 6000, visaSystem: 'ar-student', entryScale: 'IB', bands: { top: 32, mid: 29, low: 26 }, tuitionUSD: { top: 5000,  mid: 3500,  low: 2000  }, english: 'Spanish required for most tracks', postStudyWork: 'Limited' },
  'Saudi Arabia': { livingCostUSD: 8000, visaSystem: 'sa-student', entryScale: 'IB', bands: { top: 34, mid: 31, low: 28 }, tuitionUSD: { top: 0, mid: 0, low: 0 }, english: 'IELTS 6.0', postStudyWork: 'Employer-sponsored only' },
};

// ── The schools ──────────────────────────────────────────────────────────────
// QS World University Rankings 2026, ranks 1-100, excluding the United States
// (already covered in collegeData.js) and excluding mainland China per project
// scope. Hong Kong and Taiwan are included.
//
// `tier` selects which band of the country profile applies and is assigned from
// the school's rank relative to its own country's representation, not globally —
// a UK school at rank 51 is mid-tier for the UK but would be top-tier for Japan.
const SCHOOLS = [
  // rank, name, country, city, tier, bestMajors
  [2,  'Imperial College London',                    'United Kingdom', 'London',      'top', ['Engineering', 'Medicine', 'Computer Science', 'Physics', 'Mathematics']],
  [4,  'University of Oxford',                       'United Kingdom', 'Oxford',      'top', ['Philosophy Politics and Economics', 'Medicine', 'Mathematics', 'Law', 'Computer Science']],
  [6,  'University of Cambridge',                    'United Kingdom', 'Cambridge',   'top', ['Mathematics', 'Engineering', 'Natural Sciences', 'Medicine', 'Computer Science']],
  [7,  'ETH Zurich',                                 'Switzerland',    'Zurich',      'top', ['Engineering', 'Computer Science', 'Physics', 'Mathematics', 'Architecture']],
  [8,  'National University of Singapore',           'Singapore',      'Singapore',   'top', ['Computer Science', 'Engineering', 'Business', 'Medicine', 'Law']],
  [9,  'University College London',                  'United Kingdom', 'London',      'top', ['Architecture', 'Medicine', 'Economics', 'Computer Science', 'Law']],
  [11, 'University of Hong Kong',                    'Hong Kong',      'Hong Kong',   'top', ['Medicine', 'Business', 'Law', 'Computer Science', 'Architecture']],
  [12, 'Nanyang Technological University',           'Singapore',      'Singapore',   'top', ['Engineering', 'Computer Science', 'Business', 'Materials Science', 'Education']],
  [19, 'The University of Melbourne',                'Australia',      'Melbourne',   'top', ['Medicine', 'Law', 'Business', 'Engineering', 'Computer Science']],
  [20, 'UNSW Sydney',                                'Australia',      'Sydney',      'top', ['Engineering', 'Business', 'Computer Science', 'Medicine', 'Architecture']],
  [22, 'École Polytechnique Fédérale de Lausanne',   'Switzerland',    'Lausanne',    'top', ['Engineering', 'Computer Science', 'Physics', 'Architecture', 'Mathematics']],
  [22, 'Technical University of Munich',             'Germany',        'Munich',      'top', ['Engineering', 'Computer Science', 'Physics', 'Mathematics', 'Management']],
  [25, 'The University of Sydney',                   'Australia',      'Sydney',      'top', ['Medicine', 'Business', 'Engineering', 'Law', 'Architecture']],
  [27, 'McGill University',                          'Canada',         'Montreal',    'top', ['Medicine', 'Engineering', 'Computer Science', 'Law', 'Business']],
  [28, 'Université Paris Sciences et Lettres',       'France',         'Paris',       'top', ['Mathematics', 'Physics', 'Computer Science', 'Economics', 'Humanities']],
  [29, 'University of Toronto',                      'Canada',         'Toronto',     'top', ['Computer Science', 'Engineering', 'Medicine', 'Business', 'Mathematics']],
  [31, "King's College London",                      'United Kingdom', 'London',      'top', ['Medicine', 'Law', 'International Relations', 'Nursing', 'Psychology']],
  [32, 'Australian National University',             'Australia',      'Canberra',    'top', ['Political Science', 'International Relations', 'Computer Science', 'Physics', 'Economics']],
  [32, 'Chinese University of Hong Kong',            'Hong Kong',      'Hong Kong',   'top', ['Medicine', 'Business', 'Engineering', 'Computer Science', 'Communications']],
  [34, 'University of Edinburgh',                    'United Kingdom', 'Edinburgh',   'mid', ['Medicine', 'Computer Science', 'Veterinary Medicine', 'Law', 'Philosophy']],
  [35, 'University of Manchester',                   'United Kingdom', 'Manchester',  'mid', ['Engineering', 'Computer Science', 'Business', 'Medicine', 'Chemistry']],
  [36, 'Monash University',                          'Australia',      'Melbourne',   'mid', ['Pharmacy', 'Engineering', 'Business', 'Medicine', 'Education']],
  [36, 'The University of Tokyo',                    'Japan',          'Tokyo',       'top', ['Engineering', 'Physics', 'Medicine', 'Economics', 'Law']],
  [38, 'Seoul National University',                  'South Korea',    'Seoul',       'top', ['Engineering', 'Business', 'Medicine', 'Computer Science', 'Chemistry']],
  [40, 'University of British Columbia',             'Canada',         'Vancouver',   'top', ['Computer Science', 'Engineering', 'Business', 'Forestry', 'Medicine']],
  [41, 'Institut Polytechnique de Paris',            'France',         'Palaiseau',   'top', ['Engineering', 'Computer Science', 'Mathematics', 'Physics', 'Economics']],
  [42, 'The University of Queensland',               'Australia',      'Brisbane',    'mid', ['Engineering', 'Medicine', 'Environmental Science', 'Business', 'Agriculture']],
  [44, 'Hong Kong University of Science and Technology', 'Hong Kong',  'Hong Kong',   'top', ['Engineering', 'Business', 'Computer Science', 'Mathematics', 'Economics']],
  [47, 'Delft University of Technology',             'Netherlands',    'Delft',       'top', ['Engineering', 'Architecture', 'Computer Science', 'Aerospace Engineering', 'Environmental Science']],
  [50, 'Yonsei University',                          'South Korea',    'Seoul',       'mid', ['Business', 'Medicine', 'Engineering', 'International Relations', 'Computer Science']],

  [51, 'University of Bristol',                      'United Kingdom', 'Bristol',     'mid', ['Engineering', 'Medicine', 'Law', 'Economics', 'Computer Science']],
  [53, 'University of Amsterdam',                    'Netherlands',    'Amsterdam',   'top', ['Communications', 'Economics', 'Political Science', 'Psychology', 'Computer Science']],
  [54, 'The Hong Kong Polytechnic University',       'Hong Kong',      'Hong Kong',   'mid', ['Engineering', 'Design', 'Business', 'Nursing', 'Computer Science']],
  [56, 'London School of Economics and Political Science', 'United Kingdom', 'London', 'top', ['Economics', 'Political Science', 'Law', 'Business', 'International Relations']],
  [57, 'Kyoto University',                           'Japan',          'Kyoto',       'top', ['Physics', 'Chemistry', 'Engineering', 'Medicine', 'Biology']],
  [58, 'Ludwig Maximilian University of Munich',     'Germany',        'Munich',      'top', ['Medicine', 'Physics', 'Law', 'Economics', 'Philosophy']],
  [58, 'University of Malaya',                       'Malaysia',       'Kuala Lumpur','top', ['Engineering', 'Medicine', 'Business', 'Computer Science', 'Law']],
  [60, 'KU Leuven',                                  'Belgium',        'Leuven',      'top', ['Engineering', 'Medicine', 'Computer Science', 'Philosophy', 'Biology']],
  [61, 'Korea University',                           'South Korea',    'Seoul',       'mid', ['Business', 'Law', 'Engineering', 'Computer Science', 'Political Science']],
  [63, 'City University of Hong Kong',               'Hong Kong',      'Hong Kong',   'mid', ['Business', 'Computer Science', 'Engineering', 'Communications', 'Law']],
  [63, 'National Taiwan University',                 'Taiwan',         'Taipei',      'top', ['Engineering', 'Computer Science', 'Medicine', 'Business', 'Law']],
  [65, 'University of Auckland',                     'New Zealand',    'Auckland',    'top', ['Engineering', 'Business', 'Medicine', 'Computer Science', 'Architecture']],
  [67, 'King Fahd University of Petroleum & Minerals', 'Saudi Arabia', 'Dhahran',     'top', ['Engineering', 'Computer Science', 'Chemistry', 'Business', 'Environmental Science']],
  [70, 'Paris-Saclay University',                    'France',         'Paris',       'mid', ['Mathematics', 'Physics', 'Biology', 'Computer Science', 'Chemistry']],
  [72, 'Lund University',                            'Sweden',         'Lund',        'top', ['Engineering', 'Medicine', 'Law', 'Environmental Science', 'Business']],
  [72, 'Sorbonne University',                        'France',         'Paris',       'mid', ['Humanities', 'Medicine', 'Mathematics', 'Physics', 'Law']],
  [74, 'The University of Warwick',                  'United Kingdom', 'Coventry',    'mid', ['Mathematics', 'Economics', 'Business', 'Computer Science', 'Engineering']],
  [75, 'Trinity College Dublin',                     'Ireland',        'Dublin',      'top', ['Medicine', 'Computer Science', 'Law', 'Business', 'Humanities']],
  [76, 'University of Birmingham',                   'United Kingdom', 'Birmingham',  'mid', ['Engineering', 'Medicine', 'Business', 'Computer Science', 'Chemistry']],
  [77, 'The University of Western Australia',        'Australia',      'Perth',       'mid', ['Medicine', 'Engineering', 'Agriculture', 'Business', 'Environmental Science']],
  [78, 'KTH Royal Institute of Technology',          'Sweden',         'Stockholm',   'top', ['Engineering', 'Computer Science', 'Architecture', 'Physics', 'Mathematics']],
  [79, 'University of Glasgow',                      'United Kingdom', 'Glasgow',     'mid', ['Medicine', 'Engineering', 'Law', 'Computer Science', 'Veterinary Medicine']],
  [80, 'University of Heidelberg',                   'Germany',        'Heidelberg',  'mid', ['Medicine', 'Physics', 'Chemistry', 'Law', 'Philosophy']],
  [82, 'Adelaide University',                        'Australia',      'Adelaide',    'low', ['Engineering', 'Medicine', 'Agriculture', 'Business', 'Computer Science']],
  [84, 'University of Buenos Aires',                 'Argentina',      'Buenos Aires','top', ['Medicine', 'Law', 'Engineering', 'Economics', 'Architecture']],
  [85, 'Tokyo Institute of Technology',              'Japan',          'Tokyo',       'mid', ['Engineering', 'Computer Science', 'Materials Science', 'Physics', 'Chemistry']],
  [86, 'University of Leeds',                        'United Kingdom', 'Leeds',       'low', ['Engineering', 'Business', 'Medicine', 'Environmental Science', 'Communications']],
  [87, 'University of Southampton',                  'United Kingdom', 'Southampton', 'low', ['Engineering', 'Computer Science', 'Medicine', 'Oceanography', 'Business']],
  [88, 'Free University of Berlin',                  'Germany',        'Berlin',      'mid', ['Political Science', 'Humanities', 'Biology', 'Psychology', 'Law']],
  [91, 'Osaka University',                           'Japan',          'Osaka',       'mid', ['Engineering', 'Medicine', 'Physics', 'Chemistry', 'Biology']],
  [92, 'The University of Sheffield',                'United Kingdom', 'Sheffield',   'low', ['Engineering', 'Architecture', 'Medicine', 'Computer Science', 'Politics']],
  [93, 'Uppsala University',                         'Sweden',         'Uppsala',     'mid', ['Medicine', 'Law', 'Physics', 'Biology', 'Humanities']],
  [94, 'Durham University',                          'United Kingdom', 'Durham',      'mid', ['Law', 'Business', 'Physics', 'History', 'Computer Science']],
  [94, 'University of Alberta',                      'Canada',         'Edmonton',    'mid', ['Engineering', 'Computer Science', 'Medicine', 'Business', 'Environmental Science']],
  [96, 'University of Technology Sydney',            'Australia',      'Sydney',      'low', ['Engineering', 'Computer Science', 'Business', 'Design', 'Nursing']],
  [97, 'The University of Nottingham',               'United Kingdom', 'Nottingham',  'low', ['Engineering', 'Medicine', 'Business', 'Pharmacy', 'Computer Science']],
  [98, 'Karlsruhe Institute of Technology',          'Germany',        'Karlsruhe',   'mid', ['Engineering', 'Computer Science', 'Physics', 'Chemistry', 'Mathematics']],
  [98, 'Polytechnic University of Milan',            'Italy',          'Milan',       'top', ['Architecture', 'Engineering', 'Design', 'Computer Science', 'Mathematics']],
  [100,'University of Zürich',                       'Switzerland',    'Zurich',      'mid', ['Medicine', 'Economics', 'Law', 'Biology', 'Psychology']],
];

// Institutional figures that override the derived country band. Add entries
// here as they are sourced — each needs a `source` string, same as
// majorAdmissions.js VERIFIED.
const VERIFIED_OVERRIDES = {
  // 'The University of Melbourne': {
  //   source: 'unimelb.edu.au international entry requirements 2026',
  //   entry: { scale: 'IB', value: 37 }, tuitionUSD: 40000,
  // },
};

/**
 * Expand the compact table into full school rows.
 * Rows are shaped so the rest of the app can treat them like COLLEGES entries,
 * but they carry `admissionsSystem: 'threshold'` and an `entry` object instead
 * of an acceptance rate and an SAT band.
 */
function buildInternationalSchools(startId = 1000) {
  return SCHOOLS.map(([qsRank, name, country, city, tier, bestMajors], i) => {
    const p = COUNTRY_PROFILES[country];
    if (!p) throw new Error(`No country profile for ${country} (${name})`);

    const override = VERIFIED_OVERRIDES[name];
    const entryValue = override?.entry?.value ?? p.bands[tier];
    const tuitionUSD = override?.tuitionUSD ?? p.tuitionUSD[tier];

    return {
      id: startId + i,
      name,
      country,
      city,
      location: `${city}, ${country}`,
      type: 'International',
      qsRank,
      tier,

      // The defining difference from a US row.
      admissionsSystem: 'threshold',
      visaSystem: p.visaSystem,

      entry: {
        scale: p.entryScale,              // 'IB' | 'A-level' | 'percentage'
        value: entryValue,                // 34 (IB) | 'AAA' (A-level) | 87 (percentage)
        atar: p.atar ? p.atar[tier] : null,
        ibEquivalent: p.ib ? p.ib[tier] : (p.entryScale === 'IB' ? entryValue : null),
        english: p.english,
        provenance: override ? 'VERIFIED' : 'DERIVED',
        source: override?.source || `country norm for ${country}, ${tier} tier`,
      },

      tuitionUSD,
      tuitionProvenance: override?.tuitionUSD ? 'VERIFIED' : 'DERIVED',
      postStudyWork: p.postStudyWork,
      bestMajors,

      // Aliases so the existing school-card, PDF and ROI code paths can read
      // these rows without special-casing every field. `rank` is the QS world
      // rank here, not the US News national rank the US rows carry — the UI
      // labels it by admissionsSystem so the two are never conflated.
      rank: qsRank,
      tuitionOutOfState: tuitionUSD,
      livingCostUSD: p.livingCostUSD,
      description: `${name} is ranked #${qsRank} in the QS World University Rankings 2026 and admits on published entry requirements rather than holistic review. ${p.postStudyWork} after graduation.`,
      financialAidIntl: p.aidNote || 'International students generally pay full fees; scholarships are competitive and limited.',
      // Neutral placeholders. College Scorecard covers US institutions only, so
      // fitMetricsFor() has no measured data for these and would otherwise fall
      // through to undefined.
      fitMetrics: { satisfaction: 7, research: 7, vibe: 7, diversity: 8, pipeline: 7 },
      website: null,

      // Deliberately absent: acceptanceRate, intlAcceptanceRate, satRange,
      // actRange, gpaRange, recommendedStrategy, visaStats. These describe a US
      // system and have no meaning here. Anything reading a school row must
      // branch on admissionsSystem rather than assume they exist.
    };
  });
}

const INTERNATIONAL_SCHOOLS = buildInternationalSchools();

module.exports = {
  INTERNATIONAL_SCHOOLS,
  COUNTRY_PROFILES,
  VERIFIED_OVERRIDES,
  buildInternationalSchools,
};
