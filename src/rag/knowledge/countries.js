// src/rag/knowledge/countries.js
// Country context. `competition` is how crowded that national applicant pool is
// at selective US universities — it is used for narrative context only and
// never modifies the probability model (intlAcceptanceRate already prices it in).

const COUNTRY_PROFILES = {
  China:        { adj: 'Chinese',      competition: 'very high', visaDelayRisk: true,
                  note: 'the largest single international applicant pool in the US, and the one where readers see the most similar-looking files' },
  India:        { adj: 'Indian',       competition: 'very high', visaDelayRisk: true,
                  note: 'a very large pool concentrated in CS and engineering, with heavy competition for the same handful of universities' },
  'South Korea':{ adj: 'South Korean', competition: 'very high', visaDelayRisk: false,
                  note: 'a pool with unusually strong test scores, which shifts differentiation onto activities and essays' },
  Vietnam:      { adj: 'Vietnamese',   competition: 'high',      visaDelayRisk: false,
                  note: 'a fast-growing pool where financial aid demand is high and need-aware policies bite hardest' },
  Singapore:    { adj: 'Singaporean',  competition: 'high',      visaDelayRisk: false,
                  note: 'a small pool with very strong academic preparation and national service timing to plan around' },
  Japan:        { adj: 'Japanese',     competition: 'moderate',  visaDelayRisk: false,
                  note: 'a smaller pool where strong English scores are the main differentiator' },
  Taiwan:       { adj: 'Taiwanese',    competition: 'high',      visaDelayRisk: false,
                  note: 'a strong STEM-heavy pool competing largely against mainland Chinese applicants for the same seats' },
  'Hong Kong':  { adj: 'Hong Kong',    competition: 'high',      visaDelayRisk: false,
                  note: 'an academically strong pool with excellent English and heavy overlap in target schools' },
  Thailand:     { adj: 'Thai',         competition: 'moderate',  visaDelayRisk: false,
                  note: 'a moderate pool where a distinctive activity record goes further than in the largest pools' },
  Indonesia:    { adj: 'Indonesian',   competition: 'moderate',  visaDelayRisk: false,
                  note: 'a growing pool where regional representation still works in an applicant\'s favour' },
  Nigeria:      { adj: 'Nigerian',     competition: 'high',      visaDelayRisk: true,
                  note: 'a large and academically strong pool where aid demand and visa refusal rates are both elevated' },
  Brazil:       { adj: 'Brazilian',    competition: 'moderate',  visaDelayRisk: false,
                  note: 'a moderate pool where schools actively seek Latin American representation' },
  Canada:       { adj: 'Canadian',     competition: 'high',      visaDelayRisk: false,
                  note: 'treated as international for aid but familiar to readers, with transcripts that need no translation' },
  Turkey:       { adj: 'Turkish',      competition: 'moderate',  visaDelayRisk: false,
                  note: 'a moderate pool with strong olympiad representation' },
  Pakistan:     { adj: 'Pakistani',    competition: 'high',      visaDelayRisk: true,
                  note: 'a pool with high aid demand where need-aware policies significantly affect outcomes' },
  Russia:       { adj: 'Russian',      competition: 'moderate',  visaDelayRisk: true,
                  note: 'a strong olympiad pool currently facing significant banking and consular friction' },
  default:      { adj: 'international',competition: 'moderate',  visaDelayRisk: false,
                  note: 'a pool where regional representation can work in your favour if your record is distinctive' },
};

const DOCS = [
  {
    id: 'country-pool-veryhigh',
    topic: 'country',
    title: 'Competing inside a very large national pool',
    tags: ['country', 'competition', 'pool', 'quota', 'regional', 'high'],
    cond: ctx => ctx.countryCompetition === 'very high',
    text: 'You are applying from {{countryName}} — {{countryNote}}. Admissions offices shape international enrolment by region, so the practical comparison set is other {{countryAdj}} applicants for {{majorLabel}}, not the pool as a whole. That group tends to arrive with similar scores, similar competition results, and similar essay subjects, which is why an extra 20 SAT points changes very little and a genuinely specific activity record changes a lot.',
  },
  {
    id: 'country-pool-high',
    topic: 'country',
    title: 'Competing inside a crowded national pool',
    tags: ['country', 'competition', 'pool', 'regional', 'differentiation'],
    cond: ctx => ctx.countryCompetition === 'high',
    text: 'Applicants from {{countryName}} form {{countryNote}}. You are read against that group rather than against the whole applicant pool, so the marginal value of another test point is low and the marginal value of a distinctive, verifiable activity record is high.',
  },
  {
    id: 'country-pool-moderate',
    topic: 'country',
    title: 'Regional representation as an advantage',
    tags: ['country', 'representation', 'regional', 'diversity', 'moderate', 'advantage'],
    cond: ctx => ['moderate', 'low'].includes(ctx.countryCompetition),
    text: 'Applicants from {{countryName}} come from {{countryNote}}. Schools building a geographically varied class have a genuine incentive to admit strong candidates from less-represented countries, so a well-differentiated file from {{countryName}} carries further than the same file from the largest sending countries. Make the specifics of where you are from visible rather than generic.',
  },
  {
    id: 'country-transcript-context',
    topic: 'country',
    title: 'Making an unfamiliar transcript legible',
    tags: ['transcript', 'grading', 'scale', 'context', 'conversion', 'international'],
    cond: ctx => true,
    text: 'A {{gpa}} GPA from a {{countryAdj}} school is not self-explanatory to a US reader. Ensure your school profile states the grading scale, the distribution of grades in your cohort, and how many advanced courses students may take. Where no profile exists, ask your counsellor to write one — readers who cannot calibrate a transcript fall back on test scores, which removes your best evidence.',
  },
  {
    id: 'country-aid-reality',
    topic: 'country',
    title: 'Financial aid reality for international applicants',
    tags: ['aid', 'financial', 'international', 'needaware', 'blind', 'cost', 'country'],
    cond: ctx => true,
    text: 'Fewer than ten US universities are need-blind for international applicants. Everywhere else, an aid request is weighed in the admission decision itself. This is the least-discussed factor in international admissions and the most common cause of a surprising denial from a school where the numbers looked comfortable.',
  },
  {
    id: 'country-english-signal',
    topic: 'country',
    title: 'English scores as a comparability signal',
    tags: ['english', 'toefl', 'ielts', 'signal', 'comparable', 'international'],
    cond: ctx => true,
    text: 'For international files, English proficiency and standardised test scores are the only two numbers directly comparable across every school system in the world. That is why they carry more weight in an international read than in a domestic one, and why a marginal score does more damage than the published minimums suggest.',
  },
];

module.exports = { DOCS, COUNTRY_PROFILES };
