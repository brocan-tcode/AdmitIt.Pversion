// src/rag/knowledge/international.js
// Application and visa knowledge for non-US destinations.
//
// These replace the US round/visa/timeline documents, which are tagged
// system:'us' in corpus.js and filtered out when the student's list has no US
// schools on it. A student applying to Melbourne must never be shown Early
// Decision, the Common App, or the H-1B lottery.
//
// `system` here matches the visaSystem on the school rows in
// src/data/internationalSchools.js.

const DOCS = [
  // ── Australia ──────────────────────────────────────────────
  {
    id: 'intl-au-apply', topic: 'round', system: 'au-500',
    title: 'Applying to Australian universities',
    tags: ['australia', 'apply', 'uac', 'direct', 'offer', 'deadline', 'rounds'],
    cond: ctx => ctx.hasDestination('au-500'),
    text: 'International applicants apply directly to each Australian university, or through an agent — there is no Common App equivalent and no binding early round. Offers are made on a rolling basis against published entry requirements, so applying early simply means hearing back early. Most universities run two intakes, February (Semester 1) and July (Semester 2), and the February intake is the main one. Conditional offers are normal: you receive one before final results and it converts once your grades are confirmed.',
  },
  {
    id: 'intl-au-visa', topic: 'visa', system: 'au-500',
    title: 'Australian student visa (subclass 500)',
    tags: ['australia', 'visa', '500', 'coe', 'genuine student', 'oshc'],
    cond: ctx => ctx.hasDestination('au-500'),
    text: 'The subclass 500 student visa requires a Confirmation of Enrolment from the university, Overseas Student Health Cover for the full stay, evidence of funds, and a Genuine Student statement explaining why this course in Australia fits your plans. Processing commonly runs six to twelve weeks, so apply as soon as the CoE arrives. The visa allows 48 hours of work per fortnight during term and unrestricted work in breaks.',
  },
  {
    id: 'intl-au-work', topic: 'career', system: 'au-500',
    title: 'Working in Australia after graduation',
    tags: ['australia', '485', 'graduate', 'work', 'permanent residence', 'skilled'],
    cond: ctx => ctx.hasDestination('au-500'),
    text: 'The Temporary Graduate visa (subclass 485) gives two to three years of unrestricted work after a bachelor degree, with no employer sponsorship and no lottery — a materially easier position than the US H-1B. From there the skilled migration points system is a defined path to permanent residence, and points are awarded for age, English, qualifications and Australian work experience. Regional study adds points, which is why regional campuses are worth considering.',
  },

  // ── Canada ─────────────────────────────────────────────────
  {
    id: 'intl-ca-apply', topic: 'round', system: 'ca-permit',
    title: 'Applying to Canadian universities',
    tags: ['canada', 'apply', 'ouac', 'direct', 'deadline', 'january'],
    cond: ctx => ctx.hasDestination('ca-permit'),
    text: 'Ontario universities apply through OUAC; everywhere else you apply to each university directly. Deadlines cluster in January for a September start, and admission is decided on your grades in the specific subjects the programme requires rather than on a holistic read. There is no binding early round. Offers are frequently conditional on final results, and competitive programmes such as engineering and computer science publish higher required averages than the university minimum.',
  },
  {
    id: 'intl-ca-visa', topic: 'visa', system: 'ca-permit',
    title: 'Canadian study permit',
    tags: ['canada', 'study permit', 'pal', 'gic', 'funds', 'processing'],
    cond: ctx => ctx.hasDestination('ca-permit'),
    text: 'A study permit needs a letter of acceptance, a Provincial Attestation Letter from the province, and proof of funds — commonly a Guaranteed Investment Certificate plus first-year tuition. Caps on study permits introduced recently mean the attestation letter is the binding constraint, and universities issue a limited number, so accept your offer promptly. The permit allows 24 hours of off-campus work per week during term.',
  },
  {
    id: 'intl-ca-work', topic: 'career', system: 'ca-permit',
    title: 'Working in Canada after graduation',
    tags: ['canada', 'pgwp', 'express entry', 'permanent residence', 'work'],
    cond: ctx => ctx.hasDestination('ca-permit'),
    text: 'The Post-Graduation Work Permit gives up to three years of open work authorisation after a degree of two years or longer — no employer sponsorship, no lottery. Canadian work experience then feeds Express Entry, a points-based permanent residence system with published cut-offs you can plan against. Note that PGWP eligibility now depends on field of study for some programmes, so confirm your specific degree qualifies before enrolling.',
  },

  // ── United Kingdom ─────────────────────────────────────────
  {
    id: 'intl-uk-apply', topic: 'round', system: 'uk-student',
    title: 'Applying to the UK through UCAS',
    tags: ['uk', 'ucas', 'apply', 'personal statement', 'october', 'january', 'offer'],
    cond: ctx => ctx.hasDestination('uk-student'),
    text: 'One UCAS application covers up to five courses, and you apply to a COURSE rather than to a university — the choice is close to binding, because switching subject after entry is difficult. Oxford and Cambridge share a mid-October deadline and you may apply to only one of them; medicine, dentistry and veterinary courses share that deadline too. Everything else is late January. You write one personal statement for all five choices, so it must be about the subject rather than about any one university. Offers are conditional on specified grades.',
  },
  {
    id: 'intl-uk-visa', topic: 'visa', system: 'uk-student',
    title: 'UK Student route visa',
    tags: ['uk', 'visa', 'student route', 'cas', 'ihs', 'maintenance'],
    cond: ctx => ctx.hasDestination('uk-student'),
    text: 'The Student route requires a Confirmation of Acceptance for Studies from the university, the Immigration Health Surcharge paid upfront for the full course length, and maintenance funds held for 28 consecutive days before applying. Apply up to six months before the course starts. The visa permits 20 hours of work per week during term.',
  },
  {
    id: 'intl-uk-work', topic: 'career', system: 'uk-student',
    title: 'Working in the UK after graduation',
    tags: ['uk', 'graduate route', 'skilled worker', 'work', 'sponsorship'],
    cond: ctx => ctx.hasDestination('uk-student'),
    text: 'The Graduate route gives two years of unrestricted work after a UK bachelor degree with no employer sponsorship and no salary threshold — you can work for anyone, including yourself. Converting to the Skilled Worker visa afterwards does require a licensed sponsor and a salary above the threshold, which is where most of the difficulty sits, so use the two years to reach a sponsored role rather than treating them as a grace period.',
  },

  // ── Hong Kong ──────────────────────────────────────────────
  {
    id: 'intl-hk-apply', topic: 'round', system: 'hk-visa',
    title: 'Applying to Hong Kong universities',
    tags: ['hong kong', 'apply', 'direct', 'interview', 'deadline', 'jupas'],
    cond: ctx => ctx.hasDestination('hk-visa'),
    text: 'International applicants apply directly to each university on the non-JUPAS track, with main deadlines between November and January for a September start. Admission is decided on your qualification — IB, A-level, or a national school-leaving certificate — against published requirements, and competitive programmes at HKU and CUHK interview shortlisted applicants. Entrance scholarships are decided from the same application at most universities.',
  },
  {
    id: 'intl-hk-visa', topic: 'visa', system: 'hk-visa',
    title: 'Hong Kong student visa and IANG',
    tags: ['hong kong', 'visa', 'iang', 'work', 'permanent residence'],
    cond: ctx => ctx.hasDestination('hk-visa'),
    text: 'The student visa is sponsored by the university and is generally straightforward. What makes Hong Kong unusual is what follows: the IANG arrangement lets graduates stay and work for two years with no job offer required at the point of application and no quota, and seven years of residence leads to permanent residency. For a student weighing post-study work rights, that is one of the most permissive regimes among major destinations.',
  },

  // ── Singapore ──────────────────────────────────────────────
  {
    id: 'intl-sg-apply', topic: 'round', system: 'sg-pass',
    title: 'Applying to NUS and NTU',
    tags: ['singapore', 'apply', 'nus', 'ntu', 'deadline', 'scholarship'],
    cond: ctx => ctx.hasDestination('sg-pass'),
    text: 'Applications are direct to each university, opening in October and closing between January and March for an August start. Admission is competitive and grade-driven, with published indicative grade profiles per programme. Tuition grants from the Ministry of Education substantially reduce fees in exchange for a three-year bond requiring you to work for a Singapore-registered company after graduation — factor the bond into the decision, because it is a genuine commitment rather than a formality.',
  },
  {
    id: 'intl-sg-visa', topic: 'visa', system: 'sg-pass',
    title: "Singapore Student's Pass and post-study work",
    tags: ['singapore', 'visa', 'student pass', 'employment pass', 'work'],
    cond: ctx => ctx.hasDestination('sg-pass'),
    text: "The Student's Pass is applied for through the SOLAR system once you accept an offer and is normally granted quickly. After graduation the Long-Term Visit Pass gives a year to find work, and the Employment Pass requires a job offer above a salary threshold that rises with age and experience. Graduates who took the MOE tuition grant are bonded to work in Singapore for three years, which effectively resolves the post-study work question for them.",
  },

  // ── Cross-cutting ──────────────────────────────────────────
  {
    id: 'intl-threshold-explained', topic: 'strategy',
    title: 'These universities admit on a published threshold',
    tags: ['threshold', 'entry', 'requirement', 'international', 'offer', 'grades'],
    cond: ctx => ctx.hasThresholdSchools,
    text: 'The non-US universities on your list admit differently from the US ones: they publish a required grade for each course, and meeting it is most of the decision. There is no holistic review of essays and activities in the US sense, no Early Decision, and at most of them no interview. This cuts both ways — your extracurricular record counts for far less than it would in a US application, and your final grades count for far more. If your predicted grades sit below a course requirement, the application is unlikely to succeed however strong the rest of the file is.',
  },
  {
    id: 'intl-threshold-estimate', topic: 'strategy',
    title: 'Verify every entry requirement against the university itself',
    tags: ['threshold', 'verify', 'requirement', 'estimate', 'course', 'department'],
    cond: ctx => ctx.hasThresholdSchools,
    text: 'The entry requirements shown here are modelled from country norms and the university\'s standing, not read from each prospectus, and requirements vary sharply BY COURSE — computer science and medicine sit well above a university\'s general minimum. Before you commit to a list, check the exact requirement for your specific course on the university\'s own international admissions page. Your grade equivalent here is also converted from a US-style GPA, which is an approximation; an admissions office will assess your actual qualification.',
  },
  {
    id: 'intl-compare-systems', topic: 'strategy',
    title: 'Weigh post-study work rights, not just rankings',
    tags: ['compare', 'work rights', 'visa', 'destination', 'decision', 'value'],
    cond: ctx => ctx.hasThresholdSchools,
    text: 'Post-study work rights differ more between these countries than the rankings do. Australia gives two to three years with no sponsor, Canada up to three, the UK two, and Hong Kong two with a direct path to permanent residency — all without the lottery that governs the US H-1B. If your goal is to work after graduating rather than to return home immediately, that difference is worth more than a dozen places in a ranking table.',
  },
];

module.exports = { DOCS };
