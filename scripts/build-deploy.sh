#!/usr/bin/env bash
# Builds a clean folder containing ONLY what the public site needs.
#
# Why this exists: the project folder also holds three live API keys
# (./.env, trend/.env, ultrawork/.env) and four unrelated apps. Uploading
# the folder as-is would publish all of them. This script copies the app
# out rather than trusting anyone to remember what to leave behind, and
# then refuses to finish if a secret made it in.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$SRC/../cca-deploy}"

# Guide pages are generated from the admissions data, so rebuild them first —
# otherwise a data correction would ship without the pages reflecting it.
echo "Generating guide pages..."
node "$SRC/scripts/build-content.js"
echo ""
echo "Building deploy folder at: $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# ── Only these paths ship ───────────────────────────────────────────
cp -R "$SRC/public" "$OUT/public"
cp -R "$SRC/src"    "$OUT/src"
cp    "$SRC/server-rag.js" "$OUT/"

# Local machine config and test files are not needed in production.
rm -rf "$OUT/src/rag/test.js" "$OUT/src/rag/evalRetrieval.js" \
       "$OUT/src/data/buildOutcomes.js" "$OUT/src/data/auditData.js"
find "$OUT" -name '.DS_Store' -delete 2>/dev/null || true

# ── A package.json with only what the public server loads ───────────
# @anthropic-ai/sdk, cors, dotenv and pdfkit are deliberately absent:
# the public build never calls an API and never reads a key, and the
# smaller the dependency list the smaller the supply-chain surface.
cat > "$OUT/package.json" <<'JSON'
{
  "name": "college-consultant-assistant",
  "version": "1.0.0",
  "private": true,
  "description": "Admission chances and application planner for international students.",
  "main": "server-rag.js",
  "engines": { "node": ">=18" },
  "scripts": { "start": "node server-rag.js" },
  "dependencies": {
    "compression": "^1.8.2",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "pdf-lib": "^1.17.1"
  }
}
JSON

cat > "$OUT/.gitignore" <<'JSON'
node_modules/
.env
.env.*
.DS_Store
JSON

# ── Refuse to ship if anything sensitive slipped through ────────────
echo ""
echo "Checking the output for secrets..."
FAIL=0

if find "$OUT" -name '.env*' | grep -q .; then
  echo "  FAIL: an .env file is in the deploy folder"; FAIL=1
fi
if grep -rlE 'sk-ant-|ANTHROPIC_API_KEY' "$OUT" 2>/dev/null | grep -q .; then
  echo "  FAIL: an API key or key name appears in the deploy folder"; FAIL=1
fi
if grep -rl '/Users/' "$OUT" --include='*.js' --include='*.json' --include='*.html' 2>/dev/null | grep -q .; then
  echo "  FAIL: an absolute path containing your username is present"; FAIL=1
fi
for d in trend ultrawork video-downloader "vid downloader"; do
  if [ -e "$OUT/$d" ]; then echo "  FAIL: unrelated project '$d' was copied"; FAIL=1; fi
done
if [ -e "$OUT/server.js" ]; then
  echo "  FAIL: server.js (the API-key build) was copied"; FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Deploy folder is NOT safe to upload. Fix the above first."
  exit 1
fi

echo "  clean: no secrets, no personal paths, no unrelated projects"
echo ""
echo "Size: $(du -sh "$OUT" | cut -f1)"
echo "Done. Upload the contents of: $OUT"
