// src/rag/knowledge/careers.js
// Structured career data + retrievable prose for the "CAREER OUTLOOK" section.
//
// Titles deliberately match CAREER_PATHS in src/engines/careerPredictor.js and
// SALARY_DB in public/index.html so the chart pairs likelihood with salary.

// [entry, senior] base salaries in USD. Entry figures are what an
// international new grad on OPT realistically signs for at a large employer.
const SALARY_TABLE = {
  cs: [
    ['Software Engineer', 118000, 240000],
    ['Machine Learning Engineer', 135000, 285000],
    ['Data Scientist', 108000, 205000],
    ['Product Manager', 115000, 240000],
    ['Quantitative Analyst', 145000, 350000],
    ['Research Scientist', 105000, 210000],
    ['Startup Founder', 60000, 400000],
  ],
  engineering: [
    ['Mechanical/Aerospace Engineer', 82000, 165000],
    ['Hardware Engineer', 95000, 190000],
    ['Systems Engineer', 88000, 170000],
    ['Engineering Manager', 118000, 225000],
    ['Research Engineer', 92000, 175000],
    ['Consultant', 92000, 210000],
  ],
  business: [
    ['Management Consultant', 95000, 245000],
    ['Investment Banking Analyst', 110000, 320000],
    ['Finance / Private Equity', 115000, 420000],
    ['Product Manager', 105000, 235000],
    ['Financial Analyst', 72000, 165000],
    ['Marketing Manager', 68000, 160000],
  ],
  economics: [
    ['Financial Analyst', 75000, 170000],
    ['Management Consultant', 95000, 245000],
    ['Data Analyst', 68000, 140000],
    ['Policy Analyst', 62000, 128000],
    ['Investment Banking', 110000, 320000],
    ['Graduate / PhD', 32000, 165000],
  ],
  biology: [
    ['Medical Doctor (MD)', 65000, 390000],
    ['Biotech / Pharma', 82000, 195000],
    ['Research Scientist', 78000, 165000],
    ['Physician Assistant', 92000, 150000],
    ['Public Health', 58000, 120000],
    ['Graduate / PhD', 32000, 155000],
  ],
  math: [
    ['Quantitative Analyst', 145000, 350000],
    ['Data Scientist', 108000, 205000],
    ['Software Engineer', 118000, 240000],
    ['Financial Analyst', 75000, 170000],
    ['Research Scientist', 95000, 190000],
  ],
  physics: [
    ['Research Scientist', 92000, 190000],
    ['Data Scientist', 108000, 205000],
    ['Quantitative Analyst', 145000, 350000],
    ['Hardware Engineer', 95000, 190000],
    ['Graduate / PhD', 32000, 165000],
  ],
  default: [
    ['Industry Professional', 68000, 150000],
    ['Consultant', 88000, 200000],
    ['Data Analyst', 65000, 135000],
    ['Nonprofit / Government', 52000, 112000],
    ['Graduate Student', 28000, 135000],
    ['Entrepreneur', 55000, 400000],
  ],
};

// Employers that sponsor H-1B at volume, by field.
const EMPLOYERS = {
  cs: ['Google', 'Amazon', 'Microsoft', 'Meta', 'Apple', 'Nvidia', 'Salesforce', 'Oracle', 'Stripe', 'Databricks'],
  engineering: ['Boeing', 'Lockheed Martin', 'Tesla', 'Intel', 'Applied Materials', 'General Electric', 'Qualcomm', 'Texas Instruments', 'Ford', 'Micron'],
  business: ['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group', 'Goldman Sachs', 'J.P. Morgan', 'Morgan Stanley', 'Deloitte', 'PwC', 'EY', 'Amazon'],
  economics: ['Goldman Sachs', 'J.P. Morgan', 'Analysis Group', 'Cornerstone Research', 'Federal Reserve system', 'World Bank', 'McKinsey & Company', 'Deloitte', 'Bloomberg', 'Citadel'],
  biology: ['Genentech', 'Pfizer', 'Moderna', 'Regeneron', 'Merck', 'Johnson & Johnson', 'Broad Institute', 'NIH-funded university labs', 'Illumina', 'Amgen'],
  math: ['Jane Street', 'Citadel', 'Two Sigma', 'Google', 'D. E. Shaw', 'Goldman Sachs', 'Nvidia', 'Optiver', 'Microsoft', 'IBM Research'],
  physics: ['Nvidia', 'Intel', 'Applied Materials', 'Lockheed Martin', 'IBM Research', 'Argonne National Laboratory', 'SpaceX', 'ASML', 'Google', 'Citadel'],
  default: ['Amazon', 'Deloitte', 'Accenture', 'IBM', 'JPMorgan Chase', 'Microsoft', 'PwC', 'EY', 'Google', 'Capital One'],
};

const DOCS = [
  {
    id: 'career-opt-stem',
    topic: 'career',
    title: 'STEM OPT gives three shots at the H-1B lottery',
    tags: ['opt', 'stem', 'work', 'authorization', 'extension', '36', 'months', 'visa'],
    cond: ctx => ctx.isSTEM,
    text: '{{majorLabel}} is a STEM-designated field, so you are eligible for 12 months of OPT plus a 24-month STEM extension — 36 months of post-graduation work authorisation in total. That length matters more than anything else in this section: it gives you three consecutive H-1B lottery attempts instead of one, which takes cumulative odds from roughly a coin flip to substantially better than even.',
  },
  {
    id: 'career-opt-nonstem',
    topic: 'career',
    title: 'Non-STEM OPT is a single 12-month window',
    tags: ['opt', 'nonstem', 'work', 'authorization', '12', 'months', 'visa', 'limited'],
    cond: ctx => !ctx.isSTEM,
    text: '{{majorLabel}} is not STEM-designated at most universities, which means 12 months of OPT and exactly one H-1B lottery attempt before you must leave or change status. Two realistic workarounds exist: choose a STEM-designated variant of the degree where one is offered (many economics, finance, and business analytics programmes have one), or plan on a STEM-designated master\'s to reset the clock.',
  },
  {
    id: 'career-h1b-odds',
    topic: 'career',
    title: 'H-1B lottery mechanics and current odds',
    tags: ['h1b', 'lottery', 'cap', 'sponsorship', 'odds', 'registration', 'march'],
    cond: ctx => true,
    text: 'The H-1B cap is 65,000 plus 20,000 reserved for US master\'s graduates. Registration runs in March, selection is random, and recent cycles have selected roughly 25–30% of registrations — the beneficiary-centric rule introduced for FY2025 cut duplicate registrations sharply and improved genuine odds. The master\'s allocation is the reason a US graduate degree is a visa strategy as much as an academic one.',
  },
  {
    id: 'career-cpt-rules',
    topic: 'career',
    title: 'CPT rules that can destroy OPT eligibility',
    tags: ['cpt', 'internship', 'opt', 'eligibility', 'fulltime', 'parttime', 'rules'],
    cond: ctx => true,
    text: 'Curricular Practical Training authorises internships during study. Part-time CPT of 20 hours a week or less never affects OPT. Twelve months or more of full-time CPT eliminates OPT entirely — an irreversible mistake that a surprising number of students make by accepting a full-time summer plus co-op sequence without checking the cumulative total with their DSO.',
  },
  {
    id: 'career-sponsorship-reality',
    topic: 'career',
    title: 'Which employers actually sponsor',
    tags: ['sponsor', 'employer', 'h1b', 'hiring', 'large', 'startup', 'reality'],
    cond: ctx => true,
    text: 'Sponsorship concentrates in large employers with immigration counsel on retainer. Startups under roughly 200 people frequently will not sponsor at all, and many US federal roles and defence contractors require citizenship regardless of visa status. Filter your job search by sponsorship history early — the public H-1B disclosure data is searchable and is the fastest way to build a realistic target list.',
  },
  {
    id: 'career-alt-visa',
    topic: 'career',
    title: 'Paths that do not depend on the lottery',
    tags: ['o1', 'eb2', 'niw', 'l1', 'green', 'card', 'alternative', 'canada'],
    cond: ctx => true,
    text: 'Three routes bypass the H-1B lottery. The O-1A extraordinary-ability visa has no cap and no lottery, but requires a documented record — publications, press, awards, judging — which is why undergraduate research and competitions have a second life as immigration evidence. EB-2 NIW allows self-petition for a green card without an employer. L-1 intracompany transfer works if you join a multinational abroad first and transfer in after a year.',
  },
  {
    id: 'career-grad-school',
    topic: 'career',
    title: 'When a graduate degree is the right call',
    tags: ['graduate', 'masters', 'phd', 'school', 'decision', 'funding'],
    cond: ctx => true,
    text: 'A US master\'s buys the second H-1B allocation, another OPT period, and a second campus recruiting cycle — but costs two years and often full tuition. Decide by the end of junior year of university. Funded PhD programmes are a different calculation entirely: they pay a stipend, cover tuition, and carry their own visa timeline, and in {{majorLabel}} the funded route is competitive but real.',
  },
  {
    id: 'career-recruiting-timing',
    topic: 'career',
    title: 'US recruiting runs a year ahead',
    tags: ['recruiting', 'internship', 'timing', 'career', 'fair', 'cycle', 'freshman'],
    cond: ctx => true,
    text: 'US campus recruiting for summer internships happens 9–12 months in advance — August to October of the preceding academic year for consulting, banking, and big tech. International students routinely miss the first cycle because the timing is unlike anything at home. Attend the career fair in your first September, even with nothing to apply for.',
  },
  {
    id: 'career-salary-context',
    topic: 'career',
    title: 'Reading salary figures honestly',
    tags: ['salary', 'compensation', 'cost', 'living', 'total', 'equity', 'tax'],
    cond: ctx => true,
    text: 'Published figures are total compensation in high-cost metros. A $150,000 offer in the Bay Area is roughly a $95,000 offer in Austin after housing and state tax, and equity components at large tech firms vest over four years with real downside. Compare offers on take-home after rent, not on the headline number.',
  },
];

module.exports = { DOCS, SALARY_TABLE, EMPLOYERS };
