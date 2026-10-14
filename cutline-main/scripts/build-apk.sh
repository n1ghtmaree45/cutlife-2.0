#!/usr/bin/env bash
# Build a signed Cutline APK (Trusted Web Activity) with Bubblewrap.
# Usage: scripts/build-apk.sh [domain]   (default: $CUTLINE_DOMAIN or cutline.vercel.app)
# Prereqs: the site is live on Vercel at https://<domain>/ and the manifest loads there.
set -euo pipefail
DOMAIN="${1:-${CUTLINE_DOMAIN:-cutline.vercel.app}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a
DOMAIN="${1:-${CUTLINE_DOMAIN:-cutline.vercel.app}}"
export JAVA_HOME="${JAVA_HOME:-$HOME/jdk17}" ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
HOST="${DOMAIN#https://}"; HOST="${HOST%%/*}"
PKG="${CUTLINE_PACKAGE_ID:-app.cutline.twa}"
URL="https://$HOST/manifest.webmanifest"
curl -fsS "$URL" >/dev/null || { echo "Manifest not reachable at $URL. Deploy first."; exit 1; }

OUT="$ROOT/android"; mkdir -p "$OUT"; cd "$OUT"
# Generate twa-manifest.json non-interactively, then fix key fields.
bubblewrap init --manifest="$URL" --directory="$OUT" </dev/null || true
node - "$OUT/twa-manifest.json" "$PKG" "$HOST" "$ROOT/$CUTLINE_KEYSTORE" "$CUTLINE_KEY_ALIAS" <<'JS'
const fs=require('fs');const [f,pkg,host,ks,alias]=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(f));
Object.assign(m,{packageId:pkg,host,name:'Cutline',launcherName:'Cutline',
 themeColor:'#1B5E20',navigationColor:'#0E1A10',backgroundColor:'#0E1A10',
 startUrl:'/',display:'standalone',enableNotifications:false,
 fallbackType:'customtabs',signingKey:{path:ks,alias}});
fs.writeFileSync(f,JSON.stringify(m,null,2));
JS
bubblewrap update --skipVersionUpgrade
BUBBLEWRAP_KEYSTORE_PASSWORD="$CUTLINE_KEYSTORE_PASSWORD" BUBBLEWRAP_KEY_PASSWORD="$CUTLINE_KEY_PASSWORD" \
  bubblewrap build --skipPwaValidation
# Point assetlinks template at the real package name.
sed -i "s/\"package_name\": \"[^\"]*\"/\"package_name\": \"$PKG\"/" "$ROOT/public/.well-known/assetlinks.json"
echo "APK: $OUT/app-release-signed.apk"
echo "Package: $PKG. Commit public/.well-known/assetlinks.json and redeploy; verify https://$HOST/.well-known/assetlinks.json"
