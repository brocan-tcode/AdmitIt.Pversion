// src/rag/knowledge/profile.js
// Assessment language for the "PROFILE STRENGTH" section, banded by how the
// student's numbers actually sit against their matched schools.

const DOCS = [
  {
    id: 'prof-band-elite',
    topic: 'profile', band: 'elite',
    title: 'Competitive at the most selective schools',
    tags: ['strong', 'elite', 'competitive', 'top', 'assessment', 'band'],
    cond: ctx => ctx.strengthBand === 'elite',
    text: 'On the numbers you are inside the admitted band at every school on this list, including {{topReach}}. That is the threshold for being read seriously rather than screened out, and it is where the numbers stop being the deciding factor — at this level the differentiator is whether the activity record and essays give a reader one specific thing to argue for in committee.',
  },
  {
    id: 'prof-band-strong',
    topic: 'profile', band: 'strong',
    title: 'Strong profile, reaches remain reaches',
    tags: ['strong', 'competitive', 'solid', 'assessment', 'band', 'reach'],
    cond: ctx => ctx.strengthBand === 'strong',
    text: 'Your academics put you in genuine contention across the match band and make the reaches plausible rather than decorative. The gap to close is not academic — it is that at single-digit acceptance rates, a strong transcript is the entry ticket rather than the argument, and the argument has to come from somewhere else in the file.',
  },
  {
    id: 'prof-band-solid',
    topic: 'profile', band: 'solid',
    title: 'Solid profile with a realistic target band',
    tags: ['solid', 'realistic', 'match', 'assessment', 'band', 'target'],
    cond: ctx => ctx.strengthBand === 'solid',
    text: 'Your profile is solid and lands naturally in the match band, where you are a credible admit rather than a long shot. The most productive use of the remaining time is strengthening the match and safety applications rather than adding reaches — the marginal reach application has a low expected value at this profile strength, while a well-differentiated match application has a high one.',
  },
  {
    id: 'prof-band-developing',
    topic: 'profile', band: 'developing',
    title: 'Developing profile with fixable gaps',
    tags: ['developing', 'gaps', 'improve', 'assessment', 'band', 'realistic'],
    cond: ctx => ctx.strengthBand === 'developing' && ctx.hasSafety,
    text: 'Being direct: the numbers currently place you below the admitted band at the selective end of this list, and no essay recovers that gap. The good news is that the largest gaps are the ones that still move — test scores and senior-year rigour both change within a single cycle, and this list does contain real, well-regarded options in the match and safety bands where you would be a strong candidate rather than a marginal one.',
  },
  {
    id: 'prof-band-below-range',
    topic: 'profile', band: 'developing',
    title: 'Profile sits below this database entire range',
    tags: ['developing', 'below', 'range', 'safety', 'realistic', 'broaden', 'list'],
    cond: ctx => ctx.belowCorpusRange,
    text: 'Being direct about something the school list cannot show you: your strongest odds anywhere on it are {{bestOdds}}% at {{bestOddsSchool}}, which means this list contains no safe option for you at all. That is a limit of the database, not a verdict on you — it holds {{corpusSchoolCount}} selective and mid-selective universities, and only a handful admit more than 70% of applicants. Students in your range are admitted every year to regional public universities, less selective private colleges, and transfer pathways that begin at a community college, and none of those are in here. Treat everything below as advice on strengthening the profile, and build the realistic half of your list from sources outside this tool.',
  },
  {
    id: 'prof-ec-strong',
    topic: 'profile', band: 'any',
    title: 'Activity record is carrying weight',
    tags: ['extracurricular', 'activities', 'strong', 'leadership', 'record'],
    cond: ctx => ctx.ecScore >= 12,
    text: 'The activity record is doing real work here — an EC impact score of {{ecScore}}/20 with {{activityCount}} entries is above what most international applicants present, and it is the part of the file most likely to produce an advocate in committee.',
  },
  {
    id: 'prof-ec-weak',
    topic: 'profile', band: 'any',
    title: 'Activity record is the limiting factor',
    tags: ['extracurricular', 'activities', 'weak', 'limiting', 'thin', 'record'],
    cond: ctx => ctx.ecScore < 8,
    text: 'The limiting factor is outside the classroom: an EC impact score of {{ecScore}}/20 leaves the file reading as academics-only, which is exactly the profile that gets screened out at schools where every applicant has the academics.',
  },
  {
    id: 'prof-rigor-strong',
    topic: 'profile', band: 'any',
    title: 'Course rigour is a strength',
    tags: ['rigor', 'courses', 'ap', 'ib', 'strong', 'transcript'],
    cond: ctx => ctx.rigorIndex >= 7.5,
    text: 'Course rigour at {{rigorIndex}}/10 is a genuine strength and answers the question readers ask first about an unfamiliar transcript — whether the student took the hardest available path.',
  },
  {
    id: 'prof-rigor-weak',
    topic: 'profile', band: 'any',
    title: 'Course rigour is under-built',
    tags: ['rigor', 'courses', 'ap', 'ib', 'weak', 'gap', 'transcript'],
    cond: ctx => ctx.rigorIndex < 5.5,
    text: 'Course rigour at {{rigorIndex}}/10 is the quietest problem in this profile — readers compare courses taken against courses available, and a visible gap is read as avoidance regardless of the grades earned.',
  },
  {
    id: 'prof-test-strong',
    topic: 'profile', band: 'any',
    title: 'Test score is above the target band',
    tags: ['sat', 'act', 'test', 'strong', 'score', 'percentile'],
    cond: ctx => ctx.satEq > 0 && ctx.topReach && ctx.satEq >= ctx.topReach.satRange[1],
    text: 'A {{satLabel}} sits at or above the 75th percentile even at {{topReach}}, which removes the academic screen as an obstacle anywhere on this list.',
  },
  {
    id: 'prof-test-gap',
    topic: 'profile', band: 'any',
    title: 'Test score is the largest fixable gap',
    tags: ['sat', 'act', 'test', 'gap', 'below', 'retake', 'score'],
    cond: ctx => ctx.satEq > 0 && ctx.topReach && ctx.satEq < ctx.topReach.satRange[0],
    text: 'A {{satLabel}} against {{topReach}}\'s {{reachSat25}}–{{reachSat75}} band is the largest single fixable gap in the profile, and it is the one that still moves inside one testing cycle.',
  },
];

module.exports = { DOCS };
