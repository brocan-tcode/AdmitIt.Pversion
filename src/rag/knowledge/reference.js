// src/rag/knowledge/reference.js
// Small lookup tables used to fill placeholders in retrieved text.
// Keyed by the majorKey values produced by matchEngine.getMajorKey().

const MAJOR_LABELS = {
  cs:             'Computer Science',
  robotics:       'Robotics',
  engineering:    'Engineering',
  business:       'Business',
  economics:      'Economics',
  math:           'Mathematics',
  physics:        'Physics',
  biology:        'Biology',
  chemistry:      'Chemistry',
  policy:         'Political Science and Policy',
  international:  'International Relations',
  communications: 'Communications and Media',
  architecture:   'Architecture',
  environmental:  'Environmental Science',
  publichealth:   'Public Health',
  nursing:        'Nursing',
  music:          'Music',
  default:        'your intended field',
};

const COMPETITIONS = {
  cs:             'USACO, the AMC/AIME sequence, Kaggle competitions, or a regional ICPC-style contest',
  robotics:       'FIRST Robotics, VEX Worlds, or RoboCup Junior',
  engineering:    'ISEF, Science Olympiad build events, FIRST Robotics, or the physics olympiad sequence',
  business:       'DECA, FBLA, the Wharton Global High School Investment Competition, or Diamond Challenge',
  economics:      'the National Economics Challenge, the Wharton Investment Competition, or an econ essay competition',
  math:           'AMC 10/12 into AIME, HMMT, or your national mathematical olympiad',
  physics:        'the F=ma exam into USAPhO, or your national physics olympiad',
  biology:        'USABO, Science Olympiad, Regeneron STS, or ISEF',
  chemistry:      'the USNCO local and national exams, or ISEF',
  policy:         'Model UN at national level, the Harvard Debate circuit, or the John Locke essay competition',
  international:  'Model UN at national level, Diplomacy competitions, or the John Locke essay competition',
  communications: 'Scholastic Art and Writing Awards, NYT student competitions, or a national journalism contest',
  architecture:   'the ACE Mentor competition, Fischer Prize, or a national design contest',
  environmental:  'Envirothon, ISEF environmental sciences, or the Stockholm Junior Water Prize',
  publichealth:   'ISEF, HOSA competitive events, or a national public-health case competition',
  nursing:        'HOSA competitive events or a state health-sciences competition',
  music:          'a national youth orchestra audition, YoungArts, or a recognised concours',
  default:        'the two or three most recognised national competitions in your field',
};

const RIGOR_SUBJECTS = {
  cs:             'mathematics, physics, and computer science',
  robotics:       'physics, mathematics, and design technology',
  engineering:    'physics, calculus, and chemistry',
  business:       'mathematics, economics, and statistics',
  economics:      'mathematics, economics, and statistics',
  math:           'calculus, statistics, and further mathematics',
  physics:        'physics, calculus, and further mathematics',
  biology:        'biology, chemistry, and mathematics',
  chemistry:      'chemistry, biology, and calculus',
  policy:         'history, government, and economics',
  international:  'history, economics, and a second language',
  communications: 'English literature, history, and media studies',
  architecture:   'physics, art, and mathematics',
  environmental:  'biology, chemistry, and environmental science',
  publichealth:   'biology, statistics, and chemistry',
  nursing:        'biology, chemistry, and psychology',
  music:          'music theory, history, and English',
  default:        'your strongest academic subjects',
};

// Fields with a STEM CIP designation, which controls the 24-month OPT extension.
const STEM_MAJOR_KEYS = new Set([
  'cs', 'robotics', 'engineering', 'math', 'physics', 'biology',
  'chemistry', 'environmental', 'publichealth',
]);

// Economics and several business analytics degrees carry STEM designation at
// many universities but not all — treated as conditional.
const CONDITIONAL_STEM_KEYS = new Set(['economics', 'nursing']);

function isStemMajor(majorKey, majorText = '') {
  if (STEM_MAJOR_KEYS.has(majorKey)) return true;
  const m = String(majorText).toLowerCase();
  return /data|statistic|analytic|quantitative|computational|informatics|neuroscience|actuarial/.test(m);
}

module.exports = {
  MAJOR_LABELS, COMPETITIONS, RIGOR_SUBJECTS,
  STEM_MAJOR_KEYS, CONDITIONAL_STEM_KEYS, isStemMajor,
};
