// src/rag/knowledge/timeline.js
// Task bank for the "TIMELINE" section.
//
// The composer generates the actual month sequence from the student's grade
// and today's date, then retrieves tasks per month. `months` restricts a task
// to calendar months, `phase` restricts it to a stage of the cycle:
//   'pre'      — any year before the application year
//   'apps'     — August–January of the application year
//   'decision' — February–July after submission

const DOCS = [
  // ── Pre-application year ───────────────────────────────────
  {
    id: 'tl-pre-testing-plan',
    topic: 'timeline', phase: 'pre', months: ['August', 'September'],
    title: 'Lock the testing calendar',
    tags: ['sat', 'act', 'test', 'plan', 'registration', 'calendar'],
    cond: ctx => true,
    text: 'Map every remaining SAT/ACT date against your school calendar and register for two sittings — international test centres fill months early and late registration fees are punitive.',
  },
  {
    id: 'tl-pre-course-select',
    topic: 'timeline', phase: 'pre', months: ['September', 'February', 'March'],
    title: 'Choose next year courses for maximum rigour',
    tags: ['courses', 'rigor', 'ap', 'ib', 'selection', 'schedule'],
    cond: ctx => ctx.rigorIndex < 8,
    text: 'Select next year\'s courses at the highest level your school offers in {{rigorSubjects}} — this is the last schedule that will appear on your application.',
  },
  {
    id: 'tl-pre-research-outreach',
    topic: 'timeline', phase: 'pre', months: ['October', 'November', 'January', 'February'],
    title: 'Begin research outreach',
    tags: ['research', 'professor', 'email', 'lab', 'mentor', 'outreach'],
    cond: ctx => !ctx.hasResearch && ctx.isResearchMajor,
    text: 'Send 15 targeted emails to professors and PhD students in {{majorLabel}}; expect a 10% reply rate and start early enough that a spring or summer placement is still possible.',
  },
  {
    id: 'tl-pre-competition-reg',
    topic: 'timeline', phase: 'pre', months: ['September', 'October', 'November'],
    title: 'Register for national competitions',
    tags: ['competition', 'olympiad', 'registration', 'award', 'national'],
    cond: ctx => !ctx.hasNationalAward,
    text: 'Register for {{competitionList}} — most have registration deadlines two to three months before the contest date and no late entry.',
  },
  {
    id: 'tl-pre-summer-apps',
    topic: 'timeline', phase: 'pre', months: ['December', 'January', 'February'],
    title: 'Apply to selective summer programmes',
    tags: ['summer', 'program', 'application', 'research', 'selective'],
    cond: ctx => !ctx.isSenior,
    text: 'Submit applications to free or selective summer programmes — RSI, SSP, MITES, and most university lab placements close between January and March.',
  },
  {
    id: 'tl-pre-leadership',
    topic: 'timeline', phase: 'pre', months: ['March', 'April', 'May'],
    title: 'Stand for a leadership position',
    tags: ['leadership', 'election', 'club', 'president', 'officer', 'role'],
    cond: ctx => !ctx.hasLeadership,
    text: 'Stand for election or propose a new initiative now — club leadership for the coming year is decided in spring, and a title awarded after September is too late to have produced results.',
  },
  {
    id: 'tl-pre-toefl',
    topic: 'timeline', phase: 'pre', months: ['April', 'May', 'June'],
    title: 'Take the English proficiency test',
    tags: ['toefl', 'ielts', 'english', 'test', 'proficiency', 'registration'],
    cond: ctx => (ctx.toefl > 0 && ctx.toefl < 105) || (ctx.ielts > 0 && ctx.ielts < 7.5) || (!ctx.toefl && !ctx.ielts),
    text: 'Sit {{englishTest}} with enough runway for one retake before applications — scores take two weeks to release and are valid for two years.',
  },
  {
    id: 'tl-pre-ap-exams',
    topic: 'timeline', phase: 'pre', months: ['May'],
    title: 'Sit AP and IB examinations',
    tags: ['ap', 'ib', 'exam', 'may', 'credit', 'scores'],
    cond: ctx => (ctx.apCount > 0 || ctx.ibProgram),
    text: 'Sit your AP/IB examinations — scores are self-reported on applications and strong results corroborate a transcript from an unfamiliar school system.',
  },
  {
    id: 'tl-pre-school-list',
    topic: 'timeline', phase: 'pre', months: ['June', 'July'],
    title: 'Build the first school list',
    tags: ['list', 'schools', 'research', 'balance', 'shortlist'],
    cond: ctx => true,
    text: 'Draft a first school list of 12–15 across reach, match, and safety bands, and record each school\'s aid policy for international students next to it.',
  },
  {
    id: 'tl-pre-essay-start',
    topic: 'timeline', phase: 'pre', months: ['June', 'July'],
    title: 'Start the personal statement',
    tags: ['essay', 'personal', 'statement', 'draft', 'summer', 'writing'],
    cond: ctx => true,
    text: 'Write three different opening pages for three different essay ideas — the summer before senior year is the only time you will have unhurried hours for this.',
  },

  // ── Application year: August–September ─────────────────────
  {
    id: 'tl-apps-commonapp-open',
    topic: 'timeline', phase: 'apps', months: ['August'],
    title: 'Open the Common App account',
    tags: ['commonapp', 'account', 'open', 'profile', 'setup', 'august'],
    cond: ctx => true,
    text: 'Create the Common App account (it opens August 1), complete the education and activities sections, and add your schools so every supplement becomes visible.',
  },
  {
    id: 'tl-apps-activity-list',
    topic: 'timeline', phase: 'apps', months: ['August'],
    title: 'Write the activities section properly',
    tags: ['activities', 'commonapp', 'description', 'ordering', 'impact'],
    cond: ctx => true,
    text: 'Write all ten activity descriptions with numbers in them, ordered by importance rather than chronology — 150 characters each, verbs first, no full sentences needed.',
  },
  {
    id: 'tl-apps-recommenders',
    topic: 'timeline', phase: 'apps', months: ['August', 'September'],
    title: 'Ask recommenders and hand over briefs',
    tags: ['recommendation', 'teacher', 'counselor', 'ask', 'brief', 'letter'],
    cond: ctx => true,
    text: 'Ask two core-subject teachers and your counsellor in person, then send each a one-page brief with specific classroom moments and your application list.',
  },
  {
    id: 'tl-apps-essay-final',
    topic: 'timeline', phase: 'apps', months: ['September'],
    title: 'Finish the personal statement',
    tags: ['essay', 'personal', 'statement', 'final', 'revision', 'draft'],
    cond: ctx => true,
    text: 'Finish the personal statement to final draft — anything still unfinished in October will be written in a rush alongside supplements.',
  },
  {
    id: 'tl-apps-last-test',
    topic: 'timeline', phase: 'apps', months: ['August', 'September', 'October'],
    title: 'Sit the final test attempt',
    tags: ['sat', 'act', 'test', 'final', 'retake', 'score'],
    cond: ctx => ctx.needsTestRetake,
    text: 'Take your final SAT/ACT sitting — the {{lastTestMonth}} test is the last one that reliably reports before early deadlines.',
  },
  {
    id: 'tl-apps-transcripts',
    topic: 'timeline', phase: 'apps', months: ['September'],
    title: 'Order transcripts and translations',
    tags: ['transcript', 'translation', 'documents', 'school', 'records'],
    cond: ctx => true,
    text: 'Request official transcripts and certified English translations — non-US schools routinely take three to four weeks and this is the most common cause of an incomplete file.',
  },
  {
    id: 'tl-apps-supplements-start',
    topic: 'timeline', phase: 'apps', months: ['September', 'October'],
    title: 'Draft the early-round supplements',
    tags: ['supplement', 'essay', 'whyus', 'draft', 'early'],
    cond: ctx => true,
    text: 'Draft every supplement for your early-round schools, starting with the longest Why Us essay so the shorter ones can borrow from it.',
  },

  // ── Application year: October–November ─────────────────────
  {
    id: 'tl-apps-ed-decision',
    topic: 'timeline', phase: 'apps', months: ['October'],
    title: 'Commit to the early-round choice',
    tags: ['ed', 'ea', 'rea', 'decision', 'commit', 'choice', 'early'],
    cond: ctx => true,
    text: 'Make the final call on your binding or restrictive early school — {{edRecommendation}} — and confirm the aid implications before signing the agreement.',
  },
  {
    id: 'tl-apps-financial-docs',
    topic: 'timeline', phase: 'apps', months: ['October', 'November'],
    title: 'Assemble financial certification',
    tags: ['financial', 'certification', 'bank', 'sponsor', 'i20', 'documents'],
    cond: ctx => true,
    text: 'Collect bank statements, sponsor letters, and the CSS Profile if any of your schools require it — plan on roughly {{oneYearCost}} of documented funding per year.',
  },
  {
    id: 'tl-apps-early-submit',
    topic: 'timeline', phase: 'apps', months: ['November'],
    title: 'Submit early applications',
    tags: ['submit', 'early', 'deadline', 'november', 'ed', 'ea'],
    cond: ctx => true,
    text: 'Submit all ED/EA/REA applications by November 1 (a few schools use November 15), then verify each portal 48 hours later for missing documents.',
  },
  {
    id: 'tl-apps-uc-submit',
    topic: 'timeline', phase: 'apps', months: ['November'],
    title: 'Submit the UC application',
    tags: ['uc', 'california', 'submit', 'november', 'pig', 'deadline'],
    cond: ctx => ctx.hasUC,
    text: 'Submit the UC application between November 1 and November 30 — one form covers {{ucList}}, with four Personal Insight Questions and no extensions.',
  },
  {
    id: 'tl-apps-interviews',
    topic: 'timeline', phase: 'apps', months: ['November', 'December', 'January'],
    title: 'Complete alumni interviews',
    tags: ['interview', 'alumni', 'schedule', 'preparation'],
    cond: ctx => true,
    text: 'Accept every interview invitation within 48 hours and prepare three two-minute stories plus one specific question per school.',
  },

  // ── Application year: December–January ─────────────────────
  {
    id: 'tl-apps-early-results',
    topic: 'timeline', phase: 'apps', months: ['December'],
    title: 'Handle early decisions',
    tags: ['results', 'december', 'defer', 'admit', 'deny', 'decision'],
    cond: ctx => true,
    text: 'Early results land mid-December: if admitted under ED, withdraw all other applications; if deferred, prepare the letter of continued interest; if denied, finalise the RD list immediately.',
  },
  {
    id: 'tl-apps-rd-finish',
    topic: 'timeline', phase: 'apps', months: ['December'],
    title: 'Finish Regular Decision supplements',
    tags: ['rd', 'supplement', 'essay', 'december', 'finish', 'deadline'],
    cond: ctx => true,
    text: 'Finish every Regular Decision supplement before the winter break ends — January 1 deadlines fall during a holiday when nobody at your school can send a missing document.',
  },
  {
    id: 'tl-apps-rd-submit',
    topic: 'timeline', phase: 'apps', months: ['January'],
    title: 'Submit Regular Decision applications',
    tags: ['rd', 'submit', 'january', 'deadline', 'regular', 'decision'],
    cond: ctx => true,
    text: 'Submit all Regular Decision applications by January 1–15 depending on the school, and send the letter of continued interest to any school that deferred you.',
  },
  {
    id: 'tl-apps-midyear',
    topic: 'timeline', phase: 'apps', months: ['January', 'February'],
    title: 'Send the mid-year report',
    tags: ['midyear', 'report', 'grades', 'transcript', 'counselor'],
    cond: ctx => true,
    text: 'Ask your counsellor to send the mid-year report with first-semester senior grades — schools use it to confirm your rigour claims held up.',
  },

  // ── Decision phase: February–July ──────────────────────────
  {
    id: 'tl-dec-grades',
    topic: 'timeline', phase: 'decision', months: ['February', 'March'],
    title: 'Protect senior-year grades',
    tags: ['grades', 'senior', 'rescind', 'transcript', 'final'],
    cond: ctx => true,
    text: 'Keep senior grades stable — offers are conditional on the final transcript and a significant drop is the most common cause of a rescinded international offer.',
  },
  {
    id: 'tl-dec-results',
    topic: 'timeline', phase: 'decision', months: ['March', 'April'],
    title: 'Compare admission and aid offers',
    tags: ['results', 'offers', 'compare', 'aid', 'cost', 'decision'],
    cond: ctx => true,
    text: 'Regular decisions release from mid-March to April 1; compare total four-year cost rather than headline scholarship figures, and appeal any aid package with a documented change in circumstances.',
  },
  {
    id: 'tl-dec-deposit',
    topic: 'timeline', phase: 'decision', months: ['April', 'May'],
    title: 'Deposit by May 1',
    tags: ['deposit', 'may', 'enroll', 'commit', 'deadline'],
    cond: ctx => true,
    text: 'Place the enrolment deposit by May 1 even if you are on a waitlist elsewhere — waitlist movement almost never comes with aid and rarely resolves before June.',
  },
  {
    id: 'tl-dec-i20',
    topic: 'timeline', phase: 'decision', months: ['May', 'June'],
    title: 'Request the I-20 and pay SEVIS',
    tags: ['i20', 'sevis', 'visa', 'f1', 'documents', 'immigration'],
    cond: ctx => true,
    text: 'Submit financial documents to your school\'s international office for the I-20, then pay the SEVIS I-901 fee — the receipt is required before you can book a visa interview.',
  },
  {
    id: 'tl-dec-visa',
    topic: 'timeline', phase: 'decision', months: ['June', 'July'],
    title: 'Book and attend the F-1 interview',
    tags: ['visa', 'interview', 'f1', 'embassy', 'ds160', 'appointment'],
    cond: ctx => true,
    text: 'Complete the DS-160, book the consular appointment the day slots open, and attend the F-1 interview — summer wait times in {{countryName}} routinely exceed six weeks.',
  },
  {
    id: 'tl-dec-housing',
    topic: 'timeline', phase: 'decision', months: ['May', 'June'],
    title: 'Complete enrolment logistics',
    tags: ['housing', 'orientation', 'placement', 'enrollment', 'registration'],
    cond: ctx => true,
    text: 'Complete housing selection, placement tests, and international orientation registration — most have deadlines in May or June and housing is allocated first-come.',
  },
];

module.exports = { DOCS };
