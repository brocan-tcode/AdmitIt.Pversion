// src/rag/ragEngine.js
// Top-level entry point: profile in, full report out, zero network calls.
//
// Drop-in replacement for the Claude call in server.js — the returned object
// has exactly the same shape as the old /api/analyze response, so
// public/index.html and src/pdfExport.js need no changes at all.

const { runAnalysis, calculateRigorIndex, scoreEC, normalizeProfile } = require('../matchEngine');
const { index } = require('./corpus');
const { buildContext } = require('./context');
const { scoreBreakdown } = require('./scoreBreakdown');
const C = require('./composer');

/**
 * Overall profile score, 0–100.
 *
 * The weights below sum to exactly 100 for a maximal profile:
 *   GPA 25 + test 22 + English 10 + rigour 16 + activities 14
 *   + research 6 + awards 7 = 100
 *
 * They previously summed to 90, so the "Overall Profile" bar in the UI could
 * never fill and the `elite` strength band at 85 actually meant 94% of what was
 * achievable. The band thresholds in src/rag/context.js are calibrated against
 * this scale — change one and re-check the other.
 */
// The weights and thresholds themselves now live in src/rag/scoreBreakdown.js,
// which returns the same total alongside a per-component decomposition. The
// chat explains where points were lost by reading that decomposition, so the
// explanation and the number are guaranteed to agree.
function computeProfileScore(profile, rigorIndex, ecScore) {
  return scoreBreakdown(profile, rigorIndex, ecScore).total;
}

/**
 * @param {object} profile  the raw form body
 * @param {object} opts     { now } — injectable clock for deterministic tests
 */
function analyze(rawProfile = {}, opts = {}) {
  const t0 = Date.now();
  const profile = normalizeProfile(rawProfile);

  const analysis   = runAnalysis(profile);
  const rigorIndex = calculateRigorIndex(profile);
  const ecScore    = scoreEC(profile.activities);
  const profileScore = computeProfileScore(profile, rigorIndex, ecScore);

  const ctx = buildContext(
    profile,
    analysis,
    { profileScore, rigorIndex, ecScore },
    opts.now || new Date()
  );

  const sections = {
    profileStrength: C.composeProfileStrength(index, ctx),
    aiStrategy:      C.composeStrategy(index, ctx),
    gapAnalysis:     C.composeGapAnalysis(index, ctx),
    essayStrategy:   C.composeEssayStrategy(index, ctx),
    appStrategy:     C.composeAppStrategy(index, ctx),
    timeline:        C.composeTimeline(index, ctx),
    careerOutlook:   C.composeCareerOutlook(index, ctx),
    visaInfo:        C.composeVisaInfo(index, ctx),
  };

  // Flatten citations so the caller can see which documents produced the report.
  const retrievedDocs = [];
  const seen = new Set();
  for (const [section, out] of Object.entries(sections)) {
    for (const s of out.sources) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      retrievedDocs.push({ ...s, section });
    }
  }

  return {
    success: true,
    profile,
    profileScore,
    rigorIndex: Math.round(rigorIndex * 10) / 10,
    ecScore:    Math.round(ecScore * 10) / 10,

    profileStrength: sections.profileStrength.text,
    aiStrategy:      sections.aiStrategy.text,
    gapAnalysis:     sections.gapAnalysis.text,
    essayStrategy:   sections.essayStrategy.text,
    appStrategy:     sections.appStrategy.text,
    timeline:        sections.timeline.text,
    careerOutlook:   sections.careerOutlook.text,
    visaInfo:        sections.visaInfo.text,

    schools:      analysis.schools,
    engineGaps:   analysis.gaps,
    activityPlan: analysis.activityPlan,
    essaySignals: analysis.essay,
    roiData:      analysis.roiData,
    careers:      analysis.careers,

    // RAG provenance — not rendered by the existing UI, available for debugging
    // and for anyone who wants to show sources.
    rag: {
      mode: 'local-retrieval',
      corpusSize: index.size,
      corpus: index.stats().byTopic,
      documentsUsed: retrievedDocs.length,
      documents: retrievedDocs,
      elapsedMs: Date.now() - t0,
    },
  };
}

module.exports = { analyze, computeProfileScore, index };
