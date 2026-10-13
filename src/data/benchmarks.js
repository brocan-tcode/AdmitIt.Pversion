// src/data/benchmarks.js
// Published admissions figures used to audit the model and the school database.
//
// These are the closest thing to ground truth available without buying data:
// each school's own published rate for the 2025–26 cycle. Third-party chancing
// tools (CollegeVine, CollegeSimply, PrepScholar) are themselves estimates
// built on top of these same numbers, so they are treated as secondary
// reference points rather than as truth.
//
// Run `node src/data/auditData.js` to compare the database against this table.

const PUBLISHED_2025 = [
  { match: 'Massachusetts Institute',   rate: 4.5,   note: 'MIT' },
  { match: 'Harvard',                   rate: 3.6 },
  { match: 'Stanford',                  rate: 3.9 },
  { match: 'University of Chicago',     rate: 4.5 },
  { match: 'University of Pennsylvania',rate: 5.4,   majorNote: 'Wharton 4.5%' },
  { match: 'Johns Hopkins',             rate: 6.0 },
  { match: 'New York University',       rate: 7.7,   majorNote: 'Stern/CAS/Nursing under 5%' },
  { match: 'Cornell',                   rate: 8.8,   majorNote: 'Engineering 5.2%, CALS 16.7%' },
  { match: 'UCLA',                      rate: 9.0,   intlRate: 6.0 },
  { match: 'Boston University',         rate: 11.1 },
  { match: 'Carnegie Mellon',           rate: 11.07, majorNote: 'SCS under 5%, Dietrich ~24%' },
  { match: 'Georgia Tech',              rate: 15.0,  majorNote: 'out-of-state 9%, CS OOS under 8%' },
  { match: 'University of Michigan',    rate: 17.9,  majorNote: 'Ross preferred admission 7-9%' },
  { match: 'Texas at Austin',           rate: 31.0,  majorNote: 'CS 10-15%' },
  { match: 'Illinois Urbana',           rate: 36.6,  majorNote: 'CS 7.2%' },
  { match: 'Purdue',                    rate: 43.4,  intlRate: 22.5, majorNote: 'Engineering 34.7%, Education 70.5%' },
  { match: 'Penn State',                rate: 61.0 },
  { match: 'Indiana University Bloom',  rate: 78.0 },
  { match: 'Michigan State',            rate: 85.0 },
  { match: 'Arizona State',             rate: 90.0 },
];

// Properties the probability model must satisfy. These encode admissions
// reality rather than any particular school's number, so they stay valid as
// the underlying rates drift.
const MODEL_PROPERTIES = [
  {
    id: 'median-applicant-near-base-rate',
    describe: 'A student at a school\'s median with average everything should land within a factor of ~2.5 of that school\'s international admit rate.',
  },
  {
    id: 'monotonic-in-strength',
    describe: 'At a fixed school, odds must never decrease as GPA and test scores rise.',
  },
  {
    id: 'ordering-matches-selectivity',
    describe: 'For a fixed student, ranking schools by predicted odds should broadly track ranking them by published admit rate.',
  },
  {
    id: 'major-differentiates',
    describe: 'At a school with published by-major data, a competitive major must return materially lower odds than an uncompetitive one.',
  },
];

module.exports = { PUBLISHED_2025, MODEL_PROPERTIES };
