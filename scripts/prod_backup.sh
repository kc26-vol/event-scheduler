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

# バックアップzipの生成は F1 プランだと数分かかる。
# 応答は 90MB 前後の chunked ストリームで、途中で切れても
# ヘッダは既に返っているため HTTP 200 のまま壊れたzipになることがある。
# そのため HTTP ステータスだけでなく curl の終了コードと zip の中身も見る。
fetch_backup() {
  local code rc
  set +e
  code="$(curl -s -b "$JAR" --max-time 900 -o "$ZIP" -w '%{http_code}' "${URL}/api/export/backup")"
  rc=$?
  set -e
  if [ "$rc" != "0" ]; then
    echo "[backup]   転送が中断しました (curl exit $rc)" >&2
    return 1
  fi
  if [ "$code" != "200" ]; then
    echo "[backup]   取得に失敗しました (HTTP $code)" >&2
    return 1
  fi
  # -l ではなく -t を使う。転送が途中で切れた zip は
  # ローカルヘッダが読めるため -l や -p は通ってしまい、壊れたバックアップを
  # 「取得できた」と誤判定する。CRC まで検証する -t でないと検出できない。
  if ! unzip -t "$ZIP" >/dev/null 2>&1; then
    echo "[backup]   zipが壊れています (転送が途中で切れた可能性)" >&2
    return 1
  fi
  if ! unzip -l "$ZIP" | grep -q 'data.json'; then
    echo "[backup]   data.json を含まない応答でした" >&2
    return 1
  fi
  return 0
}

echo "[backup] バックアップを取得中 (数分かかります)..."
ATTEMPTS=3
OK=0
for i in $(seq 1 "$ATTEMPTS"); do
  if [ "$i" -gt 1 ]; then echo "[backup] 取り直します (${i}/${ATTEMPTS})..."; fi
  if fetch_backup; then OK=1; break; fi
done
if [ "$OK" != "1" ]; then
  echo "[backup] ERROR: バックアップを取得できませんでした (${ATTEMPTS}回試行)" >&2
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
