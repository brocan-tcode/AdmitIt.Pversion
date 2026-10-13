# Putting this online safely

Read the first section before you upload anything. The rest is the actual steps.

---

## 1. The folder is now safe — here is what changed

This section used to be a warning. It is now a record of what was removed on
2026-10-12, because the risk is resolved.

| Was here | Now |
|---|---|
| `.env` with your Anthropic key | **deleted** — the same key is preserved in `~/Downloads/cca-archived-projects/ultrawork/.env` |
| `server.js` (read the API key) | **deleted** — the app never needed it |
| `trend/`, `ultrawork/`, `video-downloader/`, `vid downloader/` | **moved** to `~/Downloads/cca-archived-projects/` |
| `.claude/` (absolute paths with your username) | **deleted** |
| `@anthropic-ai/sdk`, `cors`, `dotenv`, `pdfkit` | **removed** from dependencies |

The four projects were moved rather than erased: each was the only copy, two had
been edited within the last two months, and `~/Downloads/VideoDownloader/` turned
out to be the downloaded-videos output folder, not a code backup. If you are
certain you want them gone for good:

```bash
rm -rf ~/Downloads/cca-archived-projects
```

That cannot be undone, so check the folder first.

**Still build with the script rather than uploading the folder directly:**

```bash
npm run build:deploy
```

It writes `../cca-deploy` with only the app in it, and refuses to finish if a
key, a personal path, or an unrelated project ever reappears. Belt and braces —
the folder is clean today, and the check keeps it that way.

> One housekeeping note: your Anthropic key was only ever on your own machine,
> so it has not been exposed and does not need revoking. If you ever do paste a
> key somewhere public, revoke it in the Anthropic console immediately —
> deleting the file afterwards does not help, because it is already copied.

## 2. What the live site can and cannot expose

Worth knowing, because it is better than most apps:

- **No API key runs on the public site.** The deploy build has no Anthropic SDK
  installed at all, so there is no code path that could use a key even if you
  accidentally set one on the host.
- **No database, no accounts, no stored data.** Student answers live in the
  browser for the length of a visit and are never written to disk. There is no
  user data to steal, and nothing to breach.
- **No personal information of yours ships.** Your name, email and file paths
  are not in any file that gets uploaded. `npm test` checks this.

What *is* exposed, and is meant to be: the app itself, and its answers.

---

## 3. What I hardened

| Protection | What it stops |
|---|---|
| Rate limits (300/15min general, 60 analyses, 20 PDFs per IP) | One person or bot running up your hosting bill. PDFs cost ~118 ms each — the tightest limit is there |
| Request body capped at 1 MB (was 5 MB) | Someone forcing the server to allocate big chunks of memory per request |
| Security headers (CSP, HSTS, nosniff, no framing) | Your tool being embedded in someone else's site, and data exfiltration if a bug were ever found |
| Same-origin only (the old `cors()` allowed every website) | Other sites calling your API from their visitors' browsers at your expense |
| Generic error messages in production | Error text revealing file paths and internals |
| `/api/rag/search` disabled in production | Your knowledge base — the actual product — being scraped in a few hundred requests |
| Input sanitising, caps on string and array sizes | Oversized or malformed input wasting CPU |

I also attacked the running app to check the basics: no XSS (output is composed
from a fixed vocabulary, and the frontend escapes), no path traversal, no
prototype pollution, survives malformed JSON. Those were already fine.

**Honest limit:** the page is one large HTML file wired with inline `onclick=`
handlers, so the script part of the CSP has to allow inline scripts. That means
CSP is not protecting you against injected script — it is protecting against
*exfiltration* (`connect-src 'self'`). The real defence is that the server never
echoes user input back as HTML. If you ever add a feature that does, that
assumption breaks and the CSP will not save you.

---

## 3b. How many people it can handle

Measured, not guessed. Numbers below are from a load test on this Mac; a small
rented server is slower, so treat them as the ceiling.

| | Cost per request | Max on one CPU core |
|---|---|---|
| Homepage | serving a file | ~3,500 / sec |
| Run an analysis | 4.1 ms | ~240 / sec |
| Chat answer | 0.3–0.8 ms | 1,200–3,600 / sec |
| **Export a PDF** | **64 ms** | **~16 / sec** |

**The PDF export is 15× heavier than anything else.** Node runs your code on one
core, one request at a time, so while a PDF is building every other visitor
waits. That is why its rate limit is the tightest.

### "Would 10,000 people at once crash it?"

It depends what "at once" means, and the difference is enormous:

- **10,000 people in the same hour** — about 3 per second. Completely fine, even
  on the cheapest paid tier. Not close to a limit.
- **10,000 people in the same *second*** — no. Nothing on a $7/month server
  survives that. You would need several servers behind a load balancer.

What actually happens under overload is better than "crash". Pushed to 1,500
simultaneous connections, the app served 2,494 requests/sec, failed 0.35% of
them, and answered the next request in 1 ms. It gets slow and sheds a few
requests; it does not fall over or need restarting. Memory settled at 256 MB
after 100,000 requests with no leak.

Realistically, if a Reddit post sends you 10,000 visitors over an evening, that
is roughly 1 request/sec. You will be fine.

### Bandwidth was the real limit, and is now fixed

The page was 598 KB uncompressed, sent on every visit. Two fixes:

- **gzip** (the `compression` middleware) — Express does not compress by default.
- **The logo was a 2000px image embedded in the HTML as base64**, displayed at
  54px. Base64 barely compresses, so it was 58% of the page weight. It is now a
  separate 12 KB file the browser caches.

| | Before | Now |
|---|---|---|
| First visit | 598 KB | **80 KB** |
| Repeat visit | 598 KB | **68 KB** |

That is 7.4× less data per visitor — which on a metered host is 7.4× more
visitors for the same bill.

### If it ever does get popular

1. **Put Cloudflare in front of it** (free). It caches your page worldwide and
   absorbs traffic spikes and attacks before they reach your server. This is the
   single highest-value thing you can do, and it takes ten minutes.
2. Move up a hosting tier — more CPU means proportionally more PDFs per second.
3. Only then worry about multiple servers.

## 3c. Devices and browsers

**It runs on everything with a modern browser**, because it is a website, not an
app. Your server does the work; the visitor only needs a browser. Android,
Windows, iPhone, Mac, Linux, tablets — same site, nothing to install, no app
store. The code uses only CSS and JavaScript features that have been standard
since 2017, and no browser-specific or legacy dependencies.

The one visual nicety that varies is the frosted-glass header blur, which older
Firefox ignores and simply renders as a solid background. Nothing breaks.

### Phone layout — fixed on 2026-10-13

It did **not** fit a phone before. On a 360px Android screen (the most common
size) the page rendered 519px wide, so the whole site scrolled sideways and the
school tier badges were cut off mid-word. Three separate causes:

1. The tab strip had `overflow-x:auto` but was a flex item, and flex items
   default to `min-width:auto` — meaning they refuse to shrink below their
   content. The tabs pushed the page to 919px instead of scrolling inside
   themselves. `min-width:0` is what makes the existing scroll actually work.
2. The eight tabs shared one row with the logo and the Analyze button, leaving
   them about 70px of visible space. They now get their own full-width row.
3. School cards put the name, three stats and the tier badge on one
   non-wrapping row, so the badge was clipped at the screen edge.

Verified after the fix, with a full analysis run on each size:

| Screen | Result |
|---|---|
| 320px (smallest phone) | fits, 0 clipped elements, chat panel fits |
| 360px (common Android) | fits, 0 clipped elements |
| 412px (Pixel) | fits, 0 clipped elements |
| 1440px (desktop) | unchanged — single-row header, all 8 tabs visible |

`npm test` now asserts each of those CSS rules, because this class of bug is
invisible unless someone opens the site on a phone.

## 4. Where to host it

This is a Node server, so it needs a host that runs Node — not Netlify or GitHub
Pages, which only serve static files.

**Recommended: [Render](https://render.com)** — free tier, connects to GitHub,
gives HTTPS automatically.

1. Make a GitHub account if you do not have one.
2. Build the clean folder: `bash scripts/build-deploy.sh`
3. Upload `../cca-deploy` to a **new** GitHub repository. Make it private if you
   would rather people not read your knowledge base.
4. On Render: **New → Web Service → connect that repo**.
   - Build command: `npm install`
   - Start command: `npm start`
   - Add an environment variable: `NODE_ENV` = `production`
     *(this is what disables the corpus dump and the detailed error messages —
     do not skip it)*
5. Deploy. You get a URL like `your-app.onrender.com`.

Alternatives that work the same way: Railway, Fly.io, Heroku. Avoid Vercel for
this one — it is built for serverless functions and the PDF export does not fit
that shape well.

**On the free tier** the app sleeps after inactivity and takes ~30 seconds to
wake. That is fine for testing and bad for Google (slow pages rank worse). If
real students start using it, the paid tier is about $7/month.

---

## 5. Getting a domain, then getting into Google

### Domain
Buy one from Cloudflare or Namecheap (~$10/year). A real domain ranks far better
than `your-app.onrender.com`, and looks legitimate to students. Point it at
Render following their custom-domain instructions.

### After the domain is live — do this first
One command:

```bash
npm run set-domain yourdomain.com
npm run build:deploy
```

It rewrites the canonical link, the og: tags, the robots.txt sitemap line and
sitemap.xml, then prints each one so you can check it. Getting this wrong tells
Google to index a domain you do not own, which is why it is a script and not a
find-and-replace you do by hand.

### Then
1. **[Google Search Console](https://search.google.com/search-console)** — add
   your domain, verify ownership (Render lets you add the DNS record), then
   submit `https://yourdomain.com/sitemap.xml`.
2. **Request indexing** for the homepage in Search Console. Without this it can
   take weeks; with it, usually days.
3. **[Bing Webmaster Tools](https://www.bing.com/webmasters)** — same thing. It
   imports directly from Search Console, so it costs five minutes.

### The uncomfortable truth about ranking

A single-page tool with no written content ranks poorly, however good it is.
Google has nothing to read. The title and description I wrote target what
students actually type — *"college chances calculator international students"* —
but you are competing with CollegeVine and Niche, who have thousands of pages
and years of links.

What actually moves this, in order of effect:

1. **Write content pages.** One page per real question: *"What GPA do I need for
   Carnegie Mellon as an international student?"*, *"Is CS harder to get into
   than maths?"* You already have the data for these — your per-major admit rates
   are genuinely better than what most sites publish. Ten honest pages will do
   more than any technical tweak.
2. **Get mentioned somewhere.** One post in r/ApplyingToCollege or an
   international-student forum will bring more visitors in a week than SEO will
   in three months, and the links help ranking too.
3. **Be fast.** Use the paid tier so the site is not asleep when Google visits.

Expect months, not days. That is not a flaw in the setup — it is how search
works for a new domain.

---

## 5b. The guide pages (your SEO content)

`public/guide/` holds 15 generated pages built from the one dataset this project
has that the big sites do not publish clearly: **published by-major admit rates**.

"Carnegie Mellon admits 11% overall" is on a hundred websites. "Carnegie Mellon
admits 4% to Computer Science and 24% to its policy college" is the number a
student actually needs, and almost nobody states it plainly. The pillar page
ranks all 13 schools by the size of that gap — University of Washington admits
43% overall and 2% to CS, a 21× difference.

- Generated by `node scripts/build-content.js`, which `npm run build:deploy` runs
  automatically — a data correction regenerates the pages rather than orphaning them.
- Only the **13 schools with published figures** get pages. 102 schools × 11 majors
  would be 1,100 thin pages of modelled estimates presented as fact; Google
  penalises that, and it would be dishonest.
- 7 KB each, so they load instantly, and every one links back to the tool.

To add more: get published by-major data for another school, add it to
`src/data/majorAdmissions.js`, and rerun the build. The page writes itself.

## 5c. Analytics (optional, off by default)

Nothing is tracked unless you set one environment variable on the host. Both
options are cookie-free, so no consent banner is needed — which matters for a
tool whose selling point is that it stores nothing.

| Variable | Service |
|---|---|
| `CF_ANALYTICS_TOKEN=…` | Cloudflare Web Analytics — **free**, and you will likely be using Cloudflare anyway |
| `PLAUSIBLE_DOMAIN=yourdomain.com` | Plausible — paid, nicer dashboard |

Set it and restart; no rebuild. The tag is injected at request time, so no
account token is ever committed to your repository, and the Content-Security-
Policy widens automatically to allow that one domain. Google Analytics is
deliberately not wired up: it would require a cookie banner.

## 6. Before you go live — a short checklist

```bash
npm test                        # all checks must pass
bash scripts/build-deploy.sh    # must end with "clean: no secrets"
```

- [ ] `NODE_ENV=production` is set on the host
- [ ] `https://example.com` replaced with your real domain in all three files
- [ ] You opened the live site and ran one analysis end to end
- [ ] You checked the live site on a phone
- [ ] If the repo is public, you confirmed no `.env` file is in it

One thing to decide for yourself: the app tells students their admission odds.
Those are modelled estimates, and the interface says so in several places. Keep
that wording. Tools that imply certainty about admissions outcomes cause real
harm to real teenagers, and the honesty is also what makes yours worth using.
