# Event Scheduler — デプロイ用 Makefile
#
#   make deploy         フロントエンドをビルドして Azure へデプロイ
#   make sync-settings  .env.prod のアプリ設定を Azure へ反映 (明示実行のみ)
#
# 接続先とシークレットは .env.prod から読み込みます (.gitignore 済み)。
# 初回は `cp .env.prod.example .env.prod` して値を埋めてください。

SHELL := /bin/bash
.DEFAULT_GOAL := help

ENV_FILE ?= .env.prod
ZIP      := .deploy/deploy.zip

# .env.prod は make の include ではなく各レシピ内で source する。
# シークレットに # や空白が含まれても壊れないようにするため。
# 相対パスは ./ を付ける ($PATH 探索を避けるため)。絶対パスはそのまま使う。
# shell の case は使わない (macOS の bash 3.2 は $() 内の case を解析できない)。
ENV_PATH = $(if $(filter /%,$(ENV_FILE)),$(ENV_FILE),./$(ENV_FILE))
LOAD_ENV = set -a && . "$(ENV_PATH)" && set +a

# make sync-settings で Azure に反映するキー。
# ここに無いキーは .env.prod に書いても反映されない。
SYNC_KEYS := APP_PASSWORD SESSION_SECRET RESET_PASSWORD DATA_DIR TZ \
             SCM_DO_BUILD_DURING_DEPLOYMENT WEBSITE_HTTPLOGGING_RETENTION_DAYS

# デプロイzipに入れてはいけないもの。zip は .gitignore を見ないので、
# .gitignore と別にここでも除外する必要がある。
#   .env*                       本番シークレット
#   infra/*, *.tfstate*, *.tfvars, tfplan
#                               Terraform の state と変数。シークレットが平文で入る
#   backups/*                   本番データのダンプ。1ファイル数十MBあり、
#                               取るたびに増えてデプロイzipが際限なく肥大化する
ZIP_EXCLUDES := ".git/*" ".venv/*" "venv/*" "*/node_modules/*" "node_modules/*" \
                "*__pycache__/*" "*.pyc" ".pytest_cache/*" ".idea/*" ".claude/*" \
                "data/*" "public_snapshots/*" "uploads/*" "*.db" ".env*" ".deploy/*" \
                "backups/*" "infra/*" "*.tfstate" "*.tfstate.*" "*.tfvars" "tfplan" \
                ".DS_Store" "*/.DS_Store"

.PHONY: help check-env check-data-dir backup build package deploy deploy-no-backup \
        verify sync-settings test logs open clean

help: ## コマンド一覧を表示
	@echo "Event Scheduler デプロイ"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo

check-env:
	@test -f $(ENV_FILE) || { \
	  echo "ERROR: $(ENV_FILE) がありません。"; \
	  echo "       cp .env.prod.example $(ENV_FILE) && chmod 600 $(ENV_FILE)"; exit 1; }
	@$(LOAD_ENV) && test -n "$$AZURE_WEBAPP_NAME" \
	  || { echo "ERROR: AZURE_WEBAPP_NAME が $(ENV_FILE) に設定されていません"; exit 1; }
	@$(LOAD_ENV) && test -n "$$AZURE_RESOURCE_GROUP" \
	  || { echo "ERROR: AZURE_RESOURCE_GROUP が $(ENV_FILE) に設定されていません"; exit 1; }
	@az account show >/dev/null 2>&1 \
	  || { echo "ERROR: Azure にログインしていません。'az login' を実行してください"; exit 1; }
	@# az のログイン先が意図した本番サブスクリプションかを確認する。
	@# ここを見ないと、別サブスクリプションに向いたまま deploy まで進んでしまう。
	@$(LOAD_ENV) && { [ -z "$$AZURE_SUBSCRIPTION" ] \
	    || [ "$$(az account show --query id -o tsv)" = "$$AZURE_SUBSCRIPTION" ]; } \
	  || { echo "ERROR: az の現在のサブスクリプションが AZURE_SUBSCRIPTION と一致しません。"; \
	       echo "       az account set --subscription \"$$AZURE_SUBSCRIPTION\""; exit 1; }

# zipデプロイは wwwroot を丸ごと置き換えるため、wwwroot 配下に実データがあると消える。
# DB・アップロード画像は必ず wwwroot の外 (/home/data) に置くこと。
check-data-dir: check-env ## 本番の DATA_DIR が永続領域を指しているか検証
	@$(LOAD_ENV) && D=$$(az webapp config appsettings list \
	    --name "$$AZURE_WEBAPP_NAME" --resource-group "$$AZURE_RESOURCE_GROUP" \
	    --query "[?name=='DATA_DIR'].value | [0]" -o tsv) || \
	    { echo "ERROR: アプリ設定の取得に失敗しました"; exit 1; }; \
	  if [ -z "$$D" ] || [ "$$D" = "None" ]; then \
	    echo "ERROR: 本番の DATA_DIR が未設定です。"; \
	    echo "       未設定だと DB が wwwroot 配下に作られ、デプロイで消えます。"; \
	    echo "       'make sync-settings' で DATA_DIR=/home/data を設定してください。"; exit 1; \
	  fi; \
	  case "$$D" in \
	    /home/site/wwwroot*) \
	      echo "ERROR: DATA_DIR ($$D) が wwwroot 配下です。デプロイで消えます。"; exit 1 ;; \
	    /home/*) : ;; \
	    *) echo "ERROR: DATA_DIR ($$D) が永続領域 (/home 配下) ではありません。"; exit 1 ;; \
	  esac; \
	  echo "OK: DATA_DIR=$$D (永続領域・wwwroot の外)"

backup: check-env ## 本番データをローカルへバックアップ (backups/ に保存)
	@$(LOAD_ENV) && bash scripts/prod_backup.sh

verify: check-env ## デプロイ後にアプリ起動とデータ件数を確認
	@$(LOAD_ENV) && bash scripts/prod_verify.sh

build: ## フロントエンドをビルド (frontend/dist を生成)
	cd frontend && pnpm install --frozen-lockfile && pnpm build

package: build
	@mkdir -p .deploy && rm -f $(ZIP)
	@zip -r -q $(ZIP) . -x $(ZIP_EXCLUDES)
	@test -n "$$(unzip -l $(ZIP) | grep 'frontend/dist/assets/')" \
	  || { echo "ERROR: frontend/dist がパッケージに含まれていません"; exit 1; }
	@BAD="$$(unzip -l $(ZIP) | awk '{print $$4}' \
	   | grep -E '(^|/)\.env|\.tfstate|\.tfvars|(^|/)tfplan$$|^backups/' || true)"; \
	  test -z "$$BAD" || { \
	    echo "ERROR: シークレットまたは本番データがパッケージに混入しています:"; \
	    echo "$$BAD" | sed 's/^/  /' | head -20; exit 1; }
	@echo "packaged: $(ZIP) ($$(du -h $(ZIP) | cut -f1))"

# check-data-dir → backup → package の順に必ず通す。
# DATA_DIR 検証かバックアップ取得が失敗した時点で、デプロイまで到達しない。
deploy: check-env check-data-dir backup package ## バックアップ→デプロイ→検証 (通常はこれを使う)
	@$(LOAD_ENV) && echo "デプロイ先: $$AZURE_WEBAPP_NAME ($$AZURE_RESOURCE_GROUP)"
	@$(LOAD_ENV) && az webapp deploy \
	  --name "$$AZURE_WEBAPP_NAME" \
	  --resource-group "$$AZURE_RESOURCE_GROUP" \
	  --src-path $(ZIP) --type zip
	@$(MAKE) --no-print-directory verify
	@$(LOAD_ENV) && echo "完了: https://$$AZURE_WEBAPP_NAME.azurewebsites.net"

# バックアップを飛ばす緊急用。データ消失時に復元できなくなるため通常は使わない。
deploy-no-backup: check-env check-data-dir package ## [非推奨] バックアップ無しでデプロイ
	@echo "警告: バックアップを取らずにデプロイします。"
	@read -r -p "本当に続けますか? [y/N] " ans; \
	  [ "$$ans" = "y" ] || { echo "中止しました"; exit 1; }
	@$(LOAD_ENV) && az webapp deploy \
	  --name "$$AZURE_WEBAPP_NAME" \
	  --resource-group "$$AZURE_RESOURCE_GROUP" \
	  --src-path $(ZIP) --type zip
	@$(MAKE) --no-print-directory verify

sync-settings: check-env ## .env.prod のアプリ設定を Azure へ反映 (本番を変更します)
	@$(LOAD_ENV) && echo "対象: $$AZURE_WEBAPP_NAME ($$AZURE_RESOURCE_GROUP)"
	@echo "反映キー: $(SYNC_KEYS)"
	@echo "※ ここに無い既存キーは削除されず、そのまま残ります。"
	@read -r -p "本番のアプリ設定を上書きします。続けますか? [y/N] " ans; \
	  [ "$$ans" = "y" ] || { echo "中止しました"; exit 1; }
	@mkdir -p .deploy
	@$(LOAD_ENV) && SYNC_KEYS="$(SYNC_KEYS)" python3 -c "import json,os;ks=os.environ['SYNC_KEYS'].split();print(json.dumps([{'name':k,'value':os.environ[k],'slotSetting':False} for k in ks if os.environ.get(k)]))" > .deploy/settings.json
	@chmod 600 .deploy/settings.json
	@$(LOAD_ENV) && az webapp config appsettings set \
	  --name "$$AZURE_WEBAPP_NAME" \
	  --resource-group "$$AZURE_RESOURCE_GROUP" \
	  --settings @.deploy/settings.json -o none; \
	  rc=$$?; rm -f .deploy/settings.json; exit $$rc
	@echo "反映しました (アプリが再起動します)"

test: ## バックエンドのテストを実行
	python3 -m pytest tests/ -q

logs: check-env ## 実行中のログを表示 (Ctrl-C で終了)
	@$(LOAD_ENV) && az webapp log tail \
	  --name "$$AZURE_WEBAPP_NAME" --resource-group "$$AZURE_RESOURCE_GROUP"

open: check-env ## デプロイ先をブラウザで開く
	@$(LOAD_ENV) && open "https://$$AZURE_WEBAPP_NAME.azurewebsites.net"

clean: ## ビルド成果物と中間ファイルを削除
	rm -rf .deploy frontend/dist