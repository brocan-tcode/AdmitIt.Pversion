// src/rag/knowledge/visa.js
// Knowledge for the "VISA INFO" section.
// The frontend Visa tab renders its own hardcoded 4-section layout; this text
// feeds the API `visaInfo` field, which the PDF export renders.

const DOCS = [
  {
    id: 'visa-f1-process',
    topic: 'visa', slot: 'f1',
    title: 'The F-1 process end to end',
    tags: ['f1', 'visa', 'process', 'i20', 'sevis', 'ds160', 'interview', 'embassy'],
    cond: ctx => true,
    text: 'The F-1 sequence runs: accept an offer, send financial documents to the school\'s international office, receive the I-20, pay the SEVIS I-901 fee, complete the DS-160, book the consular appointment, and attend the interview. You may enter the US up to 30 days before the programme start date printed on the I-20 and no earlier. Book the interview the day slots open — summer waits in {{countryName}} regularly run six weeks or more, and a missed start date means deferring a semester.',
  },
  {
    id: 'visa-f1-documents',
    topic: 'visa', slot: 'f1',
    title: 'What to bring to the interview',
    tags: ['documents', 'interview', 'checklist', 'financial', 'proof', 'passport'],
    cond: ctx => true,
    text: 'Bring the I-20, passport valid six months beyond entry, DS-160 confirmation, SEVIS fee receipt, admission letter, financial evidence covering roughly {{oneYearCost}} for the first year, transcripts and test scores, and evidence of ties to {{countryName}}. Financial documents should be recent, in the sponsor\'s name, and consistent with what the school certified — inconsistency between the two is a common refusal reason.',
  },
  {
    id: 'visa-f1-interview',
    topic: 'visa', slot: 'f1',
    title: 'What the consular officer is deciding',
    tags: ['interview', 'consular', 'nonimmigrant', 'intent', 'refusal', '214b'],
    cond: ctx => true,
    text: 'The interview usually lasts two to four minutes and turns on one legal question: whether you are a genuine student who intends to return home. Answer in short, specific sentences — why this university, why this major, who is paying, what you will do afterwards. Refusals under section 214(b) are for failure to demonstrate non-immigrant intent, and volunteering that you plan to stay and work in the US permanently is the fastest way to trigger one.',
  },
  {
    id: 'visa-status-rules',
    topic: 'visa', slot: 'f1',
    title: 'Staying in status once you arrive',
    tags: ['status', 'fulltime', 'credits', 'dso', 'sevis', 'rules', 'travel'],
    cond: ctx => true,
    text: 'F-1 status requires full-time enrolment every term, no off-campus work without authorisation, on-campus work capped at 20 hours a week during term, a travel signature on the I-20 before each re-entry, and address updates to the DSO within 10 days of moving. A single term below full-time without prior DSO approval terminates the SEVIS record, and reinstatement is slow and uncertain.',
  },
  {
    id: 'visa-opt-stem',
    topic: 'visa', slot: 'opt',
    title: 'OPT with the STEM extension',
    tags: ['opt', 'stem', 'extension', '36', 'months', 'everify', 'application'],
    cond: ctx => ctx.isSTEM,
    text: '{{majorLabel}} qualifies for the 24-month STEM extension on top of the standard 12 months, giving 36 months of work authorisation. Apply for the initial OPT up to 90 days before graduation and no later than 60 days after; USCIS processing runs three to five months, so late filing costs working time directly. The STEM extension additionally requires an E-Verify employer and a formal training plan on Form I-983 — confirm E-Verify status before accepting an offer, because a non-participating employer forfeits the extension entirely.',
  },
  {
    id: 'visa-opt-standard',
    topic: 'visa', slot: 'opt',
    title: 'Standard 12-month OPT',
    tags: ['opt', '12', 'months', 'unemployment', 'application', 'deadline'],
    cond: ctx => !ctx.isSTEM,
    text: '{{majorLabel}} carries the standard 12 months of OPT with no extension available. You accrue a maximum of 90 days of unemployment during that period before status ends, and the single H-1B attempt it allows falls in the March following graduation. Plan the March registration into your first-year job search rather than treating it as a later problem.',
  },
  {
    id: 'visa-cpt',
    topic: 'visa', slot: 'opt',
    title: 'CPT during study',
    tags: ['cpt', 'internship', 'authorization', 'dso', 'parttime', 'fulltime'],
    cond: ctx => true,
    text: 'CPT must be authorised by your DSO before the internship starts and must be tied to a course or degree requirement. Part-time CPT at 20 hours a week or less has no effect on later OPT; accumulating 12 months or more of full-time CPT eliminates OPT completely. Track the cumulative total yourself — the rule catches students who take several full-time co-op terms without adding them up.',
  },
  {
    id: 'visa-h1b',
    topic: 'visa', slot: 'h1b',
    title: 'The H-1B cap and lottery',
    tags: ['h1b', 'cap', 'lottery', 'registration', 'march', 'october', 'masters'],
    cond: ctx => true,
    text: 'H-1B registration opens in early March for an October 1 start. The cap is 65,000 plus 20,000 reserved for US master\'s degree holders, and recent cycles have selected roughly a quarter to a third of registrations. Your employer registers you; you cannot register yourself. Cap-exempt employers — universities, affiliated non-profits, and some research institutions — hire outside the lottery entirely and are an underused route.',
  },
  {
    id: 'visa-o1',
    topic: 'visa', slot: 'alt',
    title: 'O-1A extraordinary ability',
    tags: ['o1', 'extraordinary', 'ability', 'evidence', 'publication', 'award', 'nocap'],
    cond: ctx => true,
    text: 'The O-1A has no annual cap and no lottery. It requires evidence in at least three categories — awards, published material about you, judging others\' work, original contributions of major significance, scholarly articles, high remuneration, or critical roles at distinguished organisations. Undergraduate research, competition results, and press coverage all count toward this later, which is a concrete reason to keep documentation of everything you win or publish from now on.',
  },
  {
    id: 'visa-eb2niw',
    topic: 'visa', slot: 'alt',
    title: 'EB-2 NIW self-petition',
    tags: ['eb2', 'niw', 'green', 'card', 'selfpetition', 'national', 'interest'],
    cond: ctx => true,
    text: 'EB-2 National Interest Waiver allows you to petition for a green card without an employer sponsor, by showing your work has substantial merit and national importance. It suits researchers, founders, and specialists with a publication or product record. Country caps matter: applicants born in India and China face multi-year queues in EB-2 that applicants from other countries do not.',
  },
  {
    id: 'visa-alt-countries',
    topic: 'visa', slot: 'alt',
    title: 'Non-US fallbacks worth keeping open',
    tags: ['canada', 'uk', 'eu', 'alternative', 'immigration', 'backup', 'graduate'],
    cond: ctx => true,
    text: 'Canada\'s Post-Graduation Work Permit and Express Entry system have no lottery and a defined points path to permanent residence, and US degrees are well recognised there. The UK Graduate Route grants two years of unrestricted work after a UK degree, and Germany, the Netherlands, and Ireland all offer post-study job-seeker visas. Keeping one of these open is a reasonable hedge rather than an admission of failure — many students work in the US on OPT and then move.',
  },
  {
    id: 'visa-strategy-roadmap',
    topic: 'visa', slot: 'strategy',
    title: 'The full roadmap from enrolment to residence',
    tags: ['strategy', 'roadmap', 'longterm', 'career', 'green', 'card', 'plan'],
    cond: ctx => true,
    text: 'The realistic long-term sequence is: choose a STEM-designated degree, intern on CPT every summer with sponsorship-history employers, graduate into OPT, join an employer that files H-1B for interns as a matter of routine, enter the lottery in every March you are eligible, and have the employer start the green-card process as early as they will. Each step depends on the one before it, and the decision that constrains everything else — degree designation — is made before you enrol.',
  },
  {
    id: 'visa-country-specific',
    topic: 'visa', slot: 'strategy',
    title: 'Country-specific processing considerations',
    tags: ['country', 'processing', 'administrative', 'delay', 'security', 'clearance'],
    cond: ctx => ctx.hasVisaDelayRisk,
    text: 'Applicants from {{countryName}} in technical fields should build in extra time for administrative processing under section 221(g), which can add weeks or months and is applied unevenly. Apply as early as your I-20 allows, avoid non-essential travel once enrolled, and renew the visa during a long break rather than a short one — a stamp that expires while you are inside the US is fine until you leave.',
  },
];

module.exports = { DOCS };
