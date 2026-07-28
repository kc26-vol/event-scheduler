#!/usr/bin/env bash
# 本番データをローカルへバックアップする。
#
# デプロイ前に必ず実行される (Makefile の deploy が backup に依存)。
# アプリ自身のバックアップAPI (GET /api/export/backup) を使うため、
# DB本体・アップロード画像・設定がまとめて1つのzipに入る。
#
# 必要な環境変数 (.env.prod から読み込まれる):
#   AZURE_WEBAPP_NAME, APP_PASSWORD
set -euo pipefail

: "${AZURE_WEBAPP_NAME:?AZURE_WEBAPP_NAME が未設定です}"
: "${APP_PASSWORD:?APP_PASSWORD が未設定です (.env.prod を確認してください)}"

URL="https://${AZURE_WEBAPP_NAME}.azurewebsites.net"
TS="$(date +%Y%m%d-%H%M%S)"
DIR="backups"
ZIP="${DIR}/prod-${TS}.zip"
COUNTS="${DIR}/prod-${TS}.counts.json"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

mkdir -p "$DIR"

echo "[backup] ログイン中: ${URL}"
LOGIN_BODY="$(python3 -c "import json,os;print(json.dumps({'password':os.environ['APP_PASSWORD']}))")"
CODE="$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' \
  -X POST "${URL}/auth/verify" \
  -H 'Content-Type: application/json' \
  --data-binary "$LOGIN_BODY")"
if [ "$CODE" != "200" ]; then
  echo "[backup] ERROR: ログインに失敗しました (HTTP $CODE)。APP_PASSWORD を確認してください" >&2
  exit 1
fi

# バックアップzipの生成は F1 プランだと数分かかる
echo "[backup] バックアップを取得中 (数分かかります)..."
CODE="$(curl -s -b "$JAR" --max-time 900 -o "$ZIP" -w '%{http_code}' "${URL}/api/export/backup")"
if [ "$CODE" != "200" ]; then
  echo "[backup] ERROR: バックアップ取得に失敗しました (HTTP $CODE)" >&2
  rm -f "$ZIP"
  exit 1
fi

# zipが壊れていないか、data.json が入っているかを検証する
if ! unzip -l "$ZIP" | grep -q 'data.json'; then
  echo "[backup] ERROR: data.json を含まない不正なバックアップです" >&2
  rm -f "$ZIP"
  exit 1
fi

# 件数を記録しておき、デプロイ後の検証 (prod_verify.sh) と突き合わせる
unzip -p "$ZIP" data.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
counts = {k: len(v) for k, v in d.items() if isinstance(v, list)}
json.dump(counts, open('$COUNTS', 'w'), indent=2)
print('[backup] 件数: ' + ', '.join(f'{k}={v}' for k, v in counts.items()))
"

echo "[backup] 保存しました: ${ZIP} ($(du -h "$ZIP" | cut -f1))"
echo "$ZIP" > "${DIR}/.latest"
