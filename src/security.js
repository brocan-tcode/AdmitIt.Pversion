// src/security.js
// Everything that has to be true before this app faces the open internet.
//
// Context that shapes the choices below: the RAG build holds no API key, no
// user accounts, no database and no personal data — nothing is stored between
// requests. So the realistic threats are not data theft; they are
//   (1) somebody running up the host's CPU bill with automated requests,
//   (2) somebody scraping the knowledge base, which is the actual product,
//   (3) a future XSS turning into data exfiltration.
// The middleware here is aimed at those three, in that order.

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ─────────────────────────────────────────────────────────────
// Input limits
//
// A profile is a few hundred bytes. The PDF endpoint is the outlier: it
// receives the whole composed report back from the browser, measured at ~82 KB.
// 1 MB leaves generous headroom while refusing the 5 MB bodies the old default
// accepted — that ceiling let one request allocate 5 MB of JSON before any of
// our code ran.
// ─────────────────────────────────────────────────────────────
const BODY_LIMIT = '1mb';

// Caps applied after parsing. These are not security-critical on their own —
// the engine handles absurd input fine — but they stop a request pinning CPU
// with a 50,000-entry activity list, and they keep logs readable.
const MAX_ACTIVITIES = 60;
const MAX_STRING = 4000;

function sanitizeProfile(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    // Block the prototype-pollution keys outright. Express's JSON parser does
    // not pollute on its own and the engine never deep-merges, so this is
    // defence in depth rather than a fix for a live bug.
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (typeof v === 'string') out[k] = v.slice(0, MAX_STRING);
    else if (Array.isArray(v)) out[k] = v.slice(0, MAX_ACTIVITIES);
    else out[k] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Rate limits, tiered by what the endpoint actually costs
//
// Measured on this machine: /api/analyze ~20 ms, /api/chat 1–15 ms,
// /api/export-pdf ~118 ms. The PDF route is roughly six times the cost of
// everything else and is the only one worth a tight limit.
// ─────────────────────────────────────────────────────────────
const WINDOW = 15 * 60 * 1000; // 15 minutes

const limiterOpts = (max, message) => ({
  windowMs: WINDOW,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: message },
  // Without this a single visitor's preflight and asset requests could count
  // against them; only the API routes are metered.
  skipFailedRequests: false,
});

const generalLimiter = rateLimit(limiterOpts(300,
  'Too many requests. Wait a few minutes and try again.'));

const analyzeLimiter = rateLimit(limiterOpts(60,
  'You have run a lot of analyses in a short time. Wait a few minutes and try again.'));

const pdfLimiter = rateLimit(limiterOpts(20,
  'Too many PDF exports. Wait a few minutes and try again.'));

// ─────────────────────────────────────────────────────────────
// Headers
//
// This policy is deliberately looser than helmet's default in two places, both
// verified in a real browser — helmet's defaults silently broke the whole app:
//
//   scriptSrcAttr: helmet defaults this to 'none', which blocks every inline
//   onclick= attribute. The frontend is one 4,000-line HTML file wired almost
//   entirely with inline handlers, so the default left every button on the page
//   dead with no visible error. Fixing it properly means moving ~100 handlers to
//   addEventListener; until that happens 'unsafe-inline' is required here.
//
//   style-src / font-src: the page loads Playfair Display and DM Sans from
//   Google Fonts, which 'self' alone refuses.
//
// What that costs: script-src with 'unsafe-inline' means CSP is not a defence
// against injected script. It is still worth setting, because the directive
// actually carrying weight here is connect-src 'self' — even if an injection
// were found, the page could not send what it stole anywhere. frame-ancestors
// 'none' stops the tool being framed inside someone else's site and passed off
// as theirs. The real reason injection is unlikely is upstream of CSP: the
// server composes output from a fixed vocabulary and the frontend escapes
// everything it renders.
// ─────────────────────────────────────────────────────────────
const GOOGLE_FONTS_CSS  = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILE = 'https://fonts.gstatic.com';

// ─────────────────────────────────────────────────────────────
// Analytics — opt-in, privacy-first, and off unless configured
//
// Both options below are cookie-free and collect no personal data, so no cookie
// banner is required and nothing about a student's grades ever leaves the page.
// Google Analytics is deliberately not supported here: it would mean a consent
// banner, and it is the wrong trade for a tool whose selling point is that it
// stores nothing.
//
//   PLAUSIBLE_DOMAIN=yourdomain.com     (plausible.io, paid)
//   CF_ANALYTICS_TOKEN=xxxxxxxx         (Cloudflare Web Analytics, free)
//
// CSP has to know about whichever one is used, or the browser blocks it — which
// is exactly the kind of silent failure that makes people think analytics is
// broken when it is the policy doing its job.
// ─────────────────────────────────────────────────────────────
const PLAUSIBLE_HOST  = 'https://plausible.io';
const CLOUDFLARE_HOST = 'https://static.cloudflareinsights.com';

function analyticsConfig() {
  const plausible = (process.env.PLAUSIBLE_DOMAIN || '').trim();
  const cloudflare = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  return { plausible, cloudflare, enabled: !!(plausible || cloudflare) };
}

/** The <script> tag to inject, or '' when analytics is not configured. */
function analyticsSnippet() {
  const a = analyticsConfig();
  if (a.plausible) {
    const d = a.plausible.replace(/[^a-zA-Z0-9.\-]/g, '');
    return `\n<script defer data-domain="${d}" src="${PLAUSIBLE_HOST}/js/script.js"></script>`;
  }
  if (a.cloudflare) {
    const t = a.cloudflare.replace(/[^a-zA-Z0-9]/g, '');
    return `\n<script defer src="${CLOUDFLARE_HOST}/beacon.min.js" data-cf-beacon='{"token":"${t}"}'></script>`;
  }
  return '';
}

function analyticsHosts() {
  const a = analyticsConfig();
  const hosts = [];
  if (a.plausible)  hosts.push(PLAUSIBLE_HOST);
  if (a.cloudflare) hosts.push(CLOUDFLARE_HOST);
  return hosts;
}

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...analyticsHosts()],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:', GOOGLE_FONTS_FILE],
      connectSrc: ["'self'", ...analyticsHosts()],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  // The app is served over HTTPS by the host; tell browsers to insist on it.
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // would block the inline data: images
});

// ─────────────────────────────────────────────────────────────
// CORS
//
// Default is same-origin only. The old `cors()` call allowed every website on
// the internet to call these endpoints from a visitor's browser — which costs
// nothing to the attacker and bills the host. Set ALLOWED_ORIGINS only if you
// genuinely embed this from another domain you control.
// ─────────────────────────────────────────────────────────────
function corsPolicy(req, res, next) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// ─────────────────────────────────────────────────────────────
// Error responses
//
// `err.message` was going straight to the client. On a crash inside pdf-lib or
// the engine that can include file paths and internal state. Log the detail,
// return a generic message.
// ─────────────────────────────────────────────────────────────
const isProd = () => process.env.NODE_ENV === 'production';

function safeError(res, err, where, status = 500) {
  console.error(`[${where}]`, err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  res.status(status).json({
    success: false,
    error: isProd()
      ? 'Something went wrong handling that request.'
      : `${where}: ${err && err.message ? err.message : err}`,
  });
}

/**
 * The knowledge corpus is the product. /api/rag/search returns full document
 * text, which makes the whole knowledge base scrapeable in a few hundred
 * requests. It stays available locally for debugging and is off in production
 * unless RAG_DEBUG=1 is set deliberately.
 */
function debugRoutesEnabled() {
  return !isProd() || process.env.RAG_DEBUG === '1';
}

module.exports = {
  BODY_LIMIT, MAX_ACTIVITIES, MAX_STRING,
  analyticsConfig, analyticsSnippet, analyticsHosts,
  sanitizeProfile, securityHeaders, corsPolicy,
  generalLimiter, analyzeLimiter, pdfLimiter,
  safeError, debugRoutesEnabled, isProd,
};
