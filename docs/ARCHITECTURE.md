# College Consultant Assistant — local RAG build

Every section of the report is composed from a local document corpus instead of
a Claude API call, so this app needs **no API key, no network access, and costs
nothing per run**.

The original Claude API build (`server.js`) was deleted on 2026-10-12 ahead of
publishing: it read `ANTHROPIC_API_KEY`, and a public deployment should have no
code path that can reach a key. The Anthropic SDK is no longer a dependency.

```bash
npm start             # the app          (server-rag.js, port 3000)
npm test              # full test suite
npm run audit:data    # accuracy audit against published figures
npm run build:deploy  # clean, secret-free folder for hosting
```

## How it works

```
profile form
   │
   ├─► matchEngine.js ────────► 20 matched schools, probabilities, ROI, gaps
   │                            (unchanged — this was always deterministic)
   │
   ├─► rag/context.js ───────► normalised profile + derived signals + {{vars}}
   │
   ├─► rag/retriever.js ─────► BM25 over 266 documents
   │        ▲
   │   rag/corpus.js
   │        ├── rag/knowledge/*.js   164 curated admissions documents
   │        └── collegeData.js       102 schools → one document each
   │
   └─► rag/composer.js ──────► the 8 report sections
```

**Retrieval** is Okapi BM25 over a stemmed inverted index with synonym
expansion, plus metadata boosting for the student's major, strength band, and
country. Not vector search — every embedding model is an API call, and a local
one would mean a large dependency for a 255-document corpus where lexical
retrieval performs well. Queries run in single-digit milliseconds.

**Generation** is deterministic template composition over retrieved passages,
not a language model. Each section runs a prioritised list of queries built
from the student's actual gaps, takes one document per query, fills
`{{placeholders}}` from the profile, and assembles the result. Consequences
worth knowing:

- The same profile always produces the same report.
- Every sentence traces to a document id — see `rag.documents` in the response.
- The system cannot answer anything outside its corpus, and says so rather than
  improvising.

## The chat box

A floating chat answers questions about the report the student just got. It
needs no API key, like the rest of the build.

The routing rule is the whole design: **a question about the student's own
result is computed, a question about how admissions works is retrieved.** Ask a
pure retrieval system "why is my score 57" and it returns a generic passage
about profile strength — unhelpful, and faintly insulting when the answer is
arithmetic the app already did.

| Question | Handled by | What it does |
|---|---|---|
| "Why did I get this score?" | computed | Prints all seven score components with points lost, the three biggest losses, and the cheapest gains |
| "What are my chances at Cornell?" | computed | Runs the real model for that school, shows the per-major admitted band, tests whether another major is easier there, and lists which single change moves the number most |
| "Should I switch my major?" | computed | Re-runs the student's whole list under every other major and compares |
| "Which schools should I apply to?" | computed | Groups their own matched list into apply-first / realistic core / long shots |
| "How do I get into a better school?" | computed | Score levers plus measured odds changes at the hardest school on their list |
| anything else | retrieved | Falls through to `qa.js` and the knowledge corpus |

Two properties make the computed answers trustworthy:

- **Numbers cannot drift from the report.** `computeProfileScore` is now the sum
  of `scoreBreakdown()`, so the explanation and the dashboard number come from
  one place. Odds come from the same `estimateForCollege` the school list uses.
  `npm test` asserts both.
- **Improvement figures are measured, not asserted.** Each lever ("raise the SAT
  to 1510") is applied to a copy of the profile and re-run through the model, so
  "4.7% becomes 6.9%" is the model's own answer rather than a rule of thumb.

Major-switch advice prefers *adjacent* subjects (`MAJOR_FAMILIES` in
`advisor.js`). Without that the model cheerfully tells an informatics-olympiad CS
applicant that Environmental Science has better odds — true, and useless.
Unrelated suggestions still appear when they are the only ones, but carry an
explicit "these are different degrees, not a tactical switch" caveat.

The Improve tab's existing ask panel posts to the same endpoint, so both ask
surfaces behave identically.

## Endpoints

| Endpoint | Notes |
|---|---|
| `POST /api/analyze` | Identical response shape to the API build, plus a `rag` block with corpus stats and the documents used |
| `POST /api/chat` | The chat box. Computes answers about the student's own result, falls through to retrieval otherwise. Returns `kind` so the UI can label the source |
| `POST /api/improve` | Retrieval Q&A. Routes the question to likely topics, resolves any school named in it, returns an answer with its sources |
| `POST /api/export-pdf` | Unchanged |
| `GET /api/rag/search?q=...&topic=...&k=...` | Inspect raw retrieval |
| `GET /api/rag/stats` | Corpus size and topic breakdown |

## Editing the knowledge base

Documents live in `src/rag/knowledge/`, grouped by the section they feed:
`strategy`, `gaps`, `essays`, `rounds`, `timeline`, `careers`, `visa`,
`countries`, `profile`. Each is:

```js
{
  id:    'strat-sat-retake-hard',      // unique; duplicates throw at startup
  topic: 'strategy',                    // which section can retrieve it
  title: 'Retake the SAT to clear the target band',   // becomes the bullet heading
  tags:  ['sat', 'test', 'retake'],     // weighted 3× in the index
  cond:  ctx => ctx.satEq < ctx.reachSat25,           // eligibility gate
  text:  'Retake the SAT and target {{reachSatTarget}}+ ...',
}
```

`cond` decides whether a document *can* be used for this student; BM25 decides
whether it *is* used. Placeholders are filled from `ctx.vars` in
`rag/context.js` — add a new one there before using it in text.

School documents are generated from `src/collegeData.js` at startup, so adding
a school to that file automatically makes it retrievable.

## Output formats are load-bearing

`public/index.html` and `src/pdfExport.js` parse these sections with
`parseBullets`, `parseTimeline`, `parseSalaries`, and `parseAppStrategy`.
The composer emits exactly what those expect:

- bullets: `- Heading` on one line, body on the next
- timeline: `Month YYYY:` header, then `- task` lines (colons inside tasks are
  converted to dashes, or the month regex would split on them)
- salaries: `- Job Title: $120,000 entry, rising to ...`
- rounds: `Early Decision: School — reasoning`

`npm test` checks all four parse correctly across five profiles, and that no
`{{placeholder}}` leaks into the output.

## Major-aware school matching

The school list responds to the intended major. Previously it barely did — a
Nursing applicant and a CS applicant got ~85% the same schools, including
Amherst and Pomona for nursing, which have no nursing programme.

`src/majorFit.js` reads two fields that were under-used in `collegeData.js`:

- **`bestMajors`** — the school's flagship programmes.
- **`majorDifficulty`** — a per-major admission multiplier that the engine
  ignored completely. `<1` means the major is harder than the school's headline
  rate (UPenn `business: 0.7` = Wharton), `>1` means easier (MIT `business: 1.1`).

From these it derives, per school and major:

| Field | Meaning |
|---|---|
| `evidence` | 3 = flagship, 2 = named strength, 1 = tracked only, 0 = no signal |
| `offered` | whether a programme credibly exists |
| `majorFit` | 0–100 alignment, adjusted by research intensity and career pipeline |
| `difficulty` | the multiplier now applied to the admission probability |

**Availability** decides what absence from the data means:

- `universal` (CS, biology, economics, maths, physics, policy) — every
  university teaches it, so absence means "not a flagship". Schools without
  evidence still appear, ranked below those with it.
- `common` (engineering, business, communications, environmental) — genuinely
  absent at small liberal arts colleges, so these need either evidence or
  8,000+ students.
- `specialized` (nursing, architecture, music, public health, international) —
  never assumed. **Schools with no recorded programme are excluded outright**,
  even large ones, because Berkeley has no nursing school. Tiers come back short
  rather than padded; filler is only permitted if the honest list falls below
  six schools.

Selection changed too: reach schools were previously sorted by selectivity
alone, which returned the same elite names for every major. They are now ranked
`majorFit × 0.55 + selectivity × 0.45`, and `fitScore` is major-dominant.

The UI shows this on each school card as a badge (`flagship programme`,
`named strength`, `offered, not a flagship`, or a red `may be offered — verify
with the department`), with the fit score and the major-specific admission
difficulty in the Majors tab.

Results for a 3.9 GPA / 1500 SAT applicant:

| Major | Top matches |
|---|---|
| Computer Science | Caltech, MIT, Columbia, Stanford |
| Business | Stanford, UPenn (Wharton), UC Berkeley (Haas), WashU |
| Nursing | UPenn, Villanova, Case Western, Rutgers, Pitt |
| Music | Carnegie Mellon, Vassar, Miami, UCLA, Rochester |

`npm test` asserts that no school appears twice and that specialized lists are
verified. Divergence is asserted by the major's `availability` class, not by
intuition: `specialized` majors (nursing, music, architecture) must overlap CS by
under 60%, while `universal` and `common` majors (mathematics, mechanical
engineering, business) only have to *move* — they legitimately share the big
public universities, which are genuinely strong in all of them.

## List size does not fall as the student gets weaker

Each of the five tiers takes four schools, but the quota is no longer hard. A
student with no safety band used to lose those slots outright, so the list shrank
exactly as the student's need for options grew:

| Profile | Before | After |
|---|---|---|
| 4.0 / 1580 | 20 schools | 20 schools |
| 3.6 / 1350 | 12, no safeties | 16 |
| 3.1 / 1120 | 9 | 16 |
| 2.8 / 1020 | **6, four of them reaches** | 16 |

Empty tiers release their slots to the tiers that do have schools, most
accessible first, up to a floor of 16. Two constraints make this safe:

- **It tops up short lists; it does not pad adequate ones.** Expanding every list
  to 20 pushed Business/CS overlap from 56% to 75%, because the extra picks come
  from the big publics that are strong in everything. 16 is a floor, not a target.
- **Overflow draws only on verified programmes**, ordered by fit and odds
  together (`fitScore × 0.5 + probability × 0.5`). Ordering by odds alone is the
  obvious choice and is wrong — odds do not depend on the major, so every major's
  overflow came back as the same list of accessible schools.

The sub-3% exclusion in `classifyTier` was not the bottleneck: 37–42 schools
survive it even for a 2.8/1020 applicant. The quota was.


## What is in collegeData, and what was wrong with it

`src/collegeData.js` holds 102 schools with 25 fields each: identity (name,
location, type, rank, website), admissions (`acceptanceRate`,
`intlAcceptanceRate`, `gpaRange`, `satRange`, `actRange`, `avgGPA`), programmes
(`bestMajors`, `majorDifficulty`), cost and outcomes (`tuitionOutOfState`,
`medianSalary`, `gradRate`, `studentBody`, `financialAidIntl`), and soft data
(`fitMetrics`, `visaStats`, `tags`, `whyGood`, `description`,
`recommendedStrategy`). Every field is populated for every school.

Audited against published 2025-26 figures (`node src/data/auditData.js`):

| Problem | Status |
|---|---|
| Boston University listed at 37.1%, actually 11.1% | fixed |
| NYU listed at 21%, actually 7.7% | fixed |
| Purdue listed at 67.3% / 55% intl, actually 43.4% / 22.5% | fixed |
| UIUC, Michigan State, CMU, Georgia Tech, UCLA, Penn State, ASU, UPenn drift | fixed |
| Cornell, Johns Hopkins, University of Chicago absent entirely | added |
| Lehigh University present twice (ids 53, 89) | duplicate row removed |
| 20 schools flagged need-blind for internationals; only ~7 are | fixed — now 9 |
| `rank` unreliable — 46 schools claim a top-25 rank | still open |
| `housing`, `fees`, `employmentRate` absent, so roiEngine defaults all 102 | still open |
| Only 6 of 102 schools admit >=70% — no options for sub-3.3 students | inherent limit, surfaced in the report |
| Cheapest school is $46,658/yr, so a sub-$40k budget matched nothing | fixed — see below |

Mean absolute drift is now 0.3 points across the 20 audited schools.

## Per-major admission data

`src/data/majorAdmissions.js`. School-wide acceptance rates are the wrong
denominator wherever a university admits directly into a major:

| School | School-wide | By major |
|---|---|---|
| Illinois | 36.6% | CS 7.2% |
| Cornell | 8.8% | Engineering 5.2%, CALS 16.7% |
| Carnegie Mellon | 11.1% | School of CS ~4%, Dietrich ~24% |
| Washington | ~43% | CS direct admit **2% for international applicants** |
| Purdue | 43.4% | Engineering 34.7%, Education 70.5% |

Ten schools carry `VERIFIED` published data including per-major GPA and SAT
bands. Every other school gets a band DERIVED at runtime from its own
`majorDifficulty` multiplier — a model, not a measurement, and labelled as such
in the UI ("Modelled estimate from school band" vs "Published by-major data").

The student is now scored against their major's band rather than the school's,
and major competitiveness enters the probability exactly once, through that
band. Same 3.9 GPA / 1500 SAT applicant: Illinois CS 6.5%, Illinois Political
Science 45.6%.


### Coverage, honestly

Every per-major band now has a traceable source. **None comes from a hand-set
number.** `node src/data/auditData.js` reports the split over the 1,386
school-major combinations the app can actually surface:

| Provenance | Share | What it means |
|---|---|---|
| published | 4.5% | real by-major figures from 13 schools |
| structural | 45.9% | school admits university-wide, or the major sits in Arts & Sciences, so the school band **is** the right band |
| modelled | 49.6% | separately gated division with no published figures — estimated from measured ratios |
| **sourced** | **50.4%** | published + structural |

**90% published coverage is not reachable, and not because of effort.** Most US
universities do not publish admit rates by major. Wisconsin and Maryland were
checked directly and publish nothing; industry write-ups on nursing state
outright that per-programme rates are "estimates derived from cohort size"
because schools do not release them. The gated divisions — CS, engineering,
business, nursing, architecture, music — are simultaneously where the data is
scarcest and where it matters most.

What moved instead is the quality floor: an unpublished school used to fall back
to a hand-set guess, and now falls back to a ratio measured across the schools
that do publish.

Coverage as of 2026-08-06: **13 schools** carry published by-major data — UIUC,
Purdue, Washington, Cornell, Carnegie Mellon, Georgia Tech, Penn, NYU, Michigan,
UT Austin, UCLA and Berkeley. UCLA publishes the most detailed table in US
admissions and its Nursing Prelicensure rate of **0.5% against a 9% school rate**
is the widest major-level gap in the file.

Wisconsin and Maryland were investigated and do **not** publish by-major rates,
so no figures were invented for them.

For the other 90 schools, `EMPIRICAL_MAJOR_RATIOS` supplies the fallback —
each major's published rate divided by its school's overall rate, averaged
across the 12 verified schools:

| Major | Ratio | Meaning |
|---|---|---|
| CS | 0.53x | roughly half the school's headline rate |
| Engineering | 0.70x | |
| Business | 0.62x | |
| Nursing | 0.70x | huge spread: UCLA 0.06x, Penn 1.48x |
| Biology | 1.35x | life sciences admit *above* the school rate |
| Humanities | 1.30–1.50x | |

This replaced a flat 1.0 multiplier, which applied to **99 of 102 schools for
nursing** and 97 for music and architecture — so the model previously did no
major differentiation at all for exactly the majors where it matters most. A
### majorDifficulty is no longer used as a number

The numeric values in collegeData's `majorDifficulty` were hand-set with no
source — UPenn carried `business: 0.7`, implying Wharton is 30% harder than Penn
overall, when the published figures are 4.5% against 5.4%, or about 17%. Those
numbers silently drove every probability in the report.

`majorDifficultyMultiplier` now returns only:

- **1.0** when the band is structural — the school's own admit rate already *is*
  this major's admit rate
- **the measured empirical ratio** when the division is separately gated

Published schools never reach it; `majorAdmissionBand` returns their figures
directly. `majorDifficulty` stays in collegeData and is still read by
`majorEvidence`, but only for the *presence* of a key, as a signal that the
school treats the major as notable. Its numbers are ignored.

## Fit score

Fit is a weighted composite of four independently scored 0-100 components,
shown as a breakdown in the Culture and Fit tab so the number is explainable:

| Component | Weight | Why |
|---|---|---|
| Major strength | 40% | the one thing you cannot change after enrolling |
| Chance of admission | 25% | saturating, so a 95% safety does not outrank a 60% match |
| Affordability | 20% | cost against the stated budget |
| Location & campus | 15% | region, size, satisfaction, graduation rate |


## Cost of attendance and ROI

`src/data/costModel.js`. `collegeData` has never carried `housing`, `fees` or
`employmentRate` for any school, so `roiEngine` defaulted $18,000 / $2,000 / 85%
for all 102 — meaning cost of attendance was identical for a Manhattan campus
and a rural one, and ROI was a function of tuition and median salary alone.

Room and board is now modelled from institution type and a state cost-of-living
index, anchored on published AY2025-26 national averages (public four-year
$14,034, private nonprofit $15,958) and calibrated so the extremes reproduce the
published state figures — New York public lands at $17,402 against a published
$17,353. Mandatory fees split by sector, since publics bill them separately far
more often. Outcome rate is derived from each school's own graduation rate,
which is real per-school data, over a deliberately narrow 72–96% range.

Everything except tuition is an estimate and is labelled as one in the Financial
tab. Effect on ROI across the database:

| | before | after |
|---|---|---|
| Room and board | $18,000 everywhere | $12,350 (Purdue) – $19,790 (Columbia) |
| Employment rate | 85% everywhere | 78% – 92%, varies per school |
| ROI grades | tuition-driven only | Excellent 30 / Good 66 / Fair 6 |
| Payback period | narrow | 3 years (MIT) – 9 years (Gonzaga) |

The budget filter, the affordability component of the fit score, and the
"cheapest option" messaging all read from this model now rather than from a
hardcoded `+18000`.


## Measured outcome data (College Scorecard)

`fitMetrics` and `medianSalary` were the last two hand-set fields driving
scoring. Both are now sourced from the **US Department of Education College
Scorecard** — the dataset the government publishes for its own college search.

`node src/data/buildOutcomes.js <scorecard-records.json>` regenerates
`src/data/outcomes.js`; nothing in it is written by hand.

### medianSalary

The hand-set values had **20 distinct values across 76 schools** and a mean
absolute error of **$9,448** against the measured figures — 11 schools off by
more than $20,000, MIT understated by $31,372, Brown overstated by $31,093.
ROI now uses real median earnings, and the UI label changed from "Median
Starting Salary" to "Median Earnings, 10 yrs after entry", which is what the
figure actually measures.

### fitMetrics

Four of the five now come from measured data; the fifth is excluded from
scoring rather than left as an unsourced number in a formula.

| Metric | Source | Distinct values (was ~15) |
|---|---|---|
| satisfaction | first-year retention rate | 40 |
| research | Carnegie classification | 4 — categorical by nature |
| diversity | Simpson index over enrolment demographics | 71 |
| pipeline | median-earnings percentile | 100 |
| **vibe** | **none exists** | **removed from all scoring** |

Campus culture has no measurable proxy in any public dataset. It is still shown
in the UI as an editorial descriptor, explicitly labelled, and `npm test`
asserts it never appears in `preferenceScore`.

**Research is deliberately compressed.** Carnegie is a four-level categorical
(67 R1, 6 R2, 2 R3, 27 baccalaureate) and it measures institutional research
*volume*, not undergraduate research *access*. Mapping it across a wide range
put every liberal arts college at the floor and every R1 at the ceiling, which
handed all 27 liberal arts colleges a flat ~4-point majorFit penalty for their
institutional type alone — while Harvey Mudd graduates out-earn most R1s in this
database. The mapping now spans 6.5–9.0, and the continuous measured metric
(earnings percentile) does the finer differentiation. Tests assert the ordering
holds and the spread stays proportionate.

### Coverage and a matching hazard

**All 102 schools are matched** — 63 exact, 38 via the curated alias table, 1 by
prefix. Every school has measured earnings, retention, Carnegie class and
demographics; the "est." fallback path remains in the code but is now unused.

Name matching is the dangerous part. Substring matching silently bound **Brown
University to John Brown University** in Arkansas, importing a different
school's earnings. Matching is now prefix-only with a curated alias table, and
`npm test` asserts no school resolves to an institution that merely contains its
name.


### Known limitation: the major salary adjustment

`MAJOR_SALARY_MULTIPLIERS` is the last unsourced number in the ROI path. It was
calibrated against a hand-set *starting* salary; the base is now measured median
earnings ten years after entry across all majors, which already reflects the
school's major mix. Applying the full ratio double-counted it (MIT Computer
Science came out at $207,889), so it is now applied as `sqrt(ratio)` — an
explicit approximation, documented in `roiEngine.js`, not a tuning knob.

The proper fix is per-major earnings, which College Scorecard does publish at
CIP-4 level: `latest.programs.cip_4_digit.earnings.highest.2_yr.overall_median_earnings`
returns $63,749 for Purdue Computer Science. Pulling that for the 102 schools
would remove the last estimate from the ROI path.


## Retrieval quality is measured, not asserted

`node src/rag/evalRetrieval.js` scores three things against a hand-written gold
set of 26 questions ("which document *should* answer this", so it can fail):

| | before | now |
|---|---|---|
| recall@5 | 84.6% | **88.5%** |
| mean reciprocal rank | 0.665 | **0.718** |
| paraphrase agreement | 85.7% | **100%** |
| corpus coverage | 78.0% | **85.4%** |
| dead content (eligible but unselectable) | 36 docs | **19 docs** |

`npm test` asserts each of these, with thresholds set just below the measured
values so a regression fails the build.

### Bugs the measurement found

- **The stemmer broke word matching.** `"deferred"` stemmed to `deferr` while
  the tag `defer` stemmed to `defer`, so a question about deferral could never
  reach its own answer. Doubled final consonants now collapse after `-ed`/`-ing`.
- **The `-ly` rule corrupted ordinary words.** `apply` → `app` while `applying`
  → `apply`; `early` → `ear`; `family` → `fami`. Adverbs carry little topical
  signal, so the rule was removed — measured cost: zero.
- **Filler verbs outranked domain terms.** Stop-listing ran on the raw word, so
  `"happens"` survived a list containing `happen`, and being rare in a domain
  corpus it scored as highly informative. Stop-listing now runs on the stem too.
- **Phrases were invisible.** Unigrams cannot distinguish "personal statement"
  from a document merely containing both words apart. Bigrams are now indexed.
- **Length normalisation over-rewarded short documents.** Timeline tasks average
  48 indexed tokens against 84 for career documents; at `b = 0.75` they
  outranked the correct answer. Swept against the gold set and set to `b = 0.30`.
- **The Q&A path swamped the question with profile terms.** `qa.js` appended the
  student's major, country and strength band to the query string, so "what
  happens if I get deferred" — one meaningful token — returned CS portfolio
  advice. Personalisation now happens through `boost`, which scales documents
  already matching the question, instead of competing with it.
- **22% of the corpus could never appear in a report.** Sections take one
  document per query up to a fixed cap, so always-eligible process advice at the
  tail of the priority list was structurally unselectable. `fillRemaining()`
  reserves slots and rotates tail content deterministically per student, so the
  corpus is covered across the population rather than within one report.

### What this is, honestly

It is **retrieval plus deterministic template composition**, not RAG in the
sense of a model synthesising retrieved context. That was the right call given
the no-API constraint — it buys determinism, traceability and zero cost — but
the "G" is templating, and calling it RAG oversells it. The remaining weakness
is inherent to lexical matching: there is no semantic similarity, so genuinely
novel phrasings can still miss. The gold set is the guard against that.

## Accuracy audit

`node src/data/auditData.js` checks the model against published data on five
axes. Current results:

- **Rate drift** — mean 0.3 points across 20 schools, none 8+ points stale.
- **Calibration** — a student at a school's median scores a mean 1.11x that
  school's international admit rate, all within 0.80-1.20x.
- **Monotonicity** — odds never fall as the profile strengthens, at five
  schools across the selectivity range.
- **Ordering** — Spearman correlation 0.961 between predicted odds and
  published admit rates.
- **Major differentiation** — verified against published by-major rates.

Third-party chancing tools (CollegeVine, CollegeSimply) were not usable as
ground truth: CollegeSimply returns 403 to automated fetches, CollegeVine's
engine is behind a login, and both are themselves estimates built on the same
published rates. CollegeVine also states its model is built for US high
schoolers and handles international applicants poorly, which is this app's
entire population. Published institutional data is the stronger benchmark.

## Two fixes outside the RAG code

1. `parseBullets` in both `public/index.html` and `src/pdfExport.js` only
   stripped numbered bullets (`1.`, `2)`), never `- `, so dash bullets rendered
   with a visible leading dash. The regex is now `/^(?:[-•]|\d+[.)])\s/` in
   both. This also fixes the display in the original API build.

2. `collegeData.js` contained Lehigh University twice (ids 53 and 89), which put
   it on the same list twice for Architecture. The duplicate row is gone and
   `npm test` now asserts the database has no repeated name or id.
   `runMatchEngine` still dedupes by name as a cheap guard.

3. **A budget below the database returned nothing at all.** The cheapest school
   costs about $46,658 a year all-in, so the form's lowest option — "Under
   $30,000/yr" — excluded every school and produced an empty Schools tab, no
   careers, no ROI, and a report that still discussed "your list". The match
   engine now falls back to the cheapest schools available, flags each
   `overBudget`, and the report leads with the shortfall in the profile summary,
   the first gap, and the first strategy item rather than pretending the list is
   affordable.

4. **The career and ROI engines mis-resolved four majors.** Both kept a private
   copy of `getMajorKey` testing `major.includes('cs')` — which also matches the
   tail of "economi-cs", "physi-cs", "statisti-cs" and "mathemati-cs". An
   Economics applicant saw *Software Engineer* and *Machine Learning Engineer*
   on the Career tab while the report text beside it correctly said *Financial
   Analyst*, and ROI applied the 1.45 CS salary multiplier instead of 1.15.
   There is now one canonical `src/majorKey.js` shared by all three engines.

5. **Rigour capped AP students at 7.0/10.** `ibProgram` was a flat +3 on top of a
   4-point AP component, so a student taking every AP their school offered could
   not reach what an IB student got automatically. Advanced coursework is now a
   single 0–7 component that AP/A-level and IB both reach, with the same 3 points
   of enrichment available to either track.

6. **The profile score could only reach 90.** Its weights summed to 90, so the
   "Overall Profile" bar never filled and the `elite` band at 85 really meant 94%
   of the achievable range. Weights now sum to exactly 100 and the band
   thresholds in `context.js` were rescaled to 88 / 74 / 58 to keep their
   original meaning.

7. **The PDF had fallen behind the web UI.** `majorFitLabel`, `majorBand` and
   `fitBreakdown` were rendered on the web school cards and nowhere in the
   export. Each PDF school row now carries the major-fit badge, the per-major
   admitted band marked *published* or *modelled*, the fit-score breakdown, and
   an `OVER BUDGET` flag where it applies.
