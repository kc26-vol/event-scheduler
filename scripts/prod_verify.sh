#!/usr/bin/env bash
# デプロイ後にデータが失われていないかを確認する。
#
# 直前の prod_backup.sh が記録した件数と、デプロイ後の実際の件数を突き合わせる。
# 1件でも減っていれば異常として非0で終了する
# (自動配置などで assignments が増えるのは正常なので、増加は許容する)。
set -euo pipefail

: "${AZURE_WEBAPP_NAME:?AZURE_WEBAPP_NAME が未設定です}"
: "${APP_PASSWORD:?APP_PASSWORD が未設定です}"

URL="https://${AZURE_WEBAPP_NAME}.azurewebsites.net"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

BASELINE=""
if [ -f backups/.latest ]; then
  BASELINE="$(cat backups/.latest)"
  BASELINE="${BASELINE%.zip}.counts.json"
fi

echo "[verify] アプリの起動を確認中: ${URL}"
for i in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${URL}/login.html" || true)"
  [ "$CODE" = "200" ] && break
  echo "[verify]   待機中... (${i}/30, HTTP ${CODE})"
  sleep 10
done
if [ "$CODE" != "200" ]; then
  echo "[verify] ERROR: アプリが応答しません (HTTP $CODE)" >&2
  exit 1
fi

LOGIN_BODY="$(python3 -c "import json,os;print(json.dumps({'password':os.environ['APP_PASSWORD']}))")"
CODE="$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' \
  -X POST "${URL}/auth/verify" -H 'Content-Type: application/json' \
  --data-binary "$LOGIN_BODY")"
if [ "$CODE" != "200" ]; then
  echo "[verify] ERROR: ログインに失敗しました (HTTP $CODE)" >&2
  exit 1
fi

# 一覧APIの件数を数える (バックアップ全体を取り直すより速い)
echo "[verify] データ件数を確認中..."
for ep in sessions staffs rooms; do
  N="$(curl -s -b "$JAR" --max-time 120 "${URL}/api/${ep}/" \
       | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "ERR")"
  echo "  ${ep}=${N}"
  eval "NOW_${ep}=\$N"
done

if [ -z "$BASELINE" ] || [ ! -f "$BASELINE" ]; then
  echo "[verify] 比較対象のバックアップがないため件数比較はスキップします"
  exit 0
fi

BASELINE="$BASELINE" NOW_SESSIONS="${NOW_sessions:-ERR}" NOW_STAFFS="${NOW_staffs:-ERR}" \
NOW_ROOMS="${NOW_rooms:-ERR}" python3 <<'PY'
import json, os, sys

base = json.load(open(os.environ['BASELINE']))
now = {
    'sessions': os.environ['NOW_SESSIONS'],
    'staffs':   os.environ['NOW_STAFFS'],
    'rooms':    os.environ['NOW_ROOMS'],
}
lost = []
for k, v in now.items():
    if v == 'ERR':
        lost.append(f"{k}: 取得失敗")
        continue
    before, after = base.get(k), int(v)
    if before is None:
        continue
    if after < before:
        lost.append(f"{k}: {before} -> {after} ({before - after} 件減少)")

if lost:
    print("[verify] !!! データが減少しています !!!", file=sys.stderr)
    for line in lost:
        print(f"  {line}", file=sys.stderr)
    print(f"[verify] 直前のバックアップから復元してください: {os.environ['BASELINE'].replace('.counts.json', '.zip')}", file=sys.stderr)
    sys.exit(1)

print("[verify] OK: データ件数に減少はありません")
PY
