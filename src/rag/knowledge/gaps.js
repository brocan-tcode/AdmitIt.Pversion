// src/rag/knowledge/gaps.js
// Impact statements for the "GAP ANALYSIS" section.
//
// The gap engine (src/engines/profileGapAnalyzer.js) detects WHAT is missing.
// These docs supply the IMPACT — why it costs admissions odds — which is the
// part the LLM used to write. Retrieved by gap category + school context.

const DOCS = [
  {
    id: 'gap-impact-testing',
    topic: 'gap', category: 'Testing',
    title: 'Impact of a below-median test score',
    tags: ['sat', 'act', 'test', 'score', 'median', 'academic', 'index', 'testing'],
    text: 'Below-median scores are filtered before holistic reading at most schools with sub-20% acceptance — the academic index screen runs first, and international applicants get less benefit of the doubt because readers cannot calibrate an unfamiliar grading system without a comparable test number.',
  },
  {
    id: 'gap-impact-gpa',
    topic: 'gap', category: 'GPA',
    title: 'Impact of a below-median GPA',
    tags: ['gpa', 'grades', 'transcript', 'academic', 'median', 'trend'],
    text: 'GPA is the single highest-weighted factor in nearly every published admissions survey, and unlike a test score it cannot be retaken. What can still change is the trend — an upward senior-year line is read very differently from a flat or declining one, and an unexplained dip with no counsellor note is assumed to be the worst case.',
  },
  {
    id: 'gap-impact-rigor',
    topic: 'gap', category: 'Course Rigor',
    title: 'Impact of a light course load',
    tags: ['rigor', 'ap', 'ib', 'courses', 'curriculum', 'transcript', 'available'],
    text: 'Readers score rigour against what your school offered, not against a national standard, so a visible gap between courses available and courses taken reads as deliberate avoidance of difficulty. At schools admitting under 20% this alone moves a file from the admit pile to the deny pile even when grades are strong.',
  },
  {
    id: 'gap-impact-leadership',
    topic: 'gap', category: 'Extracurriculars',
    title: 'Impact of no leadership role',
    tags: ['leadership', 'extracurricular', 'president', 'founder', 'initiative', 'passive'],
    text: 'Selective schools are explicitly selecting for people who will start things on campus, and the only available evidence is whether you started things before campus. A list of memberships with no title, no founding, and no measurable outcome reads as participation rather than initiative — the most common weakness in academically strong international files.',
  },
  {
    id: 'gap-impact-awards',
    topic: 'gap', category: 'Awards',
    title: 'Impact of no external recognition',
    tags: ['award', 'competition', 'national', 'recognition', 'external', 'benchmark'],
    text: 'External awards are the only part of an application verified by someone other than your own school. For an applicant from an unfamiliar school system that verification carries disproportionate weight, and at sub-10% schools the absence of any national-level distinction is a routine early cut.',
  },
  {
    id: 'gap-impact-english',
    topic: 'gap', category: 'English Proficiency',
    title: 'Impact of a marginal English score',
    tags: ['toefl', 'ielts', 'english', 'proficiency', 'threshold', 'screening'],
    text: 'English scores function as a hard screen rather than a scored factor — files below a school\'s stated floor are often never read holistically at all. Sub-scores matter independently: Speaking below 24 on TOEFL triggers ESL placement or an interview requirement at several universities regardless of the total.',
  },
  {
    id: 'gap-impact-research',
    topic: 'gap', category: 'Research',
    title: 'Impact of no research experience',
    tags: ['research', 'lab', 'academic', 'stem', 'depth', 'professor'],
    text: 'For research-university applicants in STEM, mentored research is the clearest signal that a student can operate beyond a syllabus. Its absence is not fatal, but it removes the strongest available differentiator in a pool where transcripts and test scores cluster tightly at the top.',
  },
  {
    id: 'gap-impact-narrative',
    topic: 'gap', category: 'Narrative',
    title: 'Impact of an incoherent activity list',
    tags: ['narrative', 'theme', 'coherence', 'story', 'spike', 'scattered'],
    text: 'Readers spend eight to fifteen minutes on a file and remember one sentence about each applicant. An activity list with no through-line gives them nothing to remember, so the file is scored on numbers alone — which is precisely the comparison an international applicant with a strong but not extraordinary transcript loses.',
  },
  {
    id: 'gap-impact-major-fit',
    topic: 'gap', category: 'Major Fit',
    title: 'Impact of unsupported major choice',
    tags: ['major', 'fit', 'evidence', 'why', 'declared', 'mismatch'],
    text: 'Declaring a competitive major with nothing on the activity list supporting it is read as strategic rather than genuine, and at direct-admit schools it is scored against a pool where every competitor has supporting evidence. The mismatch between stated interest and demonstrated interest is one of the fastest reads in the file.',
  },
  {
    id: 'gap-impact-recommendation',
    topic: 'gap', category: 'Recommendations',
    title: 'Impact of thin recommendation letters',
    tags: ['recommendation', 'letter', 'teacher', 'counselor', 'generic', 'evidence'],
    text: 'Letters from schools without a US application culture are frequently three short paragraphs of general praise, which readers discount heavily. A letter that cannot cite a specific classroom moment provides no evidence, and at that point your file is competing entirely on numbers.',
  },
  {
    id: 'gap-impact-budget-infeasible',
    topic: 'gap', category: 'Budget',
    title: 'Impact of a budget below the whole database',
    tags: ['budget', 'cost', 'afford', 'infeasible', 'tuition', 'cheapest', 'unaffordable'],
    text: 'A budget this far below the range makes every school in this report unaffordable at sticker price, which means the list is informational rather than actionable. This is the one constraint that cannot be fixed by strengthening the profile — it has to be solved by changing which schools are on the list, and the schools that solve it are outside this database.',
  },
  {
    id: 'gap-impact-financial',
    topic: 'gap', category: 'Financial',
    title: 'Impact of an aid request at need-aware schools',
    tags: ['financial', 'aid', 'need', 'aware', 'international', 'budget', 'odds'],
    text: 'Outside a handful of need-blind institutions, an international aid request is a factor in the admission decision itself, not just in the aid package. This is rarely stated plainly in marketing material, and it is the main reason strong international applicants receive unexpected denials from mid-tier private universities.',
  },
  {
    id: 'gap-impact-timeline',
    topic: 'gap', category: 'Timeline',
    title: 'Impact of a compressed application timeline',
    tags: ['timeline', 'deadline', 'late', 'rushed', 'essays', 'planning'],
    text: 'Applications assembled in the final three weeks are visibly different: recycled supplements, unedited essays, and missing documents. For international applicants the compression is worse because transcripts, translations, and test-score sends all take longer than domestic equivalents.',
  },
  {
    id: 'gap-impact-list-balance',
    topic: 'gap', category: 'List Balance',
    title: 'Impact of a top-heavy school list',
    tags: ['list', 'balance', 'reach', 'safety', 'realistic', 'risk'],
    text: 'A list weighted toward sub-10% schools produces the same outcome distribution as buying more lottery tickets. Independent admissions probabilities mean eight reaches at 5% each still leaves you more likely than not with no offer from that band — the safety layer is what determines whether you enrol anywhere at all.',
  },
  {
    id: 'gap-impact-visa-planning',
    topic: 'gap', category: 'Visa Planning',
    title: 'Impact of ignoring post-graduation constraints',
    tags: ['visa', 'opt', 'h1b', 'stem', 'career', 'planning', 'sponsorship'],
    text: 'Major choice determines work authorisation length: a STEM-designated degree carries 36 months of OPT versus 12 for non-STEM, which is the difference between three H-1B lottery attempts and one. Students who discover this after enrolling frequently switch majors late and lose a semester.',
  },
];

module.exports = { DOCS };
