#!/usr/bin/env bash
# One command to publish this repo to GitHub, once the empty repo exists.
#
#   bash scripts/push-to-github.sh YOUR-GITHUB-USERNAME
#
# Create the empty repo first at https://github.com/new
#   Name: AdmitIt.Pversion
#   Do NOT tick "Add a README", ".gitignore" or "licence" — this repo already
#   has them, and GitHub's versions would collide on the first push.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="${1:-}"
REPO_NAME="${2:-AdmitIt.Pversion}"

if [ -z "$USER_NAME" ]; then
  echo "Usage: bash scripts/push-to-github.sh YOUR-GITHUB-USERNAME"
  echo ""
  echo "Your username is the name in your profile URL: github.com/<username>"
  exit 1
fi

# Running this with the placeholder copied verbatim pointed the remote at
# github.com/YOUR-USERNAME and failed confusingly. Catch it by name.
case "$(echo "$USER_NAME" | tr '[:upper:]' '[:lower:]')" in
  your-github-username|your-username|username|yourusername|my-username)
    echo "'$USER_NAME' is the placeholder, not your username."
    echo ""
    echo "Open https://github.com and look at the top-right avatar menu, or at"
    echo "your profile URL: github.com/<this-part-here>"
    exit 1 ;;
esac

if ! echo "$USER_NAME" | grep -qE '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'; then
  echo "'$USER_NAME' is not a valid GitHub username."
  echo "Usernames are letters, numbers and hyphens only."
  exit 1
fi

cd "$REPO_DIR"

# ── Refuse to publish anything that should not be public ────────────
echo "Checking what is about to be published..."
FAIL=0
if git ls-files | grep -qE '(^|/)\.env'; then echo "  FAIL: a .env file is tracked"; FAIL=1; fi
if git ls-files | grep -q node_modules;   then echo "  FAIL: node_modules is tracked"; FAIL=1; fi
for f in $(git ls-files); do
  if grep -qE 'sk-ant-[A-Za-z0-9_-]{20,}' "$f" 2>/dev/null; then
    echo "  FAIL: an API key appears in $f"; FAIL=1
  fi
done
if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Not pushing. Fix the above first — once something is on GitHub it is copied."
  exit 1
fi
echo "  clean: no keys, no .env, no node_modules"
echo ""

# ── Commit anything outstanding ─────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  echo "Committing outstanding changes..."
  git add -A
  git commit -q -m "Update before publishing"
fi

URL="https://github.com/${USER_NAME}/${REPO_NAME}.git"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$URL"
  echo "Remote updated: $URL"
else
  git remote add origin "$URL"
  echo "Remote added: $URL"
fi

git branch -M main

echo ""
echo "Pushing. GitHub will ask you to sign in — a browser window, or a username"
echo "and a Personal Access Token as the password. Type it into the prompt"
echo "yourself; do not paste a token into a chat."
echo ""

if git push -u origin main; then
  echo ""
  echo "Done. Your code is at:"
  echo "  https://github.com/${USER_NAME}/${REPO_NAME}"
else
  echo ""
  echo "The push failed. The usual causes, in order:"
  echo "  1. The repo does not exist yet — create it at https://github.com/new"
  echo "     named exactly '${REPO_NAME}', with NO README/gitignore/licence ticked."
  echo "  2. The username is wrong — check github.com/<username> in your profile."
  echo "  3. Sign-in was cancelled or the token lacks 'repo' scope."
  exit 1
fi
