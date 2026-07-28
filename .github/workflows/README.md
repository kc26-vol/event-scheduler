# デプロイワークフローのセットアップ

| トリガー | デプロイ先 |
|---|---|
| `main` への push | staging |
| Release の公開 | 本番 |
| 手動実行 (`workflow_dispatch`) | 選択 |

認証は**発行プロファイル**を使います。OIDC への移行は別タスクです
(下記「OIDC への移行」を参照)。

このリポジトリは public のため、フォークからの PR で発火しないトリガー
(`push` / `release` / `workflow_dispatch`) のみを使っています。
GitHub の Secrets はフォークからの PR には渡りません。

## 1. 発行プロファイルを取得する

SCM (Kudu) のベーシック認証が有効である必要があります。Terraform で
`scm_basic_auth_enabled = true` として管理しています (FTP は無効のまま)。

```bash
RG=kcjp26-event-scheduler-dev

az webapp deployment list-publishing-profiles \
  -n kcjp26-event-scheduler-staging -g $RG --xml

az webapp deployment list-publishing-profiles \
  -n kcjp26-event-scheduler-dev-app -g $RG --xml
```

出力された XML **全体**をそのまま GitHub Secret に貼り付けます。

> ポータルからでも取得できます:
> **App Service → 概要 → 発行プロファイルの取得**

## 2. GitHub 側の設定

### 2-1. Environments

`Settings > Environments` で **`staging`** と **`production`** を作成します。

**`production` には Required reviewers を設定してください。**
発行プロファイル方式では認証自体にゲートが掛からないため、
**環境の承認が唯一のデプロイゲート**になります。

### 2-2. Secrets

`Settings > Secrets and variables > Actions > Secrets`

**環境スコープ**で登録します (リポジトリ Secret にしないこと)。
両環境で同じ名前 `AZURE_PUBLISH_PROFILE` を使い、どちらが使われるかは
ジョブの `environment:` が決めます。

| 環境 | 名前 | 値 |
|---|---|---|
| `staging` | `AZURE_PUBLISH_PROFILE` | staging の発行プロファイル XML 全体 |
| `production` | `AZURE_PUBLISH_PROFILE` | 本番の発行プロファイル XML 全体 |

環境スコープにすることで、**本番の発行プロファイルは `production` 環境の
承認を通らないと読み出せません**。リポジトリ Secret だとどのジョブからも
読めてしまいます。

`gh` で入れる場合:

```bash
RG=kcjp26-event-scheduler-dev
az webapp deployment list-publishing-profiles -n kcjp26-event-scheduler-staging -g $RG --xml \
  | gh secret set AZURE_PUBLISH_PROFILE --env staging
az webapp deployment list-publishing-profiles -n kcjp26-event-scheduler-dev-app -g $RG --xml \
  | gh secret set AZURE_PUBLISH_PROFILE --env production
```

### 2-3. Variables

`Settings > Secrets and variables > Actions > Variables`

| 名前 | 値 |
|---|---|
| `AZURE_WEBAPP_NAME_STAGING` | `kcjp26-event-scheduler-staging` |
| `AZURE_WEBAPP_NAME_PROD` | `kcjp26-event-scheduler-dev-app` |

## 3. 動作確認

1. 手動実行 (`Actions > Deploy > Run workflow`) で `staging` を選ぶ
2. 成功したら `main` に push して自動デプロイを確認
3. 本番は Release を作成して確認 (承認ゲートが働くこと)

## ワークフローが守っていること

デプロイ前後に、過去に踏んだ問題を検査しています。

| 検査 | 目的 |
|---|---|
| `frontend/dist` の同梱確認 | Oryx は Node をビルドしないため、無いとアプリ本体が表示されない |
| `requirements.txt` の同梱確認 | 無いと Python 依存がインストールされない |
| `.env*` の混入確認 | シークレットをデプロイ物に含めない |
| `DATA_DIR` の検証 | zip デプロイは wwwroot を丸ごと置き換えるため、実データが wwwroot 配下にあると消える |
| 起動確認 (`login.html` が 200) | `/home` のマウント未完了などによる起動失敗を検知する |

`DATA_DIR` の検証は Kudu の `/api/settings` から読んでいます
(発行プロファイル方式では `az` が使えないため)。取り出した資格情報は
`::add-mask::` でログから伏せています。

## アプリ設定・データについて

ワークフローは**アプリ設定 (環境変数) を変更しません**。変更は
`make sync-settings` で明示的に行います。

デプロイは `wwwroot` のみを置き換え、`/home/data` (DB・アップロード) には
触れません。**データに影響しうる変更を出すときは手元から `make deploy`**
を使ってください (バックアップ → デプロイ → データ件数検証を強制します)。

## OIDC への移行 (別タスク)

発行プロファイルは**長期シークレット**です。public リポジトリでもあるため、
本来は Workload Identity Federation (OIDC) が望ましい方式です。

移行が保留になっている理由は**権限**です。

```
現在のロール: Contributor (RG kcjp26-event-scheduler-dev)
Contributor の NotActions: Microsoft.Authorization/*/Write
→ サービスプリンシパルへのロール割り当てができない
```

RG の Owner (`wakadanna.com_hotmail.co.jp#EXT#@...`) に依頼が必要です。

### 移行手順

1. アプリ登録を作る (テナントの `allowedToCreateApps` が true なので実行可能)

```bash
APP_ID=$(az ad app create --display-name "github-actions-event-scheduler" --query appId -o tsv)
az ad sp create --id "$APP_ID"
```

2. フェデレーション資格情報を登録する。**`subject` に環境名を含めることで、
   その環境の承認を通った実行だけが認証できる** (ワークフローを書き換えても
   迂回できないゲートになる)

```bash
REPO="kc26-vol/event-scheduler"
for ENV in staging production; do
  az ad app federated-credential create --id "$APP_ID" --parameters '{
    "name": "github-'"$ENV"'",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$REPO"':environment:'"$ENV"'",
    "audiences": ["api://AzureADTokenExchange"]
  }'
done
```

3. **ロールを割り当てる (要 Owner / ユーザーアクセス管理者)**

```bash
SUB=$(az account show --query id -o tsv)
az role assignment create --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/kcjp26-event-scheduler-dev"
```

4. ワークフローを変更する

   - `permissions:` に `id-token: write` を追加
   - `azure/login@v2` (client-id / tenant-id / subscription-id) を追加
   - `azure/webapps-deploy@v3` の `publish-profile` を外す
   - `DATA_DIR` の検証を Kudu API から `az webapp config appsettings list` に戻す

5. 発行プロファイルの Secrets を削除し、SCM のベーシック認証を無効に戻す

```bash
# infra/envs/*/main.tf で scm_basic_auth_enabled = false にして apply
```
