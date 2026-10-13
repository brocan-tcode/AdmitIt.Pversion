// src/rag/advisor.js
// Computed answers about the student's own result.
//
// These are NOT retrieval. "Why did I get this score" is arithmetic over the
// score breakdown, and "what are my chances at X" is the admissions model run
// against one school — neither has a document that could answer it, and
// retrieving a generic passage instead is how a chat ends up confidently
// off-topic. qa.js still handles everything that IS a knowledge question
// (deadlines, OPT, essay advice); this file handles questions about *them*.
//
// Every number here comes from the same functions that produced the dashboard,
// so the chat cannot quote a figure the report disagrees with.

const { COLLEGES } = require('../collegeData');
const { estimateForCollege } = require('../matchEngine');
const { scoreBreakdown, biggestLosses, quickestGains } = require('./scoreBreakdown');
const { MAJOR_LABELS } = require('./knowledge/reference');

const pct = n => `${n}%`;

// ─────────────────────────────────────────────────────────────
// "Why did I get this score?"
// ─────────────────────────────────────────────────────────────
function explainScore(ctx) {
  const bd = scoreBreakdown(ctx.profile, ctx.rigorIndex, ctx.ecScore);
  const lost = biggestLosses(bd, 3);
  const gains = quickestGains(bd, 3);

  const lines = [];
  lines.push(`Your profile score is ${bd.total}/100. Here is the full arithmetic — every point is one of seven components:`);

  lines.push(bd.components
    .map(c => `${c.label}: ${c.earned}/${c.max}${c.lost ? `  (−${c.lost})` : '  ✓ full marks'} — ${c.detail}`)
    .join('\n'));

  if (!lost.length) {
    lines.push('Nothing is missing — this is a maximal profile on every component the model scores.');
    return { answer: lines.join('\n\n'), kind: 'score' };
  }

  lines.push(`You lost the most on ${lost.map(c => `${c.label} (−${c.lost})`).join(', ')}. ` +
    `Those three alone account for ${lost.reduce((n, c) => n + c.lost, 0)} of the ${bd.max - bd.total} points not earned.`);

  if (gains.length) {
    lines.push('The fastest points available to you, largest first:\n' +
      gains.map(c => `• ${c.nextStep} → +${c.nextGain} points (${c.label})`).join('\n'));
  }

  lines.push('One caveat worth stating plainly: this score is a summary of the inputs you typed, not an admissions verdict. ' +
    'Essays, recommendations and interviews are not in it, and at the most selective schools those are what separate applicants who all score well here.');

  return { answer: lines.join('\n\n'), kind: 'score' };
}

// ─────────────────────────────────────────────────────────────
// "What are my chances at X?"  — plus whether another major is easier
// ─────────────────────────────────────────────────────────────

// Majors worth testing as alternatives. Keyed to MAJOR_LABELS so the suggestion
// is phrased the way the rest of the app phrases majors.
const ALT_MAJOR_KEYS = ['cs', 'engineering', 'business', 'economics', 'math',
  'physics', 'biology', 'chemistry', 'policy', 'communications', 'environmental'];

// Subjects that share enough coursework for a switch to be a real option rather
// than a different life. Without this the advice degenerates: the model happily
// reports that an informatics-olympiad CS applicant would have better odds in
// Environmental Science, which is true and useless. Related alternatives are
// offered as advice; unrelated ones are reported with an explicit caveat.
const MAJOR_FAMILIES = [
  ['cs', 'math', 'physics', 'engineering'],
  ['business', 'economics', 'policy', 'communications'],
  ['biology', 'chemistry', 'environmental', 'publichealth'],
];

function isRelated(a, b) {
  if (a === b) return true;
  return MAJOR_FAMILIES.some(f => f.includes(a) && f.includes(b));
}

function majorAlternativesAt(profile, college, currentKey) {
  const out = [];
  for (const key of ALT_MAJOR_KEYS) {
    if (key === currentKey) continue;
    const r = estimateForCollege({ ...profile, major: MAJOR_LABELS[key] }, college);
    if (!r || !r.majorOffered) continue;
    out.push({
      key, label: MAJOR_LABELS[key], probability: r.probability, tier: r.tier,
      related: isRelated(key, currentKey),
    });
  }
  // Related subjects first at equal odds — a switch inside the family is a real
  // option, a switch outside it is a different degree.
  return out.sort((a, b) =>
    (b.related - a.related) || (b.probability - a.probability));
}

// What single change moves the odds most at this school. Each lever is applied
// to a copy of the profile and re-run through the real model, so the quoted
// improvement is the model's own answer rather than a rule of thumb.
function leversAt(profile, college) {
  const base = estimateForCollege(profile, college);
  if (!base) return [];

  const sat = parseInt(profile.sat) || (parseInt(profile.act) || 0) * 44;
  const gpa = parseFloat(profile.gpa) || 0;
  const levers = [];

  if (sat && sat < 1570) {
    const target = Math.min(1600, sat + 60);
    levers.push({ label: `raise the SAT to ${target}`, profile: { ...profile, sat: String(target), act: '' } });
  } else if (!sat) {
    levers.push({ label: 'sit the SAT and score 1450', profile: { ...profile, sat: '1450' } });
  }
  if (gpa && gpa < 3.95) {
    const target = Math.min(4.0, gpa + 0.15);
    levers.push({ label: `lift the GPA to ${target.toFixed(2)}`, profile: { ...profile, gpa: target.toFixed(2) } });
  }
  if (!(profile.research && profile.research.length > 20)) {
    levers.push({
      label: 'add a mentored research project',
      profile: {
        ...profile,
        research: 'Mentored research project with a university supervisor, written up as a report',
        activities: [...(profile.activities || []), { type: 'Research Experience', leadership: 'Member / Participant', years: 1 }],
      },
    });
  }
  if (!(profile.awards && profile.awards.length > 20)) {
    levers.push({
      label: 'place in a national competition',
      profile: {
        ...profile,
        awards: 'National competition finalist placement recorded with selectivity context',
        activities: [...(profile.activities || []), { type: 'National Award / Competition', leadership: 'Member / Participant', years: 1 }],
      },
    });
  }

  return levers
    .map(l => {
      const r = estimateForCollege(l.profile, college);
      return { label: l.label, from: base.probability, to: r ? r.probability : base.probability };
    })
    .map(l => ({ ...l, delta: Math.round((l.to - l.from) * 10) / 10 }))
    .filter(l => l.delta > 0.1)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
}

function oddsAtSchool(ctx, college) {
  const profile = ctx.profile;
  const r = estimateForCollege(profile, college);
  if (!r) return null;

  const lines = [];
  const tierWord = { reach: 'a reach', match: 'a match', safety: 'a safety', excluded: 'a long shot' }[r.tier] || r.tier;

  if (!r.majorOffered) {
    lines.push(`${college.name} has no recorded ${ctx.majorLabel} programme, so it is not a realistic target for that major. ` +
      `Everything below assumes you would apply in a different subject.`);
  }

  lines.push(`At ${college.name} for ${ctx.majorLabel}, the model puts you at ${pct(r.probability)} — ${tierWord}. ` +
    `That is measured against the admitted band for your major, not the school's headline rate: ` +
    `${r.band?.gpa ? `GPA ${Number(r.band.gpa[0]).toFixed(2)}–${Number(r.band.gpa[1]).toFixed(2)}` : 'GPA n/a'}, ` +
    `${r.band?.sat ? `SAT ${r.band.sat[0]}–${r.band.sat[1]}` : 'SAT n/a'}` +
    `${r.band?.verified ? ' (published figures)' : ' (modelled from the school\'s own band)'}. ` +
    `Your academic position against that band scores ${r.academicStrength}/100.`);

  // Is a different major materially easier here? This is the question the
  // per-major bands were built to answer — Berkeley admits CS at 4.8% and
  // mathematics at 17.9%, which is a real strategic choice, not a technicality.
  const alts = majorAlternativesAt(profile, college, ctx.majorKey);
  const better = alts.filter(a => a.probability >= r.probability * 1.5 && a.probability - r.probability >= 3);
  if (better.length) {
    const top = better.slice(0, 3);
    const allUnrelated = top.every(a => !a.related);
    lines.push(`Worth knowing: ${ctx.majorLabel} is one of the harder routes into this school. ` +
      `On identical grades and scores the model gives you ` +
      top.map(a => `${pct(a.probability)} in ${a.label}`).join(', ') + '. ' +
      (allUnrelated
        ? `None of those is adjacent to ${ctx.majorLabel}, though — they are different degrees, not a tactical switch, ` +
          `and an application in a subject you have no record in is weaker than the odds suggest.`
        : `Only switch if the subject genuinely interests you — admissions readers can tell, and you would be studying it for four years — ` +
          `but if you were choosing between these anyway, the odds difference is real.`));
  } else if (alts.length) {
    lines.push(`Switching major would not rescue this one — the best alternative here is ${alts[0].label} at ${pct(alts[0].probability)}, ` +
      `which is not a meaningful improvement on ${pct(r.probability)}.`);
  }

  const levers = leversAt(profile, college);
  if (levers.length) {
    lines.push(`What actually moves this number, biggest effect first:\n` +
      levers.map(l => `• ${l.label} → ${pct(l.from)} becomes ${pct(l.to)} (+${l.delta})`).join('\n'));
  } else {
    lines.push(`There is no single change left that moves this materially — you are already at or near the top of every input the model scores. ` +
      `At this level the decision is made on essays, recommendations and institutional priorities, none of which this tool can see.`);
  }

  return { answer: lines.join('\n\n'), kind: 'odds', school: college.name };
}

// ─────────────────────────────────────────────────────────────
// "Should I switch major?" — across the whole list, not one school
// ─────────────────────────────────────────────────────────────
function compareMajors(ctx) {
  const profile = ctx.profile;
  const sample = ctx.schools.slice(0, 8).map(s => s.college);
  if (!sample.length) return null;

  const score = key => {
    const probs = sample
      .map(c => estimateForCollege({ ...profile, major: MAJOR_LABELS[key] }, c))
      .filter(r => r && r.majorOffered)
      .map(r => r.probability);
    if (!probs.length) return null;
    return {
      key, label: MAJOR_LABELS[key],
      mean: Math.round(probs.reduce((a, b) => a + b, 0) / probs.length * 10) / 10,
      best: Math.max(...probs),
      offered: probs.length,
    };
  };

  const current = score(ctx.majorKey);
  const others = ALT_MAJOR_KEYS.filter(k => k !== ctx.majorKey).map(score).filter(Boolean)
    .sort((a, b) => b.mean - a.mean);

  if (!current || !others.length) return null;

  const lines = [];
  lines.push(`Across the ${sample.length} schools currently on your list, ${ctx.majorLabel} gives you an average of ${pct(current.mean)} ` +
    `and a best case of ${pct(current.best)}.`);

  const easier = others.filter(o => o.mean >= current.mean * 1.4 && o.mean - current.mean >= 4);
  const easierRelated = easier.filter(o => isRelated(o.key, ctx.majorKey)).slice(0, 3);
  const easierOther   = easier.filter(o => !isRelated(o.key, ctx.majorKey)).slice(0, 2);

  if (easierRelated.length || easierOther.length) {
    if (easierRelated.length) {
      lines.push(`Subjects close enough to ${ctx.majorLabel} that switching is a genuine option, with your odds in each:\n` +
        easierRelated.map(o => `• ${o.label} — ${pct(o.mean)} average, best ${pct(o.best)}`).join('\n'));
    }
    if (easierOther.length) {
      lines.push(`${easierRelated.length ? 'Further afield' : 'The subjects with better odds for you'} — ` +
        `${easierOther.map(o => `${o.label} at ${pct(o.mean)}`).join(', ')} — ` +
        `but these are different degrees rather than a tactical switch, and applying in a field you have no record in ` +
        `is weaker than the raw odds suggest.`);
    }
    lines.push(`The underlying effect is real, not a quirk: competitive majors are admitted against their own band, so computer science ` +
      `at a school can be several times harder than that school's headline rate. But pick a subject you would actually want to study. ` +
      `A "why this major" essay written about a subject chosen for its admit rate reads exactly like one, and switching after enrolment ` +
      `is capped and competitive at most of these schools.`);
  } else {
    lines.push(`No subject on the list is meaningfully easier for you — ${ctx.majorLabel} is not what is holding your odds down. ` +
      `The constraint is the academic profile itself, so put the effort there rather than into changing subject.`);
  }

  return { answer: lines.join('\n\n'), kind: 'major' };
}

// ─────────────────────────────────────────────────────────────
// "Which schools should I apply to?" / "recommend schools"
// ─────────────────────────────────────────────────────────────
function recommendSchools(ctx) {
  if (!ctx.schools.length) return null;

  const group = (arr, title) => arr.length
    ? `${title}\n` + arr.map(s =>
        `• ${s.college.name} — ${pct(s.probability)}, fit ${s.fitScore}/100${s.majorFitLabel ? `, ${s.majorFitLabel}` : ''}`).join('\n')
    : null;

  const lines = [];
  lines.push(`From the ${ctx.schools.length} schools matched to your profile, here is how I would build the list:`);

  const blocks = [
    group([...ctx.safeties, ...ctx.matchSafeties].slice(0, 4), 'Apply to these first — they are the most likely offers:'),
    group([...ctx.matches, ...ctx.matchReaches].slice(0, 5), 'The realistic core of the list:'),
    group(ctx.reaches.slice(0, 4), 'Worth applying, but do not plan around them:'),
  ].filter(Boolean);
  lines.push(...blocks);

  if (!ctx.hasSafety) {
    lines.push(`A warning that matters more than any of the above: nothing on this list is a safety for you. ` +
      `Your best odds anywhere on it are ${pct(ctx.bestOdds)}. This database holds ${ctx.corpusSchoolCount || COLLEGES.length} selective ` +
      `and mid-selective universities and very few that admit most applicants, so the safe half of your list has to be built ` +
      `from outside this tool — regional public universities, less selective private colleges, and community-college transfer pathways.`);
  }

  return { answer: lines.join('\n\n'), kind: 'schools' };
}

// ─────────────────────────────────────────────────────────────
// "How do I get into a better school?"
// ─────────────────────────────────────────────────────────────
function improvementPlan(ctx) {
  const bd = scoreBreakdown(ctx.profile, ctx.rigorIndex, ctx.ecScore);
  const gains = quickestGains(bd, 4);

  // Measure each lever against the hardest school currently on the list, which
  // is where improvement actually changes the outcome.
  const target = ctx.reaches[0]?.college || ctx.matches[0]?.college || ctx.schools[0]?.college;
  const levers = target ? leversAt(ctx.profile, target) : [];

  const lines = [];
  lines.push(`You are at ${bd.total}/100 overall. To reach schools above your current band, these are the levers that actually move the model:`);

  if (gains.length) {
    lines.push('On the profile score:\n' + gains.map(c => `• ${c.nextStep} → +${c.nextGain} points (${c.label})`).join('\n'));
  }
  if (levers.length && target) {
    lines.push(`On your odds at ${target.name}, the hardest school currently on your list:\n` +
      levers.map(l => `• ${l.label} → ${pct(l.from)} becomes ${pct(l.to)}`).join('\n'));
  }

  lines.push(`Order matters. Test scores and senior-year course rigour both change inside one cycle and are the only levers with a deadline you can still hit. ` +
    `Research and competition results take months, so they pay off only if you start now. Essays and recommendations are not in this score at all, ` +
    `and at the selective end they are what decides between applicants whose numbers already look like yours.`);

  return { answer: lines.join('\n\n'), kind: 'improve' };
}

module.exports = {
  explainScore, oddsAtSchool, compareMajors, recommendSchools, improvementPlan,
  leversAt, majorAlternativesAt,
};
