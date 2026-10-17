#!/usr/bin/env bash
# Store the Claude API key in ~/relayd/.env on the server without echoing it.
# Run from your PC:  ssh -t warpsearn bash relayd/scripts/set-key.sh
# Or: put ANTHROPIC_API_KEY=... in .env.local on your PC, then
#   scp .env.local warpsearn:relayd/.env.local
#   ssh warpsearn bash relayd/scripts/set-key.sh
set -euo pipefail
ENV_FILE="$HOME/relayd/.env"
[ -f "$ENV_FILE" ] || cp "$HOME/relayd/.env.example" "$ENV_FILE"
FROM="$HOME/relayd/.env.local"
if [ -f "$FROM" ]; then
  # Key copied up from the PC with scp; take it and delete the copy.
  # Tolerates Notepad's BOM / CRLF and either "ANTHROPIC_API_KEY=sk-ant-..." or a bare key.
  KEY="$(tr -d '\r' < "$FROM" | grep -m1 -o 'sk-ant-[A-Za-z0-9_-]*' || true)"
  rm -f "$FROM"
else
  read -rsp "Paste your Claude API key, then press Enter: " KEY
  echo
fi
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
case "$KEY" in
  sk-ant-*) ;;
  *) echo "Not saved: the key should start with sk-ant-"; exit 1 ;;
esac
tmp="$(mktemp)"
grep -v '^ANTHROPIC_API_KEY=' "$ENV_FILE" > "$tmp" || true
printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset KEY
echo "Saved OK"
