#!/usr/bin/env bash
# Copy the working tree (everything Git would track, minus .gitignore'd files)
# to the server, without committing. Usage: ./sync.sh
set -euo pipefail
cd "$(dirname "$0")"
git ls-files -co --exclude-standard -z | tar --null -czf - -T - | ssh warpsearn 'mkdir -p ~/relayd && tar -xzf - -C ~/relayd'
echo "synced to warpsearn:~/relayd"
