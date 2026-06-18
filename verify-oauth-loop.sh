#!/usr/bin/env bash
# Full OAuth loop proof: DCR register -> password authorize -> token -> authed /mcp.
# Run:  bash verify-oauth-loop.sh
# Prompts for BRAIN_PASSWORD (never echoed, never stored).
set -euo pipefail
B=https://brain-mcp-server.trentbelasco.workers.dev

read -rsp "BRAIN_PASSWORD: " PW; echo

# PKCE pair (S256)
VERIFIER=$(openssl rand -base64 60 | tr -d '\n=+/' | cut -c1-64)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -binary -sha256 | openssl base64 | tr '+/' '-_' | tr -d '=\n')

echo "== 1. DCR register =="
REG=$(curl -s -X POST "$B/register" -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://example.com/callback"],"token_endpoint_auth_method":"none","grant_types":["authorization_code","refresh_token"],"response_types":["code"]}')
CID=$(printf '%s' "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["client_id"])')
echo "client_id=$CID"

echo "== 2. POST /authorize (password) -> expect 302 with ?code= =="
LOC=$(curl -s -o /dev/null -D - -X POST "$B/authorize" \
  --data-urlencode "password=$PW" \
  --data-urlencode "response_type=code" \
  --data-urlencode "client_id=$CID" \
  --data-urlencode "redirect_uri=https://example.com/callback" \
  --data-urlencode "scope=brain:read" \
  --data-urlencode "state=xyz" \
  --data-urlencode "code_challenge=$CHALLENGE" \
  --data-urlencode "code_challenge_method=S256" \
  | grep -i '^location:' | sed 's/location: //I' | tr -d '\r')
echo "redirect=$LOC"
CODE=$(printf '%s' "$LOC" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')
if [ -z "$CODE" ]; then echo "FAIL: no code in redirect (wrong password or authorize error)"; exit 1; fi
echo "code=$CODE"

echo "== 3. token exchange =="
TOK=$(curl -s -X POST "$B/token" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=$CODE" \
  --data-urlencode "redirect_uri=https://example.com/callback" \
  --data-urlencode "client_id=$CID" \
  --data-urlencode "code_verifier=$VERIFIER")
AT=$(printf '%s' "$TOK" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
if [ -z "$AT" ]; then echo "FAIL: no access_token. resp: $TOK"; exit 1; fi
echo "access_token acquired (len ${#AT})"

echo "== 4. authed POST /mcp tools/list -> expect the 5 brain tools =="
curl -s -X POST "$B/mcp" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
echo
echo "== DONE: if you see brain_search/brain_browse/brain_context/brain_r2_list/brain_r2_read above, the full OAuth loop works. =="
