// src/rag/chat.js
// The chat box behind /api/chat.
//
// Routing rule: a question about THIS STUDENT'S RESULT is computed, a question
// about how admissions works is retrieved. Getting that split wrong is what
// makes a no-model chatbot feel broken — ask "why is my score 57" of a pure
// retrieval system and it returns a generic passage about profile strength,
// which is both unhelpful and faintly insulting. The score is arithmetic; it
// should be answered as arithmetic.
//
// Computed answers come from advisor.js, which runs the same engine functions
// that produced the dashboard. Everything else falls through to qa.js.

const { runAnalysis, calculateRigorIndex, scoreEC } = require('../matchEngine');
const { COLLEGES } = require('../collegeData');
const { buildContext } = require('./context');
const { scoreBreakdown } = require('./scoreBreakdown');
const { answer: retrievalAnswer, namedSchools } = require('./qa');
const A = require('./advisor');

// Ordered — the first match wins, so the most specific patterns come first.
const INTENTS = [
  { kind: 'score',   re: /\b(why|how).{0,30}\b(score|rating|out of 100|\/100)\b|where did i lose|lost? (point|mark)|score.{0,20}(calculated|computed|work|come from)|break ?down my score|explain my score/i },
  { kind: 'major',   re: /\b(switch|change|swap|different|another|better|which|what)\b.{0,25}\bmajor\b|\bmajor\b.{0,25}\b(switch|change|easier|better odds)\b|should i (study|apply for|do)\b/i },
  { kind: 'improve', re: /how (do|can|could|should) i (improve|increase|boost|raise|get into|be more)|what (should|can) i (do|work on|improve|fix)|get into a better|improve my (chance|odds|profile)|make my (profile|application) stronger/i },
  { kind: 'schools', re: /which school|what school|recommend .{0,15}school|where should i apply|school list|best schools for me|suggest .{0,15}(school|college|universit)/i },
  { kind: 'odds',    re: /\b(chance|chances|odds|probability|likely|get in|getting in|admitted|accepted|realistic)\b/i },
];

function detectIntent(q) {
  for (const i of INTENTS) if (i.re.test(q)) return i.kind;
  return null;
}

// Resolve a school named in the question to its COLLEGES row.
function resolveCollege(question) {
  const docs = namedSchools(question);
  for (const d of docs) {
    const id = Number(String(d.id).replace('school-', ''));
    const c = COLLEGES.find(x => x.id === id);
    if (c) return c;
  }
  return null;
}

// Has the student actually filled in enough to have a result to talk about?
function hasProfile(profile) {
  return !!(profile && (profile.gpa || profile.sat || profile.act || profile.major));
}

/**
 * @param {string} question
 * @param {object} profile   the profile the report was run on
 * @param {object} engineData  the last /api/analyze response, if the client has one
 */
function chat(question, profile = {}, engineData = {}) {
  const q = String(question || '').trim();
  if (!q) return { success: false, error: 'No question provided.' };

  const intent = detectIntent(q);

  // Result-specific questions need a profile. Say so plainly instead of
  // answering about a blank student.
  const needsResult = ['score', 'odds', 'major', 'schools', 'improve'].includes(intent);
  if (needsResult && !hasProfile(profile)) {
    return {
      success: true, kind: 'no-profile',
      answer: 'I can answer that once you have run an analysis — fill in the Profile tab and press Analyze Profile, ' +
        'and I will be able to work from your actual numbers rather than guessing. ' +
        'In the meantime I can still answer general questions about how US admissions, applications, visas and essays work.',
      sources: [],
    };
  }

  if (!intent) return { ...retrievalAnswer(q, profile, engineData), kind: 'knowledge' };

  // Rebuild the same context the report was composed from.
  const analysis   = runAnalysis(profile);
  const rigorIndex = calculateRigorIndex(profile);
  const ecScore    = scoreEC(profile.activities);
  const profileScore = scoreBreakdown(profile, rigorIndex, ecScore).total;
  const ctx = buildContext(profile, analysis, { profileScore, rigorIndex, ecScore });

  let out = null;
  switch (intent) {
    case 'score':
      out = A.explainScore(ctx);
      break;

    case 'odds': {
      // "What are my chances at Michigan" → that school. "What are my chances"
      // with no school named → the list as a whole, which is the school
      // recommendation answer.
      const college = resolveCollege(q);
      out = college ? A.oddsAtSchool(ctx, college) : A.recommendSchools(ctx);
      break;
    }

    case 'major': {
      // A major question about one named school is answered at that school,
      // where the per-major bands are sharpest.
      const college = resolveCollege(q);
      out = college ? A.oddsAtSchool(ctx, college) : A.compareMajors(ctx);
      break;
    }

    case 'schools':
      out = A.recommendSchools(ctx);
      break;

    case 'improve':
      out = A.improvementPlan(ctx);
      break;
  }

  // If a computed answer could not be produced (no schools matched, say), fall
  // back to retrieval rather than returning nothing.
  if (!out) return { ...retrievalAnswer(q, profile, engineData), kind: 'knowledge' };

  return { success: true, answer: out.answer, kind: out.kind, school: out.school, sources: [] };
}

module.exports = { chat, detectIntent, resolveCollege };
