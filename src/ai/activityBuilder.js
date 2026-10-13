// src/ai/activityBuilder.js
// Generates a targeted activity improvement plan based on student profile.
// Used to enrich the AI prompt sent to Claude, not replace it.

function buildActivities(student) {
  const major      = (student.major || '').toLowerCase();
  const activities = student.activities || [];
  const plan       = [];

  // Major-specific recommendations
  if (major.includes('computer') || major.includes('cs') || major.includes('software')) {
    plan.push(
      'Publish an open-source project on GitHub with real users or stars',
      'Compete in major hackathons (HackMIT, TreeHacks, or national competitions)',
      'Conduct research with a university professor — aim for a co-authorship or acknowledgment',
      'Build a SaaS product or app with measurable real-world impact',
      'Earn USACO Bronze/Silver or participate in ICPC'
    );
  } else if (major.includes('engineering')) {
    plan.push(
      'Enter science/engineering competitions (Science Olympiad, FIRST Robotics, ISEF)',
      'Complete an engineering internship or shadow a professional engineer',
      'Build a hardware or software project with a clear problem statement',
      'Pursue AMC/AIME or physics olympiad to demonstrate analytical strength'
    );
  } else if (major.includes('business') || major.includes('finance')) {
    plan.push(
      'Launch a small business or monetized side project',
      'Start an investment portfolio and document your research publicly',
      'Intern at a local startup or shadow a business professional',
      'Compete in DECA, FBLA, or case competitions at state/national level'
    );
  } else if (major.includes('biology') || major.includes('pre-med') || major.includes('medicine')) {
    plan.push(
      'Volunteer at a hospital or clinic for at least 100 hours',
      'Shadow physicians across at least 2 specialties',
      'Conduct wet-lab or computational biology research',
      'Compete in Science Olympiad or Biology Olympiad'
    );
  } else {
    plan.push(
      'Identify the top 2-3 national competitions in your field and register now',
      'Find a mentor — professor, professional, or researcher — in your intended field',
      'Start a project, publication, or initiative that demonstrates genuine passion'
    );
  }

  // Gap-based recommendations regardless of major
  const hasNational = activities.some(a =>
    ['National Award / Competition', 'International Award / Competition'].includes(a.type)
  );
  const hasResearch = activities.some(a => a.type === 'Research Experience');
  const hasLeadership = activities.some(a =>
    ['Founder / President', 'Captain / Editor'].includes(a.leadership)
  );

  if (!hasNational) {
    plan.push(
      'Enter national-level competitions relevant to your major — judges from top universities notice these',
      'Submit research or creative work to recognized national programs (Regeneron, Scholastic, etc.)'
    );
  }
  if (!hasResearch) {
    plan.push('Seek a formal research experience — contact professors directly with a cold email showing genuine interest');
  }
  if (!hasLeadership) {
    plan.push('Step into a leadership role: found a club, lead a project team, or create an initiative at your school');
  }

  return [...new Set(plan)]; // deduplicate
}

module.exports = { buildActivities };
