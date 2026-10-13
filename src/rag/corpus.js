// src/rag/corpus.js
// Assembles every retrievable document and builds the BM25 index once at
// require-time. Two sources:
//   1. the curated knowledge files in ./knowledge
//   2. one generated document per school in src/collegeData.js
//
// The school documents are what make this "go through the database" — the
// same 100-school table that drives the match engine is also the retrieval
// corpus for anything school-specific.

const { RagIndex } = require('./retriever');
const { COLLEGES } = require('../collegeData');
// Real earnings, so the Q&A cannot quote a different figure from the school card.
const { medianEarnings } = require('../data/fitMetrics');

const strategyKb = require('./knowledge/strategy');
const gapKb      = require('./knowledge/gaps');
const essayKb    = require('./knowledge/essays');
const roundKb    = require('./knowledge/rounds');
const timelineKb = require('./knowledge/timeline');
const careerKb   = require('./knowledge/careers');
const visaKb     = require('./knowledge/visa');
const countryKb  = require('./knowledge/countries');
const profileKb  = require('./knowledge/profile');
const internationalKb = require('./knowledge/international');

function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US');
}

// Turn one COLLEGES row into a retrievable document. Everything a query might
// plausibly hit — majors, tags, aid policy, location, why-good bullets — goes
// into the text so BM25 can find the school from a natural-language question.
// Selectivity tier derived from the acceptance rate, which is audited against
// published figures. The `rank` field is NOT used here: 49 of 102 schools claim
// a top-25 national rank, so stating "ranked #22 nationally" in a document the
// Q&A quotes back to students would be asserting something false. Acceptance
// rate carries the same signal and is verifiable.
function selectivityTier(rate) {
  if (rate <= 8)  return 'one of the most selective universities in the US';
  if (rate <= 20) return 'a highly selective university';
  if (rate <= 40) return 'a selective university';
  if (rate <= 65) return 'a moderately selective university';
  return 'an accessible university that admits most applicants';
}

function schoolToDoc(c) {
  const parts = [
    c.description,
    `${c.name} is located in ${c.location} and is ${selectivityTier(c.acceptanceRate)} in the ${c.type.toLowerCase()} sector.`,
    `It admits ${c.acceptanceRate}% of all applicants and about ${c.intlAcceptanceRate}% of international applicants.`,
    `Admitted students typically present a GPA between ${c.gpaRange[0]} and ${c.gpaRange[1]} and SAT scores between ${c.satRange[0]} and ${c.satRange[1]} (ACT ${c.actRange[0]}–${c.actRange[1]}).`,
    `Strongest programmes: ${(c.bestMajors || []).join(', ')}.`,
    `Tuition is ${money(c.tuitionOutOfState)} per year before housing. Financial aid for international students: ${c.financialAidIntl}.`,
    `Undergraduate enrolment is about ${Number(c.studentBody).toLocaleString('en-US')} with a ${c.gradRate}% graduation rate and median earnings near ${money(medianEarnings(c).value)} about ten years after entry.`,
    `The recommended application round here is ${c.recommendedStrategy}.`,
    c.visaStats ? `International students make up about ${c.visaStats.intlPct}% of the student body; H-1B sponsorship outcomes for graduates are ${c.visaStats.h1bRate}.` : '',
    (c.whyGood || []).length ? `Why students choose it: ${(c.whyGood || []).join('; ')}.` : '',
  ].filter(Boolean);

  return {
    id: `school-${c.id}`,
    topic: 'school',
    title: c.name,
    tags: [
      ...(c.tags || []),
      ...(c.bestMajors || []),
      c.location, c.type,
      c.recommendedStrategy,
      /need-blind/i.test(c.financialAidIntl || '') ? 'need-blind' : 'need-aware',
    ],
    text: parts.join(' '),
    meta: {
      collegeId: c.id,
      rank: c.rank,
      intlRate: c.intlAcceptanceRate,
      needBlind: /need-blind/i.test(c.financialAidIntl || ''),
      strategy: c.recommendedStrategy,
      majors: c.bestMajors || [],
    },
  };
}

// Documents that only make sense for one admissions system are tagged here
// rather than by editing every document. Application rounds (ED/EA/REA, the
// Common App, the UC window), the F-1/OPT/CPT/H-1B sequence, the OPT-framed
// career advice and the US deadline calendar are all meaningless — and actively
// wrong — for a student applying to Melbourne or Toronto. `system` is checked
// in composer.js against the destinations actually on the student's list.
const tagSystem = (docs, system) => docs.map(d => ({ ...d, system: d.system || system }));

// Individual documents in otherwise system-neutral files that describe US
// mechanics — the Common App activity limit, the I-20 financial certification,
// Common App direct admissions, US community-college transfer articulation, and
// the STEM-OPT designation gap. Tagged by id because their files are mostly
// destination-agnostic and should not be tagged wholesale.
//
// Deliberately NOT listed: intl-threshold-explained and intl-compare-systems,
// which mention Early Decision and the H-1B by way of contrast ("no Early
// Decision", "without the lottery that governs the US H-1B"). That is exactly
// what a student comparing destinations needs to read.
const US_ONLY_DOC_IDS = new Set([
  'strat-ec-depth',
  'strat-financial-certification',
  'strat-direct-admissions',
  'strat-transfer-pathway',
  'gap-impact-visa-planning',
]);

const tagById = docs => docs.map(d =>
  US_ONLY_DOC_IDS.has(d.id) ? { ...d, system: 'us' } : d);

const KNOWLEDGE_DOCS = [
  ...tagById(strategyKb.DOCS),
  ...tagById(gapKb.DOCS),
  ...essayKb.DOCS,
  ...tagSystem(roundKb.DOCS,    'us'),
  ...tagSystem(timelineKb.DOCS, 'us'),
  ...tagSystem(careerKb.DOCS,   'us'),
  ...tagSystem(visaKb.DOCS,     'us'),
  ...countryKb.DOCS,
  ...profileKb.DOCS,
  ...internationalKb.DOCS,
];

const SCHOOL_DOCS = COLLEGES.map(schoolToDoc);

const ALL_DOCS = [...KNOWLEDGE_DOCS, ...SCHOOL_DOCS];

// Built once per process — indexing ~300 docs takes single-digit milliseconds.
const index = new RagIndex(ALL_DOCS);

// Duplicate ids would silently shadow each other in retrieval; fail loudly.
const seen = new Set();
for (const d of ALL_DOCS) {
  if (seen.has(d.id)) throw new Error(`Duplicate RAG document id: ${d.id}`);
  seen.add(d.id);
}

module.exports = {
  index,
  ALL_DOCS,
  KNOWLEDGE_DOCS,
  SCHOOL_DOCS,
  schoolToDoc,
  SALARY_TABLE: careerKb.SALARY_TABLE,
  EMPLOYERS: careerKb.EMPLOYERS,
  COUNTRY_PROFILES: countryKb.COUNTRY_PROFILES,
};
