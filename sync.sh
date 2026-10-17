#!/usr/bin/env bash
# Copy the working tree (everything Git would track, minus .gitignore'd files)
# to the server, without committing. Usage: ./sync.sh
# data/extracted and data/reports are produced on the server, so they are not pushed.
set -euo pipefail
cd "$(dirname "$0")"
git ls-files -co --exclude-standard -z \
  | grep -zv -E '^data/(extracted|reports)/' \
  | tar --null -czf - -T - \
  | ssh warpsearn 'mkdir -p ~/relayd && tar -xzf - -C ~/relayd'
echo "synced to warpsearn:~/relayd"
