#!/usr/bin/env bash
# Replaces the example.com placeholders with your real domain.
#
# Run this once, after the site is live and you have pointed a domain at it.
# Getting it wrong tells Google to index a domain you do not own, so the script
# checks the input and shows you every change it made.
#
#   bash scripts/set-domain.sh mytool.com
#   bash scripts/set-domain.sh https://mytool.com
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW="${1:-}"

if [ -z "$RAW" ]; then
  echo "Usage: bash scripts/set-domain.sh yourdomain.com"
  exit 1
fi

# Accept mytool.com, www.mytool.com, https://mytool.com/ — normalise to a host.
HOST="$(echo "$RAW" | sed -E 's#^https?://##; s#/.*$##')"

if ! echo "$HOST" | grep -qE '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$'; then
  echo "That does not look like a domain: '$RAW'"
  echo "Expected something like: mytool.com  or  www.mytool.com"
  exit 1
fi

if [ "$HOST" = "example.com" ]; then
  echo "example.com is the placeholder — pass your real domain."
  exit 1
fi

FILES="public/index.html public/robots.txt public/sitemap.xml"
echo "Setting domain to: https://$HOST"
echo ""

CHANGED=0
for f in $FILES; do
  n=$(grep -c "example\.com" "$SRC/$f" 2>/dev/null || true)
  if [ "${n:-0}" -gt 0 ]; then
    # macOS and GNU sed take different -i arguments; this form works on both.
    sed -i.bak "s#example\.com#$HOST#g" "$SRC/$f"
    rm -f "$SRC/$f.bak"
    echo "  $f — $n replacement(s)"
    CHANGED=$((CHANGED + n))
  fi
done

echo ""
if [ "$CHANGED" -eq 0 ]; then
  echo "Nothing to change — no example.com placeholders left."
  echo "Current canonical URL:"
  grep -o 'rel="canonical" href="[^"]*"' "$SRC/public/index.html" | sed 's/^/  /'
else
  echo "Done — $CHANGED replacements."
  echo ""
  echo "Check these read correctly:"
  grep -o 'rel="canonical" href="[^"]*"' "$SRC/public/index.html" | sed 's/^/  /'
  grep -o 'property="og:url" content="[^"]*"' "$SRC/public/index.html" | sed 's/^/  /'
  grep -o 'Sitemap: .*' "$SRC/public/robots.txt" | sed 's/^/  /'
  grep -o '<loc>.*</loc>' "$SRC/public/sitemap.xml" | sed 's/^/  /'
fi

echo ""
echo "Next: npm run build:deploy, then upload again."
