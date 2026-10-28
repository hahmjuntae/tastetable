#!/usr/bin/env bash
# 배포 주소에 health 와 plan 한 번씩 보내는 점검
set -euo pipefail
URL="${1:-https://tastetable.graphite-site.workers.dev}"
curl -fsS "$URL/api/health"; echo
curl -sS -X POST "$URL/api/plan" -H 'content-type: application/json' \
  -d '{"city":"New York","brief":"Saturday dinner, not too pricey, then drinks","members":[{"name":"Mina","favorites":["Parasite","Norah Jones"]},{"name":"Leo","favorites":["Blade Runner 2049","Daft Punk"]},{"name":"Ava","favorites":["Before Sunrise","Phoebe Bridgers"]}]}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(!r.ok){console.log("FAIL",r.error);process.exit(1)}console.log("modes",JSON.stringify(r.modes));console.log("dinner",r.dinner.name,"lowest",r.dinner.minAffinity);console.log("next",r.nextStop&&r.nextStop.name);console.log("calls",r.trace.length,"non-2xx",r.trace.filter(t=>t.status>=300).length);console.log("headline",r.story.headline)})'
