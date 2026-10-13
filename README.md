# AdmitIt.Pversion

**Admission chances and application planning for international students applying
to US universities.** Free, no sign-up, no account, nothing stored.

It answers the question a student actually has — *what are my realistic chances,
and what should I do about it* — and it answers it **by major**, because that is
how US admission actually works.

---

## The idea

Every chancing tool publishes one acceptance rate per university. For a student
choosing a major, that number is close to useless.

> The University of Washington admits **43%** of applicants.
> It admits **2%** to Computer Science.

You are not admitted by a university. You are admitted by a college or a
programme inside it, and the rates differ by up to 20×. A student told "UW is a
43% school" and rejected from CS was never given a number that applied to them.

That gap is the whole product. Everything else — the school list, the essay
strategy, the visa planning, the chat — is built around getting that one number
right and then explaining what to do with it.

A second idea runs underneath: **honesty is the feature.** When the database
contains no safety school for a student, the report says so in the first
paragraph instead of inventing one. When a budget fits nothing, it says that too.
Tools that flatter teenagers about their odds do real harm.

---

## What it does

| | |
|---|---|
| **School matching** | 102 US universities scored against the admitted band **for the student's major**, not the school's headline rate |
| **Admission odds** | A calibrated probability model, audited against published 2025–26 figures (0.3pt mean drift) |
| **Profile score** | 0–100 across seven weighted components, fully explainable |
| **School list** | Five tiers from reach to safety, with cost, ROI and fit breakdown per school |
| **Strategy** | Gap analysis, essay angles, application rounds, month-by-month timeline |
| **Careers & visas** | Salary data, OPT/CPT/H-1B planning — the part most tools ignore entirely |
| **Chat** | Answers questions about *your* result: "why this score", "my chances at Cornell", "should I switch major" |
| **PDF export** | The full report, 20+ pages |
| **Guides** | 15 static pages publishing by-major admit rates — the SEO surface |

### No API key, ever

The report reads like it was written by a language model. It was not. Every
section is composed from a local 282-document corpus using BM25 retrieval plus
deterministic templating.

That was a deliberate constraint, and it bought three things:

- **£0 per run.** No API bill that scales with users.
- **Deterministic.** The same profile always produces the same report.
- **Traceable.** Every sentence maps to a document id — see `rag.documents` in
  the API response.

The cost is real too: it cannot answer anything outside its corpus, and it says
so rather than improvising.

---

## How it works

```
profile form
   │
   ├─► matchEngine.js ──────► 102 schools scored by MAJOR-specific admitted band
   │      └── majorAdmissions.js   published by-major rates (13 schools), derived for the rest
   │
   ├─► rag/context.js ──────► normalised profile + derived signals
   │
   ├─► rag/retriever.js ────► BM25 over 282 documents
   │      └── rag/knowledge/*.js   180 curated admissions documents
   │      └── collegeData.js       102 schools → one document each
   │
   ├─► rag/composer.js ─────► the 8 report sections
   │
   └─► rag/advisor.js ──────► computed answers for the chat
```

Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Running it

```bash
npm install
npm start            # http://localhost:3000
npm test             # full test suite
npm run audit:data   # accuracy audit vs published figures
```

Node 18+. No API key, no database, no configuration.

Publishing it: **[docs/GETTING-LIVE.md](docs/GETTING-LIVE.md)** — the step-by-step
from empty GitHub account to a site Google has indexed.
Reference detail on hosting, security and capacity: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
npm run build:deploy        # clean, secret-free folder for hosting
npm run set-domain mysite.com
```

---

## The process — what this took, and what it got wrong

The interesting parts of this project were the bugs, not the features. Each of
these shipped, looked fine, and was wrong.

**The school list barely changed when the major changed.** A nursing applicant
was shown Amherst and Pomona, which have no nursing school. Fixed by classifying
majors as `universal` / `common` / `specialized`, which decides what *absence*
from a school's programme list means. For specialized majors, a school with no
recorded programme is excluded outright.

**Major competitiveness was being counted twice.** Once through the admitted
band, once as a separate multiplier. Now exactly once, and the invariant is
documented at the top of `matchEngine.js`.

**The model was an academic index wearing a holistic costume.** An IOI gold
medal plus two published papers moved a CMU estimate by 0.7 points. Partly fixed;
honestly flagged as a remaining limit.

**The list inverted.** A 4.0/1580 student got 20 schools; a 2.8/1020 student got
6, four of which were reaches. The weaker the student, the fewer options they
were shown — exactly backwards. The tier quota was hard-coded at 4 per tier with
no reallocation.

**Three engines disagreed about what major you had typed.** Two of them tested
`major.includes('cs')`, which also matches the tail of *economi-cs*,
*physi-cs*, *statisti-cs* and *mathemati-cs*. Economics applicants were shown
Software Engineer on the Career tab while the text beside it correctly said
Financial Analyst.

**The profile score could only reach 90/100.** The weights summed to 90, so the
bar never filled and the "elite" band at 85 really meant 94% of achievable.

**AP students were capped at 7/10 on rigour** while IB students reached 10,
because IB was a flat bonus on top of the AP component rather than an
alternative route to the same ceiling.

**It did not fit a phone.** On a 360px Android screen the page rendered 519px
wide. The tab strip had `overflow-x:auto` but was a flex item, and flex items
refuse to shrink below their content without `min-width:0`.

**Helmet's default CSP silently killed every button.** `script-src-attr 'none'`
blocks inline `onclick=`, which is how the entire UI is wired. The headers looked
perfect and nothing worked.

`npm test` now has a regression check for every one of these. The pattern that
kept repeating: *the thing looked right and was wrong*, and only measuring caught
it. Where a number is shown twice, it is now read from one place.

---

## Honest limitations

- **The probabilities are modelled estimates**, not predictions. There is no
  outcome data anywhere in this system, so the model's ability to separate real
  admits from real denies has never been measured and cannot be.
- **Essays, recommendations and institutional priorities are invisible to it** —
  and at single-digit-admit schools, those are what decide the outcome.
- **102 schools** against roughly 2,500 US four-year institutions. Students below
  the selective range are told plainly that their realistic options are outside
  this database.
- **Built for international applicants.** A US domestic student would be scored
  against international admit rates, which is wrong for them.
- **Not affiliated with any university.** Not a substitute for a counsellor.

---

## Data sources

- Published institutional admissions data, 2025–26 (by-major rates for 13 schools)
- US Department of Education College Scorecard (earnings, retention, completion)
- `npm run audit:data` re-checks every figure against published values and
  reports drift, calibration, monotonicity and ordering.

Third-party chancing tools were deliberately **not** used as ground truth.
