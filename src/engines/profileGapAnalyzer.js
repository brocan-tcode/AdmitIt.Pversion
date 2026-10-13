// src/engines/profileGapAnalyzer.js
// Compares the student's profile against a target school's admit profile
// and returns structured gap objects the UI and the report use.
//
// `band` is the admitted profile for the student's MAJOR at this school, from
// src/data/majorAdmissions.js. It matters: measuring against the school-wide
// range contradicted the school card, which shows the per-major band. A 3.7 /
// 1400 CS applicant to Illinois produced NO gaps against the school-wide
// 3.7-4.0 / 1330-1530 range, while the same card showed the CS band as
// 3.75-4.0 / 1440-1550 and the odds as 7%. The student was told nothing needed
// fixing at a school where they were below the bar on both axes.

function analyzeProfile(student, school, band) {
  const gaps = [];

  if (!school) return gaps;

  // Prefer the major-specific band; fall back to the school-wide range.
  const satRange = band?.sat || school.satRange;
  const gpaRange = band?.gpa || school.gpaRange;
  const usingMajorBand = !!(band && band.sat && band.gpa);
  const forMajor = usingMajorBand && student.major ? ` for ${student.major}` : '';

  // The admit rate the student actually faces, which at a direct-admit school
  // is the major's rate rather than the university's.
  const effectiveRate = band?.intlRate ?? band?.rate ?? school.intlAcceptanceRate;

  const schoolSatMedian = satRange
    ? Math.round((satRange[0] + satRange[1]) / 2)
    : 1400;

  const studentSat = parseInt(student.sat) || (parseInt(student.act) * 44) || 0;
  if (studentSat > 0 && studentSat < schoolSatMedian - 30) {
    gaps.push({
      category: 'Testing',
      severity: studentSat < schoolSatMedian - 100 ? 'high' : 'medium',
      message:  `SAT ${studentSat} is below the ~${schoolSatMedian} median admitted${forMajor} at ${school.name.replace(/\s*\(.*?\)\s*/g, '')}`,
      fix:      `Target a retake score of ${schoolSatMedian + 20}+`,
    });
  }

  // GPA gap
  const schoolGpaMedian = gpaRange
    ? (gpaRange[0] + gpaRange[1]) / 2
    : 3.7;
  const studentGpa = parseFloat(student.gpa) || 0;
  if (studentGpa < schoolGpaMedian - 0.15) {
    gaps.push({
      category: 'GPA',
      severity: studentGpa < schoolGpaMedian - 0.3 ? 'high' : 'medium',
      message:  `GPA ${studentGpa} is below the ~${schoolGpaMedian.toFixed(2)} median admitted${forMajor}`,
      fix:      'Focus on senior-year grades and address any grade trends in your essays',
    });
  }

  // Course rigor gap
  const apTaken     = parseInt(student.apCount || student.ap_taken) || 0;
  const apAvailable = parseInt(student.totalAPsOffered || student.ap_available) || 0;
  const apRatio     = apAvailable > 0 ? apTaken / apAvailable : apTaken >= 5 ? 0.8 : 0.4;
  if (apRatio < 0.5 && effectiveRate < 20) {
    gaps.push({
      category: 'Course Rigor',
      severity: apRatio < 0.3 ? 'high' : 'medium',
      message:  `AP course load (${apTaken} taken) is below what selective schools expect`,
      fix:      'Maximize remaining AP / IB courses in senior year',
    });
  }

  // EC gap
  const activities    = student.activities || [];
  const hasLeadership = activities.some(a =>
    ['Founder / President', 'Captain / Editor'].includes(a.leadership)
  );
  // Check BOTH activity type AND the free-text awards field
  const hasNational = activities.some(a =>
    ['National Award / Competition', 'International Award / Competition'].includes(a.type)
  ) || (student.awards && student.awards.trim().length > 5);

  if (!hasLeadership && effectiveRate < 15) {
    gaps.push({
      category: 'Extracurriculars',
      severity: 'high',
      message:  'No demonstrated leadership role in any major activity',
      fix:      'Pursue a founding or president role in a club or project before applications',
    });
  }
  if (!hasNational && effectiveRate < 10) {
    gaps.push({
      category: 'Awards',
      severity: 'high',
      message:  `No national or international award — critical where the admit rate you face is ${Math.round(effectiveRate)}%`,
      fix:      'Enter AMC, USACO, science olympiads, or relevant competitions now',
    });
  }

  // TOEFL / IELTS gap
  const toefl = parseInt(student.toefl) || 0;
  const ielts = parseFloat(student.ielts) || 0;
  if (toefl > 0 && toefl < 100) {
    gaps.push({
      category: 'English Proficiency',
      severity: toefl < 90 ? 'high' : 'medium',
      message:  `TOEFL ${toefl} is below the 100+ most selective schools require`,
      fix:      'Retake TOEFL — target 110+ for top schools',
    });
  }
  if (ielts > 0 && ielts < 7.0) {
    gaps.push({
      category: 'English Proficiency',
      severity: ielts < 6.5 ? 'high' : 'medium',
      message:  `IELTS ${ielts} is below the 7.0+ most selective schools require`,
      fix:      'Retake IELTS — target 7.5+ for top schools',
    });
  }

  return gaps;
}

module.exports = { analyzeProfile };
