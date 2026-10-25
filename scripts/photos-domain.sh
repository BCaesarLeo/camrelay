#!/bin/bash
# Put a real name on the photo links: https://photos.dcav.pro → CloudFront E62FXWFWA30RW.
#   1. Amazon certificate for photos.dcav.pro (DNS validation record added in Cloudflare)
#   2. attach the name + certificate to the distribution
#   3. CNAME photos.dcav.pro → d2kzchvzabp5a9.cloudfront.net (DNS only)
#   4. switch the kiosk's link domain, rebuild, restart
# Safe to re-run: every step checks what already exists.
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN=photos.dcav.pro
DIST_ID=E62FXWFWA30RW
CF_HOST=d2kzchvzabp5a9.cloudfront.net
ZONE=d6fd1a8b95267b3d25bdd53404d85917
export AWS_DEFAULT_REGION=us-east-1
export PATH="$HOME/.nvm/versions/node/v20.17.0/bin:$PATH"

# credentials (never printed)
while IFS= read -r line; do case "$line" in AWS_*=*) export "$line";; esac; done < .env
CLOUDFLARE_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$HOME/dev/dcav/dcav_website/.env.local" | cut -d= -f2- | tr -d '"'"'"' ')
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "No Cloudflare token found"; exit 1; }
export CLOUDFLARE_API_TOKEN

cf() { # method path [json]
  curl -s -X "$1" "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records$2" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" ${3:+--data "$3"}
}
# create-or-update a DNS-only CNAME
cf_cname() { # name target
  local id
  id=$(cf GET "?type=CNAME&name=$1" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")
  if [ -n "$id" ]; then
    cf PATCH "/$id" "{\"type\":\"CNAME\",\"name\":\"$1\",\"content\":\"$2\",\"ttl\":300,\"proxied\":false}" | python3 -c "import json,sys; print('  updated' if json.load(sys.stdin)['success'] else '  UPDATE FAILED')"
  else
    cf POST "" "{\"type\":\"CNAME\",\"name\":\"$1\",\"content\":\"$2\",\"ttl\":300,\"proxied\":false}" | python3 -c "import json,sys; r=json.load(sys.stdin); print('  created' if r['success'] else '  CREATE FAILED: '+str(r['errors']))"
  fi
}

echo "== 1. certificate for $DOMAIN"
ARN=$(aws acm list-certificates --output json | python3 -c "
import json,sys
for c in json.load(sys.stdin)['CertificateSummaryList']:
    if c['DomainName']=='$DOMAIN' and c.get('Status') in ('ISSUED','PENDING_VALIDATION'): print(c['CertificateArn']); break")
if [ -z "$ARN" ]; then
  ARN=$(aws acm request-certificate --domain-name "$DOMAIN" --validation-method DNS --output text --query CertificateArn)
  echo "  requested ${ARN##*/}"
  sleep 10
else
  echo "  reusing ${ARN##*/}"
fi

echo "== 2. validation record in Cloudflare"
for i in $(seq 1 12); do
  read -r VNAME VVALUE < <(aws acm describe-certificate --certificate-arn "$ARN" --output json | python3 -c "
import json,sys
rr=json.load(sys.stdin)['Certificate']['DomainValidationOptions'][0].get('ResourceRecord')
print((rr['Name'].rstrip('.')+' '+rr['Value'].rstrip('.')) if rr else ' ')")
  [ -n "${VNAME// /}" ] && break
  sleep 5
done
[ -n "${VNAME// /}" ] || { echo "  Amazon has not produced the validation record yet; run again in a minute"; exit 1; }
echo "  $VNAME → $VVALUE"
cf_cname "$VNAME" "$VVALUE"

echo "== 3. waiting for Amazon to issue the certificate (usually 2–5 min)"
for i in $(seq 1 60); do
  STATUS=$(aws acm describe-certificate --certificate-arn "$ARN" --output text --query Certificate.Status)
  [ "$STATUS" = "ISSUED" ] && break
  printf '  %s (%ds)\r' "$STATUS" $((i*15)); sleep 15
done
echo; [ "$STATUS" = "ISSUED" ] || { echo "  still $STATUS — run this script again later; nothing is broken"; exit 1; }
echo "  ISSUED"

echo "== 4. attach $DOMAIN to CloudFront $DIST_ID"
aws cloudfront get-distribution-config --id "$DIST_ID" --output json > /tmp/dist.json
ETAG=$(python3 -c "import json; print(json.load(open('/tmp/dist.json'))['ETag'])")
python3 - "$ARN" <<'EOF'
import json,sys
d=json.load(open('/tmp/dist.json'))['DistributionConfig']
if 'photos.dcav.pro' not in d['Aliases'].get('Items',[]):
    d['Aliases']={'Quantity':1,'Items':['photos.dcav.pro']}
d['ViewerCertificate']={'ACMCertificateArn':sys.argv[1],'SSLSupportMethod':'sni-only','MinimumProtocolVersion':'TLSv1.2_2021','Certificate':sys.argv[1],'CertificateSource':'acm'}
json.dump(d,open('/tmp/dist-new.json','w'))
EOF
aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config file:///tmp/dist-new.json --output text --query 'Distribution.Status' | sed 's/^/  distribution: /'

echo "== 5. CNAME $DOMAIN → $CF_HOST"
cf_cname "$DOMAIN" "$CF_HOST"

echo "== 6. kiosk links now use https://$DOMAIN"
sed -i '' "s|const CDN_DOMAIN = \"https://$CF_HOST\";|const CDN_DOMAIN = \"https://$DOMAIN\";|" server/delivery/cloud.ts
grep -q "https://$DOMAIN" server/delivery/cloud.ts && echo "  cloud.ts updated" || { echo "  cloud.ts NOT updated"; exit 1; }
npm run build 2>&1 | grep -E "error|built in" | sed 's/^/  /'
pkill -f "dist/server/server/index.js" || true; sleep 3
(nohup npm start >> /tmp/cam-kiosk.log 2>&1 &)
sleep 10
curl -s -m 5 -o /dev/null -w "  kiosk HTTP %{http_code}\n" http://localhost:3100/api/config

echo "== 7. waiting for the new name to answer (CloudFront deploys in ~5 min)"
for i in $(seq 1 40); do
  CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "https://$DOMAIN/site/sample-download/index.html" || true)
  [ "$CODE" = "200" ] && break
  printf '  HTTP %s (%ds)\r' "$CODE" $((i*15)); sleep 15
done
echo
[ "$CODE" = "200" ] && echo "DONE — https://$DOMAIN/site/sample-download/index.html works" || echo "Not answering yet (HTTP $CODE). It will within a few minutes; links already sent keep working on the old address."
