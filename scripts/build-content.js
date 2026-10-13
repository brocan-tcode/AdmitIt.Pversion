// scripts/build-content.js
// Generates the static guide pages that give Google something to read.
//
// Why this exists: the tool is one page with almost no text. Google ranks what
// it can read, so a single-page app competes badly however good it is. These
// pages are built from the one thing this project has that the big sites mostly
// do not publish clearly — PUBLISHED BY-MAJOR ADMIT RATES. "Carnegie Mellon
// admits 11% overall" is on a hundred sites; "Carnegie Mellon admits 4% to
// Computer Science and 32.9% to its humanities college" is the number a student
// actually needs and rarely finds.
//
// Deliberately NOT a page for every school × major combination. 102 × 11 would
// be 1,100 thin doorway pages, which Google penalises and which would be mostly
// modelled estimates presented as fact. Only the 13 schools with published
// figures get pages, and every number on them is sourced.
//
//   node scripts/build-content.js

const fs = require('fs');
const path = require('path');
const { VERIFIED } = require('../src/data/majorAdmissions');
const { COLLEGES } = require('../src/collegeData');
const { MAJOR_LABELS } = require('../src/rag/knowledge/reference');

const OUT = path.join(__dirname, '../public/guide');
const DOMAIN = 'https://example.com'; // swapped by scripts/set-domain.sh

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => String(s).toLowerCase().replace(/\(.*?\)/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pct = n => `${n}%`;

// ─────────────────────────────────────────────────────────────
// Shared page shell. Deliberately light — these pages exist to load fast and
// be read, so they carry their own small stylesheet rather than the app's
// 250 KB of inline CSS.
// ─────────────────────────────────────────────────────────────
function shell({ title, description, canonical, body, jsonld }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0a1628">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
<style>
:root{--navy:#0a1628;--card:#101d33;--gold:#c9a84c;--cream:#f5f0e8;--muted:#8896a8;
      --border:rgba(201,168,76,.18);--red:#e08f84;--green:#5fc98a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--navy);color:var(--cream);
     font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
     -webkit-text-size-adjust:100%}
.wrap{max-width:720px;margin:0 auto;padding:22px 18px 64px}
a{color:var(--gold)}
nav.top{font-size:13px;margin-bottom:26px;color:var(--muted)}
nav.top a{text-decoration:none}
h1{font-size:27px;line-height:1.25;margin:0 0 10px}
h2{font-size:19px;margin:34px 0 10px;color:var(--gold)}
p{margin:0 0 14px}
.lede{font-size:17px;color:#dfd8c8}
.tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:14.5px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.4px}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.hard{color:var(--red);font-weight:700}
.easier{color:var(--green);font-weight:700}
.box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin:20px 0}
.cta{display:block;background:var(--gold);color:var(--navy);text-decoration:none;
     font-weight:700;text-align:center;padding:14px 18px;border-radius:10px;margin:26px 0}
.src{font-size:12.5px;color:var(--muted);margin-top:26px;padding-top:14px;border-top:1px solid var(--border)}
ul{padding-left:20px;margin:0 0 14px}li{margin-bottom:7px}
.rel{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.rel a{font-size:13px;background:rgba(201,168,76,.09);border:1px solid var(--border);
       border-radius:8px;padding:7px 11px;text-decoration:none}
@media(max-width:430px){h1{font-size:23px}.wrap{padding:16px 14px 48px}
  /* A four-column numeric table does not fit a 360px screen. It scrolls inside
     .tscroll instead of widening the page — the PAGE must never scroll
     sideways, even when one table on it does. */
  th,td{padding:8px 7px;font-size:13px;white-space:nowrap}
  table{min-width:330px}}
</style>
</head>
<body><div class="wrap">
<nav class="top"><a href="/">← Admission chances tool</a> &nbsp;·&nbsp; <a href="/guide/">All guides</a></nav>
${body}
<p class="src">These are published institutional figures, not predictions. Admission
decisions also rest on essays, recommendations and institutional priorities, which
no calculator can see. Not affiliated with any university.</p>
</div></body></html>`;
}

const findCollege = match =>
  COLLEGES.find(c => c.name.toLowerCase().includes(String(match).toLowerCase()));

// ─────────────────────────────────────────────────────────────
// One page per school that publishes by-major rates
// ─────────────────────────────────────────────────────────────
function schoolPage(rec) {
  const col = findCollege(rec.match);
  if (!col) return null;

  const name = col.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  const overall = rec.overall?.rate ?? col.acceptanceRate;
  const majors = Object.entries(rec.majors || {})
    .filter(([k]) => k !== 'default')
    .map(([key, m]) => ({
      key,
      label: MAJOR_LABELS[key] || key,
      rate: m.intlRate ?? m.rate,
      intl: m.intlRate != null,
      gpa: m.gpa, sat: m.sat,
    }))
    .sort((a, b) => a.rate - b.rate);

  if (!majors.length) return null;

  const hardest = majors[0];
  const easiest = majors[majors.length - 1];
  const ratio = hardest.rate > 0 ? (overall / hardest.rate) : null;

  const rows = majors.map(m => `<tr>
  <td>${esc(m.label)}</td>
  <td class="num ${m.rate < overall * 0.7 ? 'hard' : m.rate > overall * 1.3 ? 'easier' : ''}">${pct(m.rate)}${m.intl ? ' <span style="color:var(--muted);font-size:12px">intl</span>' : ''}</td>
  <td class="num">${m.gpa ? `${m.gpa[0].toFixed(2)}–${m.gpa[1].toFixed(2)}` : '—'}</td>
  <td class="num">${m.sat ? `${m.sat[0]}–${m.sat[1]}` : '—'}</td>
</tr>`).join('\n');

  const title = `${name} acceptance rate by major (${new Date().getFullYear()}) — international students`;
  const description = `${name} admits ${pct(overall)} overall, but ${pct(hardest.rate)} to ${hardest.label}. Published admit rates, GPA and SAT ranges by major for international applicants.`;

  const body = `
<h1>${esc(name)}: acceptance rate by major</h1>
<p class="lede">${esc(name)} admits about <strong>${pct(overall)}</strong> of applicants overall.
That number is the one everybody quotes, and for most applicants it is the wrong one —
you are not admitted by the university, you are admitted by a college or programme
inside it, and those rates differ sharply.</p>

<div class="box">
<strong>The short version:</strong> ${esc(hardest.label)} is the hardest route in at
<strong>${pct(hardest.rate)}</strong>${ratio && ratio >= 1.5 ? `, roughly <strong>${ratio.toFixed(1)}×</strong> harder than the headline rate` : ''}.
${majors.length > 1 ? `${esc(easiest.label)} admits ${pct(easiest.rate)}.` : ''}
</div>

<h2>Published admit rates by major</h2>
<div class="tscroll"><table>
<thead><tr><th>Major</th><th>Admit rate</th><th>GPA (mid 50%)</th><th>SAT (mid 50%)</th></tr></thead>
<tbody>
${rows}
<tr><td><strong>Whole university</strong></td><td class="num"><strong>${pct(overall)}</strong></td>
<td class="num">${col.gpaRange ? `${col.gpaRange[0].toFixed(2)}–${col.gpaRange[1].toFixed(2)}` : '—'}</td>
<td class="num">${col.satRange ? `${col.satRange[0]}–${col.satRange[1]}` : '—'}</td></tr>
</tbody></table></div>

<h2>What this means if you are applying from outside the US</h2>
<p>Two things follow from the table above.</p>
<ul>
<li><strong>Your odds depend on what you write in the major box.</strong> At ${esc(name)}
the gap between the hardest and most accessible programme is
${majors.length > 1 ? `${pct(hardest.rate)} against ${pct(easiest.rate)}` : 'substantial'} — a
bigger difference than almost anything you can change about your profile this year.</li>
<li><strong>International admit rates run below the published figure</strong> at most US
universities. ${esc(name)} charges international students
${col.tuitionOutOfState ? `about $${Number(col.tuitionOutOfState).toLocaleString('en-US')} in tuition` : 'full non-resident tuition'},
and its aid policy for them is: ${esc(col.financialAidIntl || 'not published')}.</li>
</ul>
<p>Switching major purely for the admit rate is usually a mistake — a "why this major"
essay written about a subject chosen for its odds reads exactly like one, and internal
transfer after enrolment is capped and competitive at most schools. But if you were
genuinely choosing between two subjects, the difference above is real and worth knowing.</p>

<a class="cta" href="/">Calculate your own odds at ${esc(name)} →</a>

<h2>Other schools that publish by-major data</h2>
<div class="rel">{{RELATED}}</div>
${rec.source ? `<p class="src">Source: ${esc(rec.source)}.</p>` : ''}
`;

  return {
    file: `${slug(name)}-acceptance-rate-by-major.html`,
    title, description, body, name, overall, hardest, majors,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: title, description,
      about: { '@type': 'CollegeOrUniversity', name },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// The pillar page — the cross-school comparison
// ─────────────────────────────────────────────────────────────
function pillarPage(pages) {
  const rows = pages
    .map(p => ({ ...p, gap: p.overall / p.hardest.rate }))
    .sort((a, b) => b.gap - a.gap)
    .map(p => `<tr>
  <td><a href="/guide/${p.file.replace(/\.html$/, '')}">${esc(p.name)}</a></td>
  <td class="num">${pct(p.overall)}</td>
  <td>${esc(p.hardest.label)}</td>
  <td class="num hard">${pct(p.hardest.rate)}</td>
  <td class="num">${p.gap >= 1.2 ? `${p.gap.toFixed(1)}×` : '—'}</td>
</tr>`).join('\n');

  const title = 'US university acceptance rates by major — why the headline number misleads';
  const description = 'Published by-major admit rates at 13 US universities. Computer science is often several times harder than a school\'s advertised acceptance rate. Full comparison table.';

  const body = `
<h1>Acceptance rates by major, not by university</h1>
<p class="lede">Every ranking site publishes one acceptance rate per university. For a
student choosing a major, that number is close to useless — you apply to a programme,
and programmes inside the same university can differ by a factor of five.</p>

<h2>Where the gap is biggest</h2>
<p>Each row compares a university's advertised acceptance rate against its most
competitive published programme.</p>
<div class="tscroll"><table>
<thead><tr><th>University</th><th>Headline</th><th>Hardest programme</th><th>Its rate</th><th>Gap</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>

<h2>Why this happens</h2>
<p>Large universities admit into colleges, not into the university as a whole. A
computer science applicant at a school with a direct-admit CS programme is competing
against other CS applicants for a fixed number of seats, not against the general pool.
The published rate averages the competitive programmes with the quiet ones, so it
describes nobody.</p>
<p>The effect is strongest in computer science, business, nursing and engineering —
the four fields where applications have grown fastest. It is weakest in the humanities
and in universities that admit undeclared.</p>

<h2>What to do with this</h2>
<ul>
<li><strong>Check whether your target school admits directly into your major.</strong>
If it does, the published rate is not your rate.</li>
<li><strong>Ask whether internal transfer is open</strong> before planning to switch
after arrival. At most schools with direct admission it is capped and competitive.</li>
<li><strong>Do not pick a subject for its admit rate.</strong> Four years is a long
time to study something chosen on a spreadsheet, and admissions readers can tell.</li>
</ul>

<a class="cta" href="/">Check your odds by major — free, no sign-up →</a>

<h2>Individual school breakdowns</h2>
<div class="rel">{{RELATED}}</div>
`;

  return {
    file: 'acceptance-rate-by-major.html', title, description, body,
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: title, description },
  };
}

// ─────────────────────────────────────────────────────────────
function indexPage(pages) {
  const links = pages.map(p =>
    `<li><a href="/guide/${p.file.replace(/\.html$/, '')}">${esc(p.title)}</a></li>`).join('\n');
  return {
    file: 'index.html',
    title: 'Guides: US admission rates by major for international students',
    description: 'Published by-major acceptance rates, GPA and SAT ranges at US universities, written for international applicants.',
    body: `<h1>Guides</h1>
<p class="lede">Published admission data for international students applying to US
universities — by major, because that is how admission actually works.</p>
<ul>
${links}
</ul>
<a class="cta" href="/">Calculate your own admission odds →</a>`,
  };
}

// ─────────────────────────────────────────────────────────────
function build() {
  fs.mkdirSync(OUT, { recursive: true });

  const schoolPages = VERIFIED.map(schoolPage).filter(Boolean);
  const pillar = pillarPage(schoolPages);
  const all = [pillar, ...schoolPages];
  const idx = indexPage(all);

  // Cross-links: each page points at a handful of siblings, which spreads
  // crawl equity and gives a reader somewhere to go next.
  const relatedFor = (self) => all
    .filter(p => p.file !== self.file)
    .slice(0, 6)
    .map(p => `<a href="/guide/${p.file.replace(/\.html$/, '')}">${esc(p.name || 'By-major rates')}</a>`)
    .join('\n');

  let written = 0;
  for (const p of [...all, idx]) {
    const canonical = `${DOMAIN}/guide/${p.file === 'index.html' ? '' : p.file.replace(/\.html$/, '')}`;
    const html = shell({
      title: p.title, description: p.description, canonical,
      body: (p.body || '').replace('{{RELATED}}', relatedFor(p)),
      jsonld: p.jsonld,
    });
    fs.writeFileSync(path.join(OUT, p.file), html);
    written++;
  }

  // Sitemap covering the tool plus every guide.
  const urls = [
    { loc: `${DOMAIN}/`, pri: '1.0', freq: 'weekly' },
    { loc: `${DOMAIN}/guide/`, pri: '0.8', freq: 'monthly' },
    ...all.map(p => ({ loc: `${DOMAIN}/guide/${p.file.replace(/\.html$/, '')}`, pri: '0.7', freq: 'monthly' })),
  ];
  fs.writeFileSync(path.join(__dirname, '../public/sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/build-content.js. Run scripts/set-domain.sh to set the
     real domain before deploying. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`);

  const sizes = fs.readdirSync(OUT).map(f => fs.statSync(path.join(OUT, f)).size);
  console.log(`  ${written} guide pages written to public/guide/`);
  console.log(`  average page size: ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length / 1024)} KB`);
  console.log(`  sitemap.xml lists ${urls.length} URLs`);
}

if (require.main === module) build();
module.exports = { build };
