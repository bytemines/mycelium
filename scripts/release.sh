#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-patch}"
CHANGELOG_FILE="${2:-}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major] [changelog-file]"
  echo "  changelog-file: path to a file with the AI-written changelog (optional)"
  exit 1
fi

# Find last release tag
LAST_TAG=$(git tag --list --sort=-creatordate | head -1)
RANGE="${LAST_TAG:+${LAST_TAG}..HEAD}"
RANGE="${RANGE:-HEAD}"

echo "  Bump:  $BUMP"
echo "  Since: ${LAST_TAG:-beginning}"
echo ""

# Get changelog content
if [[ -n "$CHANGELOG_FILE" && -f "$CHANGELOG_FILE" ]]; then
  SUMMARY=$(cat "$CHANGELOG_FILE")
  echo "  Using changelog from: $CHANGELOG_FILE"
elif [[ -n "$CHANGELOG_FILE" ]]; then
  echo "  Error: changelog file not found: $CHANGELOG_FILE"
  exit 1
else
  # Fallback: git log (only if no AI changelog provided)
  SUMMARY=$(git log "$RANGE" --pretty=format:"- %s" --no-merges 2>/dev/null | head -20)
  echo "  Warning: no changelog file provided, using git commits"
fi

if [[ -z "$SUMMARY" ]]; then
  echo "  No changes to release."
  exit 0
fi

echo ""
echo "  Changelog:"
echo "$SUMMARY"
echo ""

# Create changeset file
CHANGESET_FILE=".changeset/release-$(date +%s).md"
cat > "$CHANGESET_FILE" <<EOF
---
"@mycelish/core": $BUMP
"@mycelish/cli": $BUMP
---

$SUMMARY
EOF

echo "  Created $CHANGESET_FILE"

# Version (bumps package.json + writes to CHANGELOG.md)
pnpm changeset version
echo "  Versioned packages"

# Read new version
NEW_VERSION=$(node -p "require('./packages/core/package.json').version")
echo "  New version: $NEW_VERSION"

# Build + test
pnpm build
echo "  Built all packages"

# Commit
git add -A
git commit -m "$(cat <<EOF
release: v${NEW_VERSION}

${SUMMARY}
EOF
)"

echo "  Committed"

# Push — GitHub Actions (publish.yml) handles npm publish + GitHub release creation
git push
echo ""
echo "  Pushed to main — GitHub Actions will publish v${NEW_VERSION} and create the release."
echo "  The changelog above will appear as the GitHub release notes."
