// src/engines/careerPredictor.js
// Predicts likely career outcomes based on school + major combination.

const CAREER_PATHS = {
  cs: {
    'Software Engineer':          0.38,
    'Machine Learning Engineer':  0.18,
    'Product Manager':            0.12,
    'Data Scientist':             0.12,
    'Startup Founder':            0.08,
    'Research Scientist':         0.07,
    'Quantitative Analyst':       0.05,
  },
  engineering: {
    'Mechanical/Aerospace Engineer': 0.30,
    'Systems Engineer':              0.18,
    'Hardware Engineer':             0.15,
    'Engineering Manager':           0.12,
    'Consultant':                    0.10,
    'Startup Founder':               0.08,
    'Research Engineer':             0.07,
  },
  business: {
    'Management Consultant':    0.25,
    'Investment Banking Analyst': 0.20,
    'Product Manager':          0.15,
    'Finance / Private Equity': 0.15,
    'Marketing Manager':        0.12,
    'Startup Founder':          0.08,
    'Operations Manager':       0.05,
  },
  economics: {
    'Policy Analyst':           0.20,
    'Financial Analyst':        0.20,
    'Management Consultant':    0.18,
    'Data Analyst':             0.15,
    'Investment Banking':       0.12,
    'Graduate / PhD':           0.10,
    'Startup Founder':          0.05,
  },
  biology: {
    'Medical Doctor (MD)':      0.30,
    'Research Scientist':       0.20,
    'Biotech / Pharma':         0.18,
    'Public Health':            0.12,
    'Physician Assistant':      0.10,
    'Science Writer':           0.05,
    'Graduate / PhD':           0.05,
  },
  // math and physics exist here so this table covers the same keys as
  // SALARY_TABLE in src/rag/knowledge/careers.js. Without them these majors fell
  // through to `default`, and the Career tab chart contradicted the salary
  // figures in the report text on the same page.
  math: {
    'Quantitative Analyst':      0.24,
    'Data Scientist':            0.22,
    'Software Engineer':         0.18,
    'Financial Analyst':         0.14,
    'Research Scientist':        0.12,
    'Graduate / PhD':            0.10,
  },
  physics: {
    'Research Scientist':        0.28,
    'Data Scientist':            0.20,
    'Hardware Engineer':         0.16,
    'Quantitative Analyst':      0.14,
    'Graduate / PhD':            0.14,
    'Software Engineer':         0.08,
  },
  default: {
    'Industry Professional':    0.30,
    'Graduate Student':         0.20,
    'Consultant':               0.18,
    'Nonprofit / Government':   0.15,
    'Entrepreneur':             0.10,
    'Researcher':               0.07,
  },
};

// Shared with the match engine and the ROI engine. The local copy this
// replaced tested `major.includes('cs')`, which also matches the tail of
// "economics", "physics", "statistics" and "mathematics" — so those majors were
// all shown Software Engineer and Machine Learning Engineer.
const { getMajorKey } = require('../majorKey');

function predictCareer(student, school) {
  const majorKey = getMajorKey(student?.major);
  const careers  = CAREER_PATHS[majorKey] || CAREER_PATHS.default;

  // Adjust weights based on school prestige (lower acceptance = more finance/consulting/research)
  const intlRate = school?.intlAcceptanceRate || school?.acceptanceRate || 50;
  const isElite  = intlRate < 10;

  const ranked = Object.entries(careers)
    .map(([title, prob]) => {
      // Elite schools boost consulting/finance/research slightly
      let adjusted = prob;
      if (isElite && ['Management Consultant', 'Investment Banking Analyst', 'Research Scientist', 'Machine Learning Engineer'].includes(title)) {
        adjusted *= 1.3;
      }
      return { title, probability: Math.round(adjusted * 100) };
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  return ranked;
}

// CAREER_PATHS is exported so the test suite can assert it covers the same
// majors as SALARY_TABLE in src/rag/knowledge/careers.js — when the two drift,
// the Career tab chart contradicts the salary figures printed beside it.
module.exports = { predictCareer, CAREER_PATHS };
