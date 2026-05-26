#!/usr/bin/env bash
# Bump the version in manifest.json, commit, tag, and push.
# The push triggers .github/workflows/release.yml which builds the zip,
# uploads it to the Chrome Web Store as a draft, and attaches the zip
# to a GitHub Release.
#
# Usage: ./scripts/release.sh 1.0.2

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?usage: $0 <version>, e.g. 1.0.2}"

if ! [[ "$VERSION" =~ ^[0-9]+(\.[0-9]+){1,3}$ ]]; then
  echo "Version must look like X.Y.Z (or X.Y.Z.W)" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit or stash before releasing." >&2
  exit 1
fi

# In-place version bump that preserves the rest of the manifest.
sed -i.bak -E 's/("version": *)"[^"]+"/\1"'"$VERSION"'"/' manifest.json
rm manifest.json.bak

git add manifest.json
git commit -m "v$VERSION"
git tag "v$VERSION"

echo
echo "Tagged v$VERSION."
echo "Push with:  git push && git push origin v$VERSION"
