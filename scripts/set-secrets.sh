#!/usr/bin/env bash
# 키체인 값을 화면에 띄우지 않고 wrangler secret 으로 전달
set -euo pipefail
cd "$(dirname "$0")/.."

QLOO_ITEM="${QLOO_KEYCHAIN_ITEM:-hackathon-qloo-key}"
LLM_ITEM="${LLM_KEYCHAIN_ITEM:-hackathon-gemini-keit}"

if security find-generic-password -s "$QLOO_ITEM" -w >/dev/null 2>&1; then
  security find-generic-password -s "$QLOO_ITEM" -w | npx wrangler secret put QLOO_API_KEY
else
  echo "skip QLOO_API_KEY: keychain item $QLOO_ITEM not found"
fi

if security find-generic-password -s "$LLM_ITEM" -w >/dev/null 2>&1; then
  security find-generic-password -s "$LLM_ITEM" -w | npx wrangler secret put LLM_API_KEY
else
  echo "skip LLM_API_KEY: keychain item $LLM_ITEM not found"
fi
