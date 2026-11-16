#!/bin/zsh
set -eu
cd -- "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run this local test workspace."
  read -r "?Press Return to close."
  exit 1
fi
exec node workspace/server.mjs
