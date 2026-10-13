# Getting live — the whole path, step by step

Everything in the repo is ready. What remains needs you signed in to accounts,
which is why it is yours to run. Allow about 40 minutes.

Work through in order. Each part works on its own, so you can stop after Part 2
and have a live site, then do the domain later.

---

## Part 1 — GitHub (10 minutes)

### 1.1 Create the account
[github.com/signup](https://github.com/signup) if you do not have one. Remember
the **username** — it appears in your profile URL, `github.com/<username>`.

### 1.2 Create an empty repository
Go to **[github.com/new](https://github.com/new)**:

| Field | What to put |
|---|---|
| Repository name | `AdmitIt.Pversion` |
| Description | *Admission chances by major for international students* |
| Public or Private | **Private** is the safer default. You can flip it to Public later |
| Add a README file | **Leave unticked** |
| Add .gitignore | **Leave unticked** — "None" |
| Choose a licence | **Leave unticked** |

> Those three must stay unticked. This repo already has a README and a
> .gitignore, and GitHub's versions would collide the first time you push.

Click **Create repository**. You will land on a page saying "Quick setup" — that
is correct. Leave it open.

### 1.3 Push
In Terminal:

```bash
cd ~/Downloads/AdmitIt.Pversion
bash scripts/push-to-github.sh YOUR-GITHUB-USERNAME
```

The script checks for keys and `.env` files before it sends anything, then asks
you to sign in. Two possibilities:

- **A browser window opens** — approve it there. Easiest path.
- **Terminal asks for a username and password.** GitHub no longer accepts your
  account password here. You need a **Personal Access Token**:
  [github.com/settings/tokens](https://github.com/settings/tokens) → *Generate
  new token (classic)* → tick **repo** → Generate → copy it → paste it as the
  **password**. Type it into the Terminal prompt yourself and do not paste it
  into a chat window, including this one.

Refresh your GitHub page. Your code is there.

---

## Part 2 — Put the site on the internet (15 minutes)

[Render](https://render.com) is the recommendation: free tier, automatic HTTPS,
connects straight to GitHub.

### 2.1 Sign up
[dashboard.render.com/register](https://dashboard.render.com/register) → **Sign
up with GitHub**. It will ask permission to see your repositories; approve it.

### 2.2 Create the web service
**New +** (top right) → **Web Service** → pick `AdmitIt.Pversion` → **Connect**.

Then fill in:

| Field | Value |
|---|---|
| Name | `admitit` (becomes `admitit.onrender.com`) |
| Region | whichever is nearest your users |
| Branch | `main` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |

### 2.3 The one setting people skip
Scroll to **Environment Variables** → **Add Environment Variable**:

```
NODE_ENV = production
```

This is what disables the knowledge-base dump endpoint and switches errors to
generic messages. Without it your site runs in development mode in public.

### 2.4 Deploy
Click **Create Web Service**. The log scrolls for 2–3 minutes and ends with:

```
282 documents indexed, no API key required
```

Your URL is at the top of the page. **Open it on your phone**, run one analysis
end to end, and try the chat. That is the real test.

> Free tier sleeps after ~15 minutes idle and takes ~30 seconds to wake. Fine
> for testing. When real students use it, upgrade to Starter ($7/month) —
> a slow first load costs you visitors and Google ranking.

---

## Part 3 — Buy a domain (10 minutes, ~$10/year)

Optional, but `admitit.com` beats `admitit.onrender.com` for both trust and
ranking.

### 3.1 Buy it
**[dash.cloudflare.com](https://dash.cloudflare.com)** → sign up → **Domain
Registration** → **Register Domain** → search your name.

Cloudflare sells at cost with no renewal markup and free WHOIS privacy. Expect
**$10–12/year for a .com**. Skip `.io` (~$35) and `.ai` (~$70) — no SEO benefit
here, and `.com` reads as more legitimate to a student.

### 3.2 Point it at Render
1. Render → your service → **Settings** → **Custom Domains** → **Add Custom Domain**
2. Type your domain. Render shows a DNS record to create
3. Cloudflare → your domain → **DNS** → **Add record** → paste what Render gave you
4. Wait a few minutes. Render shows a green tick and issues HTTPS automatically

### 3.3 Tell the code about it
```bash
cd ~/Downloads/AdmitIt.Pversion
npm run set-domain yourdomain.com
git add -A && git commit -m "Set production domain" && git push
```

Render redeploys automatically on push. This step matters: it rewrites the
canonical link, the social tags and the sitemap. Skipping it tells Google to
index `example.com`.

---

## Part 4 — Get into Google (10 minutes, then wait)

### 4.1 Search Console
**[search.google.com/search-console](https://search.google.com/search-console)**
→ **Add property** → **Domain** → type your domain.

It asks you to add a TXT record to prove ownership. Copy it into Cloudflare →
DNS → Add record → type **TXT**. Back in Search Console, click **Verify**.

### 4.2 Submit the sitemap
Search Console → **Sitemaps** (left menu) → enter `sitemap.xml` → **Submit**.

It already lists all 16 URLs — the tool plus your 15 guide pages.

### 4.3 Ask Google to look now
Paste your homepage URL into the search bar at the top → **Request Indexing**.
Repeat for `yourdomain.com/guide/acceptance-rate-by-major`.

Without this it can take weeks. With it, usually days.

### 4.4 Bing, while you are at it
**[bing.com/webmasters](https://www.bing.com/webmasters)** → Import from Google
Search Console. Five minutes, and it covers ChatGPT search too.

---

## Part 5 — Actually getting users

Search rankings for a new domain take months. This part does not.

1. **Post the pillar page**, not the tool, in
   [r/ApplyingToCollege](https://reddit.com/r/ApplyingToCollege). The hook is a
   fact, not a product: *"UW admits 43% overall and 2% to CS — I compiled
   published by-major admit rates for 13 universities."* Lead with the finding.
   A post that reads like an advert gets removed; one that reads like research
   gets upvoted and links back to you.
2. **Your own school's counsellor**, and any international-student group chat.
   Ten real users will teach you more than a month of guessing.
3. **Watch what breaks.** With analytics on you will see which pages people
   actually read.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| Push rejected, "repository not found" | Repo not created yet, or username typo |
| Push rejected, "updates were rejected" | You ticked "Add a README". Delete the repo and recreate it with nothing ticked |
| Render build fails | Check Build Command is `npm install` and Start is `npm start` |
| Site loads but looks unstyled | Usually a half-finished deploy — check the Render log |
| `/api/rag/search` returns data in public | `NODE_ENV=production` is missing |
| Google shows `example.com` | You skipped `npm run set-domain` |

---

## Total cost

| | |
|---|---|
| GitHub | free |
| Render free tier | free (sleeps when idle) |
| Render Starter | $7/month — worth it once people are using it |
| Domain | ~$10–12/year |
| Analytics | free (Cloudflare) |

**You can be live today for nothing.**
