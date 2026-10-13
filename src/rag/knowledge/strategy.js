// src/rag/knowledge/strategy.js
// Retrievable action items for the "AI STRATEGY" section.
//
// Each doc is one actionable recommendation. `cond(ctx)` gates eligibility
// (hard filter), BM25 then ranks the eligible pool against a query built from
// the student's actual gaps. Placeholders in `text` are filled by composer.js.

const DOCS = [
  // ── Testing ────────────────────────────────────────────────
  {
    id: 'strat-sat-retake-hard',
    topic: 'strategy', title: 'Retake the SAT to clear the target band',
    tags: ['sat', 'test', 'score', 'retake', 'testing', 'academic'],
    cond: ctx => ctx.satEq > 0 && ctx.topReach && ctx.satEq < ctx.topReach.satRange[0],
    text: 'Retake the SAT in the next available sitting and target {{reachSatTarget}}+. Your {{satLabel}} sits below the 25th percentile at {{topReach}} ({{reachSat25}}–{{reachSat75}}), which is the single largest fixable gap in this profile. Two focused months on the sections you scored lowest typically moves a score 60–90 points; nothing else on this list moves your odds as much per hour invested.',
  },
  {
    id: 'strat-sat-retake-soft',
    topic: 'strategy', title: 'One more SAT sitting to reach the median',
    tags: ['sat', 'test', 'score', 'retake', 'testing', 'median'],
    cond: ctx => ctx.satEq > 0 && ctx.topReach && ctx.satEq >= ctx.topReach.satRange[0] && ctx.satEq < ctx.topReach.satRange[1],
    text: 'Take the SAT one more time targeting {{reachSat75}}+. You are already inside the middle-50% band at {{topReach}}, so this is an optimisation rather than a rescue — but crossing the 75th percentile ({{reachSat75}}) meaningfully changes how the academic-index screen reads your file at every reach school on your list.',
  },
  {
    id: 'strat-test-optional',
    topic: 'strategy', title: 'Decide test-optional strategy deliberately',
    tags: ['test', 'optional', 'sat', 'act', 'submit', 'testing', 'policy'],
    cond: ctx => ctx.satEq === 0 || (ctx.topMatch && ctx.satEq < ctx.topMatch.satRange[0] - 60),
    text: 'Make the test-optional call on a per-school basis rather than all-or-nothing. The working rule: submit if your score is at or above a school\'s 50th percentile, withhold if it is below the 25th. For international applicants the calculus is harsher — a strong score is one of the few directly comparable signals across school systems, so a submitted {{matchSat50}}+ does more work for you than it would for a domestic applicant.',
  },
  {
    id: 'strat-act-pivot',
    topic: 'strategy', title: 'Try the ACT if SAT progress has stalled',
    tags: ['act', 'sat', 'test', 'pivot', 'score', 'testing'],
    cond: ctx => ctx.satEq > 0 && ctx.satEq < 1450 && !ctx.act,
    text: 'Sit one full timed ACT before committing to another SAT cycle. Students who plateau on SAT Reading often score noticeably better on the ACT\'s more literal, faster-paced format, and every school on your list accepts either test with no preference. If the ACT-equivalent comes back more than 40 SAT-points higher, switch and stop splitting your prep.',
  },
  {
    id: 'strat-toefl-raise',
    topic: 'strategy', title: 'Raise English proficiency above the screening line',
    tags: ['toefl', 'ielts', 'english', 'proficiency', 'language', 'international'],
    cond: ctx => (ctx.toefl > 0 && ctx.toefl < 105) || (ctx.ielts > 0 && ctx.ielts < 7.5),
    text: 'Retake {{englishTest}} and target {{englishTarget}}. Selective universities use English scores as a screening filter before any holistic reading happens — {{englishCurrent}} is enough to be considered but not enough to be waved through, and a sub-section below 24 on TOEFL Speaking or Writing triggers ESL placement at several schools on your list. This is the cheapest score improvement available to you.',
  },
  {
    id: 'strat-english-waiver',
    topic: 'strategy', title: 'Check English test waiver eligibility',
    tags: ['toefl', 'ielts', 'waiver', 'english', 'exemption', 'duolingo'],
    cond: ctx => ctx.toefl === 0 && ctx.ielts === 0,
    text: 'Confirm in writing whether each school waives its English requirement for you. Many waive TOEFL/IELTS after four years of instruction in English or with an SAT Reading and Writing score above roughly 680, but the thresholds differ school by school and the waiver is rarely automatic. If you do not qualify, register for the Duolingo English Test as a fast backup — most of your list now accepts it.',
  },

  // ── Course rigour ──────────────────────────────────────────
  {
    id: 'strat-rigor-load',
    topic: 'strategy', title: 'Maximise senior-year course rigour',
    tags: ['rigor', 'ap', 'ib', 'courses', 'academic', 'transcript', 'curriculum'],
    cond: ctx => ctx.rigorIndex < 7 && !ctx.isPostApplication,
    text: 'Load your senior schedule with the hardest courses your school actually offers in {{majorLabel}}-adjacent subjects. Your rigour index is {{rigorIndex}}/10, and admissions readers judge rigour relative to what was available to you — an unexplained gap between "offered" and "taken" reads as avoidance. Adding two more AP or HL courses in {{rigorSubjects}} is worth more than adding another club.',
  },
  {
    id: 'strat-rigor-strong',
    topic: 'strategy', title: 'Protect the rigour advantage you already have',
    tags: ['rigor', 'ap', 'ib', 'courses', 'senior', 'grades', 'transcript'],
    cond: ctx => ctx.rigorIndex >= 7,
    text: 'Hold your rigour at {{rigorIndex}}/10 through senior year and do not lighten the schedule after submitting applications. Offers are conditional on the final transcript, and a senior-year drop in either course level or grades is the most common cause of a rescinded international offer. Finish the courses you listed on the application, at the level you listed them.',
  },
  {
    id: 'strat-counselor-context',
    topic: 'strategy', title: 'Get your school context on the record',
    tags: ['counselor', 'school', 'profile', 'context', 'curriculum', 'report'],
    cond: ctx => true,
    text: 'Ask your counsellor to confirm that your school profile document states how many APs/HLs students may take, your grading scale, and whether class rank is reported. US readers evaluate your transcript against that document, and international school profiles are frequently thin or missing — which causes readers to default to unfavourable assumptions about a {{gpa}} GPA earned under a different grading system.',
  },

  // ── Extracurriculars and awards ────────────────────────────
  {
    id: 'strat-ec-leadership',
    topic: 'strategy', title: 'Convert participation into a leadership role',
    tags: ['leadership', 'extracurricular', 'president', 'founder', 'club', 'initiative'],
    cond: ctx => !ctx.hasLeadership,
    text: 'Take an actual leadership title in your strongest activity before applications close. Nothing in your current list shows you have run something — and at schools admitting under 15% of international applicants, "member" entries are read as attendance rather than commitment. Founding a small initiative with a measurable outcome beats a vice-presidency in a large club you did not shape.',
  },
  {
    id: 'strat-ec-depth',
    topic: 'strategy', title: 'Go deeper on two activities instead of wider',
    tags: ['extracurricular', 'depth', 'spike', 'focus', 'activities', 'commitment'],
    cond: ctx => ctx.activityCount >= 5 && ctx.ecScore < 12,
    text: 'Cut back to your two strongest activities and go deep. You have {{activityCount}} entries but an EC impact score of {{ecScore}}/20, which is the signature of breadth without depth — the Common App has ten slots and readers routinely ignore the bottom six. Two activities with three years of escalating responsibility outperform eight one-year memberships in every published admissions study.',
  },
  {
    id: 'strat-ec-build',
    topic: 'strategy', title: 'Build the missing extracurricular record now',
    tags: ['extracurricular', 'activities', 'build', 'start', 'record', 'thin'],
    cond: ctx => ctx.activityCount < 4,
    text: 'Add at least two substantial activities immediately and document start dates honestly. With {{activityCount}} activities on record your file currently reads as academics-only, which caps you at schools that admit primarily on numbers. Choose things adjacent to {{majorLabel}} so the record reads as one story rather than as padding.',
  },
  {
    id: 'strat-award-enter',
    topic: 'strategy', title: 'Enter a nationally recognised competition',
    tags: ['award', 'competition', 'national', 'olympiad', 'recognition', 'honors'],
    cond: ctx => !ctx.hasNationalAward,
    text: 'Register for at least one nationally recognised competition this cycle: {{competitionList}}. Your file has no national or international distinction, and at sub-10% schools that is the most common reason an otherwise strong international applicant is cut early. Even a qualifying-round result is a verifiable external benchmark, which is exactly what readers cannot get from your transcript.',
  },
  {
    id: 'strat-award-leverage',
    topic: 'strategy', title: 'Make your awards legible to a US reader',
    tags: ['award', 'honors', 'context', 'selectivity', 'explain', 'recognition'],
    cond: ctx => ctx.hasAwards,
    text: 'Add selectivity context to every award in your Honors section. "First place, {{countryAdj}} National Olympiad" means nothing to a reader who does not know the field size — "1st of 40,000 entrants nationally" is instantly rankable. You have the awards; right now they are being under-counted because the reader has no scale to judge them against.',
  },
  {
    id: 'strat-research-start',
    topic: 'strategy', title: 'Secure a research or mentored project',
    tags: ['research', 'professor', 'lab', 'mentor', 'project', 'academic'],
    cond: ctx => !ctx.hasResearch && ctx.isResearchMajor,
    text: 'Cold-email 15 professors or PhD students working on {{majorLabel}} topics you can actually name, with a specific paragraph on which of their papers you read and what you could contribute. Expect one or two replies — that ratio is normal. For {{majorLabel}} applicants at research universities, a mentored project is the strongest non-academic signal available, and you currently have none on record.',
  },
  {
    id: 'strat-research-publish',
    topic: 'strategy', title: 'Push existing research toward an output',
    tags: ['research', 'publication', 'paper', 'conference', 'output', 'poster'],
    cond: ctx => ctx.hasResearch,
    text: 'Convert your research into something citable before you submit: a preprint, a high-school research journal submission, a conference poster, or a public repository with documentation. Unfinished research is nearly invisible to readers — the same work with an output attached becomes a verifiable claim, and it gives your recommender something concrete to describe.',
  },
  {
    id: 'strat-summer-program',
    topic: 'strategy', title: 'Choose summer programmes on selectivity, not brand',
    tags: ['summer', 'program', 'selective', 'rsi', 'cost', 'value'],
    cond: ctx => !ctx.isSenior,
    text: 'Apply only to summer programmes that are free or selective — RSI, SSP, MITES, TASP, Garcia, or a paid university lab position. Fee-paying "pre-college" programmes at brand-name universities confer no admissions advantage and readers know exactly which is which. A local unpaid research placement is worth more than a $9,000 summer on an Ivy campus.',
  },

  // ── Major-specific ─────────────────────────────────────────
  {
    id: 'strat-cs-portfolio',
    topic: 'strategy', title: 'Ship a CS portfolio with real users',
    tags: ['cs', 'computer', 'software', 'github', 'portfolio', 'project', 'open source'],
    cond: ctx => ctx.majorKey === 'cs',
    text: 'Ship one project that strangers actually use and put the metric in your application. CS is the most oversubscribed major on your entire list — {{topReach}} and {{topMatch}} both admit CS applicants at rates well below their published overall figures. "Built an app" is background noise; "built a scheduling tool used by 400 students at three schools" is a differentiator. Pair it with USACO Silver or above if you can reach it this cycle.',
  },
  {
    id: 'strat-eng-hardware',
    topic: 'strategy', title: 'Show engineering judgment, not just interest',
    tags: ['engineering', 'robotics', 'build', 'design', 'project', 'hardware'],
    cond: ctx => ctx.majorKey === 'engineering' || ctx.majorKey === 'robotics',
    text: 'Document one build end-to-end: the constraint you were designing against, what failed, what you changed, and the measured result. Engineering readers are looking for design judgment rather than enthusiasm, and a failure you diagnosed is stronger evidence than a success you cannot explain. FIRST Robotics, Science Olympiad build events, and ISEF all produce this kind of documentable record.',
  },
  {
    id: 'strat-business-venture',
    topic: 'strategy', title: 'Attach real numbers to a business interest',
    tags: ['business', 'finance', 'venture', 'revenue', 'startup', 'deca'],
    cond: ctx => ctx.majorKey === 'business' || ctx.majorKey === 'economics',
    text: 'Run something with a revenue or impact figure attached, however small. Undergraduate business admissions — especially Wharton, Ross, McIntire, and Stern — reward demonstrated commercial initiative over stated interest in business. A venture that cleared $3,000 in sales, a DECA state placement, or a documented investment thesis all read as evidence; "interested in finance" reads as nothing.',
  },
  {
    id: 'strat-bio-clinical',
    topic: 'strategy', title: 'Get clinical and lab hours on record',
    tags: ['biology', 'premed', 'medicine', 'clinical', 'hospital', 'shadowing', 'volunteer'],
    cond: ctx => ctx.majorKey === 'biology',
    text: 'Log at least 100 hours of patient-facing volunteering plus shadowing across two specialties, and keep a dated record. US pre-med tracks expect this before medical school and applying with it already underway signals you understand the pipeline you are entering. Note that most US medical schools do not accept international applicants for financial-aid reasons — plan the undergraduate years with that constraint visible.',
  },
  {
    id: 'strat-major-oversubscribed',
    topic: 'strategy', title: 'Account for direct-admit major competition',
    tags: ['major', 'direct', 'admit', 'competitive', 'impacted', 'transfer'],
    cond: ctx => ['cs', 'engineering', 'business', 'nursing'].includes(ctx.majorKey),
    text: 'Check whether each school admits directly into {{majorLabel}} or admits to the college first. At schools with direct admission the effective acceptance rate for {{majorLabel}} can be a third of the published number, and internal transfer into the major after enrolment is capped and competitive. Where an undeclared or adjacent entry point exists and internal transfer is genuinely open, applying that way is a legitimate strategy — verify the transfer policy in writing first.',
  },

  // ── International-specific ─────────────────────────────────
  {
    id: 'strat-country-competition',
    topic: 'strategy', title: 'Differentiate within your national applicant pool',
    tags: ['country', 'international', 'competition', 'pool', 'differentiate', 'quota'],
    cond: ctx => ctx.isHighCompetitionCountry,
    text: 'Assume you are being read against other {{countryAdj}} applicants, not against the whole pool. Admissions offices manage international enrolment by region, so the practical comparison set for a {{countryAdj}} {{majorLabel}} applicant is other {{countryAdj}} {{majorLabel}} applicants — a group with similar scores, similar competitions, and similar essay topics. Your differentiation has to come from something specific to your life, not from another point of score.',
  },
  {
    id: 'strat-need-aware',
    topic: 'strategy', title: 'Separate need-blind schools from need-aware schools',
    tags: ['financial', 'aid', 'need', 'blind', 'aware', 'international', 'cost'],
    cond: ctx => true,
    text: 'Sort your list by aid policy before you finalise it. A small number of schools are need-blind for international applicants — {{needBlindList}} among your matches — while at every other school on your list, requesting substantial aid measurably reduces your odds. That does not mean you should not ask; it means you should know which applications carry that cost and balance the list accordingly.',
  },
  {
    id: 'strat-financial-certification',
    topic: 'strategy', title: 'Prepare financial certification documents early',
    tags: ['financial', 'certification', 'i20', 'bank', 'documents', 'visa', 'cost'],
    cond: ctx => true,
    text: 'Assemble your financial certification package now rather than in April. Every school requires proof of one year of funding — roughly {{oneYearCost}} for your list — before it will issue the I-20 you need for the visa interview. Bank letters, sponsor affidavits, and translated statements routinely take three to four weeks, and a late I-20 is the most common cause of a deferred start for admitted international students.',
  },
  {
    id: 'strat-recommenders',
    topic: 'strategy', title: 'Brief your recommenders properly',
    tags: ['recommendation', 'letter', 'teacher', 'counselor', 'brag', 'sheet'],
    cond: ctx => true,
    text: 'Ask two core-subject teachers eight weeks before your first deadline and hand each a one-page brief: two or three specific classroom moments, what you are applying for, and why you chose them. Letters from international schools are often short and formulaic because teachers have not written for US admissions before — the brief is what turns a generic paragraph into evidence a reader can quote.',
  },
  {
    id: 'strat-interview',
    topic: 'strategy', title: 'Accept every alumni interview offered',
    tags: ['interview', 'alumni', 'demonstrated', 'interest', 'preparation'],
    cond: ctx => true,
    text: 'Accept every interview invitation and prepare three concrete stories you can tell in two minutes each. Interviews rarely rescue a weak file, but for international applicants they resolve the fluency question that a written application cannot, and declining one is read as disinterest. Have one specific question ready per school that could not be answered from the website.',
  },
  {
    id: 'strat-demonstrated-interest',
    topic: 'strategy', title: 'Track demonstrated interest where it counts',
    tags: ['demonstrated', 'interest', 'visit', 'email', 'tracking', 'yield'],
    cond: ctx => true,
    text: 'Open every email, attend the virtual sessions, and register on each school\'s own portal — several schools on your list track this and weigh it, particularly the private universities in your match and safety bands. It costs an hour a month. Ivies and the UCs explicitly do not track demonstrated interest, so spend the effort where it actually moves a decision.',
  },
  // ── Budget below what the database can serve ───────────────
  {
    id: 'strat-budget-below-database',
    topic: 'strategy', title: 'Your budget is below every school in this database',
    tags: ['budget', 'cost', 'afford', 'cheap', 'tuition', 'money', 'financial', 'infeasible'],
    cond: ctx => ctx.budgetInfeasible,
    text: 'Nothing in this tool fits {{budgetMaxLabel}} a year — the cheapest option it holds runs {{cheapestCost}} all-in, so the schools listed are shown for reference rather than as affordable choices. Three routes actually work at your budget, and none of them are in this database: community college for two years then transfer to a public flagship, which is the single cheapest path to a US degree; public universities in low-tuition states, where non-resident totals can land near {{budgetMaxLabel}}; and universities that award large guaranteed merit scholarships against a test score rather than against need. Search on total cost after aid, never on sticker price.',
  },
  {
    id: 'strat-budget-full-ride',
    topic: 'strategy', title: 'Target full-tuition merit awards rather than need-based aid',
    tags: ['merit', 'scholarship', 'full', 'ride', 'automatic', 'award', 'budget', 'cost'],
    cond: ctx => ctx.budgetInfeasible || (ctx.budgetMax > 0 && ctx.oneYearCost > ctx.budgetMax),
    text: 'Need-based aid for international students is rationed and need-aware almost everywhere; automatic merit money is neither. A number of US universities publish scholarship tables that award full or near-full tuition for a stated GPA and test score, with no separate application and no consideration of need — which makes a test score worth far more to you than to most applicants. Build the affordable half of your list from those tables, then treat the schools in this report as the ambitious half.',
  },
  // ── Students below the selective range ─────────────────────
  {
    id: 'strat-broaden-below-range',
    topic: 'strategy', title: 'Build the realistic half of your list elsewhere',
    tags: ['safety', 'list', 'broaden', 'realistic', 'range', 'accessible', 'options'],
    cond: ctx => ctx.belowCorpusRange,
    text: 'Add six to eight schools that this tool cannot show you. Its database holds {{corpusSchoolCount}} selective and mid-selective universities, and your best odds anywhere on it are {{bestOdds}}% — so the entire safe half of your list has to come from somewhere else. The categories to search are regional public universities in states with low non-resident tuition, less selective private colleges that discount heavily to fill seats, and universities with published guaranteed-admission thresholds. Use the College Board and each school\'s own international admissions page rather than a ranking list.',
  },
  {
    id: 'strat-assured-admission',
    topic: 'strategy', title: 'Target schools that publish a guaranteed-admission threshold',
    tags: ['assured', 'guaranteed', 'automatic', 'admission', 'threshold', 'public', 'safety'],
    cond: ctx => ['developing', 'solid'].includes(ctx.strengthBand),
    text: 'Find the schools that publish an admission threshold and aim at the number rather than at a holistic impression. Arizona State, for example, assures admission to applicants in the top 25% of their class, or with a 3.00 GPA across its required competency courses, or with a 1180 SAT for non-residents — meet any one and you are in. Dozens of large public universities publish equivalent rules. This is the fastest route from an uncertain list to a certain offer, and it rewards exactly the things you can still change this year.',
  },
  {
    id: 'strat-direct-admissions',
    topic: 'strategy', title: 'Complete the Common App direct admissions profile',
    tags: ['direct', 'admission', 'commonapp', 'offer', 'access', 'guaranteed'],
    cond: ctx => ['developing', 'solid'].includes(ctx.strengthBand),
    text: 'Fill in the Common App direct admissions section as soon as you open your account. For 2025–26 more than 200 colleges make admission offers through it based on your profile alone — GPA, coursework, and background — often before you submit any application, and several waive the essay and recommendation requirements for students admitted this way. It costs one form and can produce a guaranteed offer in about a week, which changes how much risk the rest of your list can carry.',
  },
  {
    id: 'strat-transfer-pathway',
    topic: 'strategy', title: 'Treat the transfer route as a real option, not a failure',
    tags: ['transfer', 'community', 'college', 'pathway', 'articulation', 'route'],
    cond: ctx => ctx.belowCorpusRange,
    text: 'Price out the two-plus-two route before you dismiss it. SEVP-certified community colleges issue the same F-1 I-20 as a university, cost a fraction of the tuition, and several states run articulation agreements that guarantee transfer into the public system with a set GPA — California\'s community colleges into the UC and CSU systems being the largest. Your degree is issued by the university you finish at. The main catch is that need-based aid for international students is scarce at both stages, so treat it as a cost strategy rather than an aid strategy.',
  },
  {
    id: 'strat-rolling-admission',
    topic: 'strategy', title: 'Apply early to rolling-admission schools',
    tags: ['rolling', 'admission', 'early', 'deadline', 'space', 'available'],
    cond: ctx => ['developing', 'solid'].includes(ctx.strengthBand),
    text: 'Submit to any rolling-admission school in your first month of the cycle. Rolling schools decide as applications arrive and keep admitting until the class fills, so an identical application is materially stronger in September than in February. Getting one offer in hand early also removes the pressure that pushes students into rushed, weaker applications everywhere else.',
  },
  {
    id: 'strat-safety-real',
    topic: 'strategy', title: 'Make sure your safety schools are genuinely safe',
    tags: ['safety', 'list', 'balance', 'affordable', 'admission', 'guarantee'],
    cond: ctx => ctx.hasSafety,
    text: 'Confirm that at least two schools on your list are both affordable at {{budgetLabel}} and near-certain admits — {{safetyList}} fit that description for you. A safety school you cannot pay for is not a safety school. For international applicants this matters more than for domestic students, because a gap year to reapply means losing visa timing and re-entering a different applicant pool.',
  },
  {
    id: 'strat-essay-time',
    topic: 'strategy', title: 'Budget realistically for supplemental essays',
    tags: ['essay', 'supplement', 'time', 'planning', 'writing', 'workload'],
    cond: ctx => true,
    text: 'Count your supplemental essays before you finalise the school list — {{schoolCount}} applications will require roughly {{supplementEstimate}} distinct pieces of writing. Students consistently underestimate this and end up recycling generic "why us" paragraphs in December, which is visible to readers. Either commit the hours or cut schools; a shorter list written well beats a longer list written late.',
  },
  {
    id: 'strat-portal-tracking',
    topic: 'strategy', title: 'Verify every application after submission',
    tags: ['portal', 'submission', 'checklist', 'documents', 'tracking', 'deadline'],
    cond: ctx => true,
    text: 'Check each school\'s applicant portal 48 hours after submitting and again a week later. Transcripts sent from non-US schools and English test scores are the two items that most often fail to attach, and an application marked incomplete at the deadline is simply not read. Nobody will chase you about it.',
  },
  {
    id: 'strat-loci',
    topic: 'strategy', title: 'Plan a letter of continued interest for deferrals',
    tags: ['deferral', 'loci', 'waitlist', 'letter', 'continued', 'interest'],
    cond: ctx => true,
    text: 'Draft a letter of continued interest template now so a December deferral does not catch you flat. One page: new grades, one genuinely new accomplishment, and a specific sentence about why the school remains your first choice. Send it in mid-January to schools that accept updates. It is the only lever you have left after a deferral, and most applicants never pull it.',
  },
];

module.exports = { DOCS };
