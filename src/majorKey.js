// src/majorKey.js
// The single canonical mapping from a free-text major to an internal key.
//
// This used to be duplicated in three places — matchEngine.js, engines/
// careerPredictor.js and engines/roiEngine.js — and the two copies in engines/
// used `major.includes('cs')` as their test for Computer Science. That substring
// also appears at the end of "economi-cs", "physi-cs", "statisti-cs" and
// "mathemati-cs", so an Economics applicant was shown Software Engineer and
// Machine Learning Engineer on the Career tab and priced with the CS salary
// multiplier, while the report text beside it correctly said Financial Analyst.
//
// Order matters: the first match wins, so more specific tests come first.

function getMajorKey(majorStr) {
  if (!majorStr) return 'default';
  const m = String(majorStr).toLowerCase();

  // Checked before the generic engineering test so "computer engineering" and
  // "software engineering" land in cs rather than engineering.
  if (m.includes('computer') || m.includes('eecs') || m.includes('software') ||
      m.includes('machine learning') || m.includes('artificial intelligence') ||
      m.includes('data science') || m.includes('informatics') ||
      m.includes('cybersecurity') || /\bcs\b/.test(m) || / ai\b/.test(m)) return 'cs';

  if (m.includes('robotics')) return 'robotics';

  if (m.includes('mechanical') || m.includes('aerospace') || m.includes('chemical') ||
      m.includes('biomedical')  || m.includes('civil') || m.includes('industrial') ||
      m.includes('electrical')  || m.includes('engineering')) return 'engineering';

  if (m.includes('business') || m.includes('finance') || m.includes('management') ||
      m.includes('accounting') || m.includes('marketing')) return 'business';

  if (m.includes('economics'))    return 'economics';
  if (m.includes('statistic'))    return 'math';
  if (m.includes('math'))         return 'math';
  if (m.includes('physics') || m.includes('astronomy') || m.includes('astrophysics')) return 'physics';
  if (m.includes('biology') || m.includes('pre-med') || m.includes('premed') ||
      m.includes('medicine') || m.includes('neuroscience')) return 'biology';
  if (m.includes('chemistry'))    return 'chemistry';
  if (m.includes('political') || m.includes('government') || m.includes('public policy')) return 'policy';
  if (m.includes('international')) return 'international';
  if (m.includes('film') || m.includes('media') || m.includes('journalism') ||
      m.includes('communications')) return 'communications';
  if (m.includes('architecture')) return 'architecture';
  if (m.includes('environmental')) return 'environmental';
  if (m.includes('public health') || m.includes('global health')) return 'publichealth';
  if (m.includes('nursing'))  return 'nursing';
  if (m.includes('music'))    return 'music';
  return 'default';
}

module.exports = { getMajorKey };
