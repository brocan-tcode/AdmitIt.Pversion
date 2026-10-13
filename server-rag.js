// server-rag.js — College Consultant Assistant, local-retrieval build.
//
// Same app, same frontend, same PDF. The difference is that every section of
// the report is composed from a local document corpus instead of a Claude API
// call, so this server needs no API key, no network access, and costs nothing
// per run. See src/rag/ for the retriever, the knowledge base, and the composer.

const express     = require('express');
const compression = require('compression');
const path        = require('path');
const fs          = require('fs');

const { analyze, index } = require('./src/rag/ragEngine');
const { answer }         = require('./src/rag/qa');
const { chat }           = require('./src/rag/chat');
const { generatePDF }    = require('./src/pdfExport');
const S = require('./src/security');

const app  = express();
const PORT = process.env.PORT || 3000;

// Hosts like Render and Railway put a proxy in front of the app. Without this
// every request appears to come from the proxy's IP and the rate limiter would
// throttle all visitors as if they were one person.
app.set('trust proxy', 1);

// Gzip. The single biggest capacity lever this app has: index.html is ~598 KB
// of inline CSS and JS, and Express sends it uncompressed by default. That is
// 598 KB of bandwidth per visitor, and bandwidth — not CPU — is what actually
// runs out first on a small host. Compressed it is about a tenth of that.
app.use(compression());

app.use(S.securityHeaders);
app.use(S.corsPolicy);                              // same-origin unless ALLOWED_ORIGINS is set
app.use(express.json({ limit: S.BODY_LIMIT }));
app.use('/api/', S.generalLimiter);

// ── HTML routes come BEFORE express.static ───────────────────────────
// Ordering is load-bearing. express.static with extensions:['html'] answers
// /guide/<slug> straight from disk, so when these routes sat after it the guide
// pages were served without the analytics tag while the homepage had it — the
// kind of half-working state that looks like analytics is broken.

// The guide index, with and without the trailing slash.
app.get(['/guide', '/guide/'], (req, res) =>
  sendHtml(res, path.join(__dirname, 'public', 'guide', 'index.html')));

// Individual guide pages, by clean URL. The slug pattern is a whitelist, and
// the path is rebuilt from it rather than taken from the request, so a slug
// cannot walk out of the guide directory.
app.get('/guide/:slug', (req, res, next) => {
  if (!/^[a-z0-9-]{3,80}$/.test(req.params.slug)) return next();
  const file = path.join(__dirname, 'public', 'guide', req.params.slug + '.html');
  if (!fs.existsSync(file)) return next();
  sendHtml(res, file);
});

app.use(express.static(path.join(__dirname, 'public'), {
  // index.html and the guide pages are served by the routes above so they get
  // the analytics tag and consistent headers.
  index: false,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// ─────────────────────────────────────────────────────────────
// HTML is served through here so the analytics tag can be injected at request
// time rather than baked into the file. That keeps the committed HTML free of
// account-specific tokens, and means analytics is switched on by setting an
// environment variable on the host — no rebuild, no code change.
// Files are read once and cached; this is a handful of static pages.
// ─────────────────────────────────────────────────────────────
const htmlCache = new Map();
function sendHtml(res, file) {
  let html = htmlCache.get(file);
  if (html === undefined) {
    html = fs.readFileSync(file, 'utf8');
    const tag = S.analyticsSnippet();
    if (tag) html = html.replace('</head>', `${tag}\n</head>`);
    htmlCache.set(file, html);
  }
  res.type('html').set('Cache-Control', 'no-cache').send(html);
}

// Reject malformed JSON with a clean 400 instead of an Express stack trace.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Malformed JSON body.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body too large.' });
  }
  return next(err);
});

// ─────────────────────────────────────────────────────────────
// POST /api/analyze — full report, retrieval only
// ─────────────────────────────────────────────────────────────
app.post('/api/analyze', S.analyzeLimiter, (req, res) => {
  try {
    const result = analyze(S.sanitizeProfile(req.body));
    console.log(
      `analyze: ${result.schools.length} schools, ` +
      `${result.rag.documentsUsed} documents retrieved, ${result.rag.elapsedMs}ms`
    );
    res.json(result);
  } catch (err) {
    S.safeError(res, err, 'analyze');
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/improve — retrieval Q&A over the same corpus
// ─────────────────────────────────────────────────────────────
app.post('/api/improve', S.analyzeLimiter, (req, res) => {
  try {
    const { question, profile, engineData } = req.body || {};
    const result = answer(String(question || '').slice(0, S.MAX_STRING), S.sanitizeProfile(profile), engineData || {});
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    S.safeError(res, err, 'improve');
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/chat — the chat box
//
// Questions about the student's own result (their score, their odds, their
// major, their list) are COMPUTED from the same engine functions that produced
// the report. Everything else falls through to retrieval. See src/rag/chat.js.
// ─────────────────────────────────────────────────────────────
app.post('/api/chat', S.analyzeLimiter, (req, res) => {
  try {
    const { question, profile, engineData } = req.body || {};
    const result = chat(String(question || '').slice(0, S.MAX_STRING), S.sanitizeProfile(profile), engineData || {});
    if (!result.success) return res.status(400).json(result);
    console.log(`chat [${result.kind}]: ${String(question).slice(0, 60)}`);
    res.json(result);
  } catch (err) {
    S.safeError(res, err, 'chat');
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/export-pdf — unchanged
// ─────────────────────────────────────────────────────────────
app.post('/api/export-pdf', S.pdfLimiter, async (req, res) => {
  try {
    await generatePDF(req.body, res);
  } catch (err) {
    S.safeError(res, err, 'export-pdf');
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/rag/search — inspect what the retriever actually returns
// ─────────────────────────────────────────────────────────────
// The corpus is the product — see src/security.js. Off in production unless
// RAG_DEBUG=1 is set deliberately.
app.get('/api/rag/search', (req, res) => {
  if (!S.debugRoutesEnabled()) return res.status(404).json({ success: false, error: 'Not found.' });
  const q = String(req.query.q || '').slice(0, 300);
  if (!q) return res.status(400).json({ success: false, error: 'Pass ?q=your+query' });
  const topic = req.query.topic ? String(req.query.topic).split(',') : undefined;
  const hits = index.searchDiverse(q, { k: parseInt(req.query.k) || 8, topic });
  res.json({
    success: true, query: q, corpus: index.stats(),
    results: hits.map(h => ({
      id: h.doc.id, topic: h.doc.topic, title: h.doc.title,
      score: Math.round(h.score * 100) / 100,
      matchedTerms: h.matched,
      text: h.doc.text,
    })),
  });
});

app.get('/api/rag/stats', (req, res) => {
  if (!S.debugRoutesEnabled()) return res.status(404).json({ success: false, error: 'Not found.' });
  res.json({ success: true, ...index.stats() });
});

// The app is a single page — the tabs are in-page, not URLs — so `/` is the
// only real route. The old catch-all answered EVERY path with the homepage and
// an HTTP 200, including /favicon.ico and any nonsense a crawler invented. That
// is a "soft 404": Google indexes junk URLs and marks the site down for it, and
// browsers got the HTML page when they asked for an icon.
app.get('/', (req, res) => sendHtml(res, path.join(__dirname, 'public', 'index.html')));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Not found.' });
  }
  res.status(404).type('html').send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#0a1628;color:#f5f0e8;font-family:system-ui,-apple-system,sans-serif;
      text-align:center;padding:24px}
 h1{font-size:19px;margin:0 0 8px;color:#c9a84c}
 p{font-size:14px;line-height:1.6;color:#8896a8;margin:0 0 18px;max-width:34ch}
 a{display:inline-block;background:#c9a84c;color:#0a1628;text-decoration:none;
   font-weight:700;font-size:14px;padding:10px 20px;border-radius:8px}
</style></head><body><div>
 <h1>That page doesn't exist</h1>
 <p>The admission chances tool is on the home page.</p>
 <a href="/">Go to the tool</a>
</div></body></html>`);
});

app.listen(PORT, () => {
  const s = index.stats();
  console.log(`\n  College Consultant Assistant — local RAG build`);
  console.log(`  ${s.documents} documents indexed (${s.vocabulary} terms), no API key required`);
  console.log(`  →  http://localhost:${PORT}\n`);
});
