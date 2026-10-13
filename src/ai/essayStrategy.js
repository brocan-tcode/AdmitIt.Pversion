// src/ai/essayStrategy.js
// Generates structured essay strategy based on student profile signals.
// Output is injected into the Claude prompt to make AI output more targeted.

function essayStrategy(student) {
  const activities = student.activities || [];
  const major      = (student.major || '').toLowerCase();

  // Count meaningful activity types (ignore empty/default rows)
  const nonEmpty = activities.filter(a => a.years > 0);

  const hasStartup    = nonEmpty.some(a => a.description && a.description.toLowerCase().includes('startup'));
  const hasCommunity  = nonEmpty.some(a => a.type === 'Community Service');
  const hasResearch   = nonEmpty.some(a => a.type === 'Research Experience');
  const hasPublished  = nonEmpty.some(a => a.type === 'Published Work / Patent');
  const hasLeadershipEC = nonEmpty.some(a =>
    ['School President / Captain / Founder','Club Officer / Editor'].includes(a.type)
  );

  // Award only wins if it's the DOMINANT type (more award entries than anything else)
  const awardCount = nonEmpty.filter(a =>
    ['International Award / Competition', 'National Award / Competition'].includes(a.type)
  ).length;
  const hasAward = awardCount > 0 && awardCount >= nonEmpty.length / 2;

  // Build theme — award is lowest priority unless truly dominant
  let theme = 'intellectual curiosity and academic depth';
  if (hasLeadershipEC)            theme = 'leadership and initiative within your community';
  if (hasCommunity)               theme = 'social impact and community leadership';
  if (hasResearch || hasPublished) theme = 'academic exploration and research-driven curiosity';
  if (hasStartup)                 theme = 'entrepreneurship and problem-solving';
  if (hasAward && awardCount >= 2) theme = 'competitive excellence and resilience under pressure';

  // If major gives a strong signal, prefer major-driven themes
  if (major.includes('computer') || major.includes('cs') || major.includes('engineering')) {
    if (!hasStartup && !hasAward) theme = 'technical problem-solving and its real-world impact';
  }
  if (major.includes('medicine') || major.includes('bio') || major.includes('pre-med')) {
    if (hasResearch) theme = 'scientific inquiry and its human implications';
  }

  // Generate essay ideas
  const essayIdeas = [
    `How ${theme} shaped your personal mission and long-term goals`,
    `A defining challenge or failure that deepened your commitment to ${theme}`,
    `Your future vision — how your undergraduate experience will connect ${theme} to your career in ${student.major || 'your field'}`,
  ];

  // Pitfalls to avoid based on profile
  const pitfalls = [];
  if (major.includes('computer') || major.includes('cs')) {
    pitfalls.push(
      'Do not write a generic "I fell in love with coding at age 10" essay — AOs read hundreds of these',
      'Avoid listing your projects without tying them to a deeper personal insight or impact'
    );
  }
  if (!hasLeadership(activities)) {
    pitfalls.push('Avoid framing activities as passive participation — reframe as initiative or growth');
  }
  if (student.country && ['China', 'South Korea', 'India'].includes(student.country)) {
    pitfalls.push(
      'Avoid essays that feel like translated versions of a common cultural narrative — write something only you could write',
      'Do not focus entirely on academic achievement — show personality, curiosity, and voice'
    );
  }

  // Why Major essay guidance
  const whyMajorTips = generateWhyMajorTips(major, theme, student);

  return {
    coreNarrative: theme,
    essayIdeas,
    whyMajorTips,
    pitfalls,
  };
}

function hasLeadership(activities) {
  return activities.some(a =>
    ['Founder / President', 'Captain / Editor', 'Officer / Vice President',
     'School President / Captain / Founder', 'Club Officer / Editor'].includes(a.type) ||
    ['Founder / President', 'Captain / Editor'].includes(a.leadership)
  );
}

function generateWhyMajorTips(major, theme, student) {
  if (major.includes('computer') || major.includes('cs')) {
    return `Connect a specific technical project or problem you solved to your deeper "why CS." Mention one unsolved problem in the world you want to work on. Avoid generic statements about AI changing the world.`;
  }
  if (major.includes('engineering')) {
    return `Reference a specific system, structure, or problem in the world that captivates you. Show you understand what engineers actually do, not just that you like math.`;
  }
  if (major.includes('business') || major.includes('finance')) {
    return `Ground your interest in a real company, market, or economic event you studied or were affected by. Schools want builders, not just students who "like money."`;
  }
  if (major.includes('biology') || major.includes('pre-med') || major.includes('medicine')) {
    return `A clinical or research experience should anchor your essay. Mention a specific patient interaction, experiment, or paper that shifted your thinking. Avoid "I want to help people" as your primary hook.`;
  }
  return `Be specific about what draws you to ${student.major || 'this field'} — reference an experience, a text, a person, or a question you can't stop thinking about. Generalities signal weak commitment.`;
}

module.exports = { essayStrategy };
