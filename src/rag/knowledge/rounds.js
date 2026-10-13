// src/rag/knowledge/rounds.js
// Knowledge for the "APPLICATION STRATEGY" section — application rounds,
// their mechanics, and when each is worth using.

const DOCS = [
  {
    id: 'round-ed-boost',
    topic: 'round', round: 'ED',
    title: 'What Early Decision actually buys you',
    tags: ['ed', 'early', 'decision', 'binding', 'boost', 'odds', 'commitment'],
    text: 'Early Decision is binding: one school, and you withdraw every other application if admitted. The admit-rate advantage is real but overstated — much of the published gap comes from recruited athletes and legacy applicants sitting in the ED pool. For an unhooked international applicant the genuine boost is roughly equivalent to a modest bump in academic strength, which is meaningful at a school where you are already plausible and worthless at one where you are not.',
  },
  {
    id: 'round-ed-financial',
    topic: 'round', round: 'ED',
    title: 'The financial risk of binding Early Decision',
    tags: ['ed', 'binding', 'financial', 'aid', 'risk', 'international', 'release'],
    text: 'ED commits you before you can compare aid offers. You may be released from the agreement if the package is genuinely unaffordable, but you must then withdraw and reapply elsewhere in a compressed window. For an international applicant needing substantial aid, ED at a need-aware school is the highest-variance move available — only take it where the aid is need-met or the cost is affordable without aid.',
  },
  {
    id: 'round-rea',
    topic: 'round', round: 'REA',
    title: 'Restrictive Early Action mechanics',
    tags: ['rea', 'restrictive', 'early', 'action', 'single', 'choice', 'harvard', 'yale', 'princeton', 'stanford'],
    text: 'Restrictive or Single-Choice Early Action is non-binding but blocks you from applying early to other private universities. Harvard, Yale, Princeton, and Stanford all use it. Public universities and international universities are generally exempt from the restriction, so an REA application can usually sit alongside early applications to state flagships — verify each school\'s exact wording, because the exemptions differ.',
  },
  {
    id: 'round-ea',
    topic: 'round', round: 'EA',
    title: 'Early Action is nearly free optionality',
    tags: ['ea', 'early', 'action', 'nonbinding', 'merit', 'scholarship', 'november'],
    text: 'Unrestricted Early Action is non-binding and carries no downside beyond the earlier deadline. It typically produces a December decision, often puts you in a larger merit-scholarship pool, and resolves at least one outcome before the January workload. Apply EA everywhere it is offered and nothing restricts you.',
  },
  {
    id: 'round-rd',
    topic: 'round', round: 'RD',
    title: 'Regular Decision and the January cliff',
    tags: ['rd', 'regular', 'decision', 'january', 'deadline', 'standard'],
    text: 'Regular Decision deadlines cluster between January 1 and January 15 with decisions in late March. The practical risk is workload: most students submit eight to twelve RD applications in the same two weeks, immediately after exams. Draft the supplements in November even for RD schools.',
  },
  {
    id: 'round-uc',
    topic: 'round', round: 'UC',
    title: 'The UC system runs on its own rules',
    tags: ['uc', 'california', 'berkeley', 'ucla', 'system', 'pig', 'november', 'application'],
    text: 'UC applications open August 1 and must be submitted between November 1 and November 30 — there is no early round and no extension. One application covers every campus for a per-campus fee. There are no interviews, no recommendation letters, and no Common App essay: instead you answer four Personal Insight Questions of 350 words each. The UCs do not consider demonstrated interest and do not superscore in the way private universities do.',
  },
  {
    id: 'round-uc-intl',
    topic: 'round', round: 'UC',
    title: 'What international applicants should know about the UCs',
    tags: ['uc', 'international', 'aid', 'nonresident', 'cost', 'california'],
    text: 'UC campuses offer essentially no need-based aid to international students and charge full non-resident tuition, so budget for the full sticker price. They do admit international students in significant numbers and the application is unusually efficient — one form, one set of essays, multiple campuses — which makes the UCs a high-value block on a list provided the cost is workable.',
  },
  {
    id: 'round-questbridge',
    topic: 'round', round: 'Coalition',
    title: 'QuestBridge and the Coalition platform',
    tags: ['questbridge', 'coalition', 'lowincome', 'match', 'scholarship', 'us'],
    text: 'QuestBridge National College Match is restricted to US citizens and permanent residents, so international applicants are not eligible regardless of financial need. The Coalition application, now hosted on Scoir, is accepted by a subset of schools and offers no admissions advantage over the Common App — use it only if a school on your list requires it.',
  },
  {
    id: 'round-deferral',
    topic: 'round', round: 'RD',
    title: 'What a deferral means and what to do',
    tags: ['deferral', 'defer', 'loci', 'waitlist', 'january', 'update'],
    text: 'A deferral moves your early application into the regular pool and is not a soft rejection — admit rates for deferred applicants at most schools sit in the mid single digits but are not zero. Send a one-page letter of continued interest in mid-January with new grades and one genuinely new item. Do not send more than one.',
  },
  {
    id: 'round-waitlist',
    topic: 'round', round: 'RD',
    title: 'Waitlist reality for international applicants',
    tags: ['waitlist', 'yield', 'may', 'deposit', 'international', 'aid'],
    text: 'Waitlists move after the May 1 deposit deadline and almost always without financial aid attached, which makes them structurally difficult for international students. Accept a place on the waitlist only if you could pay full cost, and place your enrolment deposit elsewhere regardless — the deposit is the price of not being stranded.',
  },
  {
    id: 'round-strategy-portfolio',
    topic: 'round', round: 'RD',
    title: 'Balancing the list across rounds',
    tags: ['portfolio', 'balance', 'list', 'reach', 'match', 'safety', 'strategy'],
    text: 'A workable list is roughly four reaches, four to six matches, and two to three genuine safeties, with the early rounds spent where the boost is real. Spending an ED on a school where you are already a strong match wastes the lever; spending it on a school where you are far below the band wastes the application.',
  },
  {
    id: 'round-deadlines-intl',
    topic: 'round', round: 'RD',
    title: 'Deadline mechanics for international submissions',
    tags: ['deadline', 'timezone', 'transcript', 'documents', 'submission', 'international'],
    text: 'Common App deadlines are 11:59pm local time at the applicant\'s location, but school-side documents — transcripts, counsellor forms, English scores — travel slowly from non-US schools and are the usual cause of an incomplete file. Send test scores at least three weeks ahead and confirm receipt in each portal rather than assuming delivery.',
  },
];

module.exports = { DOCS };
