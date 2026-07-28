# デプロイワークフローのセットアップ

`deploy.yml` は Workload Identity Federation (OIDC) で Azure に認証します。
**発行プロファイルや client secret を GitHub に保存しません。**

| トリガー | デプロイ先 |
|---|---|
| `main` への push | staging |
| Release の公開 | 本番 |
| 手動実行 (`workflow_dispatch`) | 選択 |

このリポジトリは public のため、フォークからの PR で発火しないトリガーのみを
使っています (`pull_request` は使わない)。

## 1. Azure 側の設定

`az login` した状態で実行します。**手順 3 (ロール割り当て) だけは
サブスクリプションまたは RG の Owner / ユーザーアクセス管理者が必要です。**
RG の Contributor では `Microsoft.Authorization/*/Write` が NotActions に
入っているため実行できません。

```bash
REPO="kc26-vol/event-scheduler"
APP_NAME="github-actions-event-scheduler"
RG="kcjp26-event-scheduler-dev"
SUB=$(az account show --query id -o tsv)
```

### 1-1. アプリ登録とサービスプリンシパルを作る

```bash
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"
echo "AZURE_CLIENT_ID = $APP_ID"
```

### 1-2. フェデレーション資格情報を登録する

GitHub からのトークンだけを信頼するように、`subject` を厳密に指定します。
**環境 (Environment) を subject に含めることで、その環境の承認を通った実行
だけが認証できます。**

```bash
# staging 環境用
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-staging",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:'"$REPO"':environment:staging",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 本番環境用
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:'"$REPO"':environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

### 1-3. ロールを割り当てる（要 Owner / ユーザーアクセス管理者）

```bash
az role assignment create \
  --assignee "$APP_ID" \
  --role "Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG"
```

> より絞るなら `Website Contributor` でも動きます。ただし
> `az webapp config appsettings list` (DATA_DIR の検証) が必要なため、
> 読み取り権限が含まれることを確認してください。

## 2. GitHub 側の設定

### 2-1. Environments を作る

`Settings > Environments` で **`staging`** と **`production`** を作成します。

**`production` には必ず Required reviewers を設定してください。**
1-2 の `subject` が環境名を含むため、環境の承認を通らない限り Azure への
認証自体が成立しません。

### 2-2. Secrets を登録する

`Settings > Secrets and variables > Actions > Secrets`

| 名前 | 値 |
|---|---|
| `AZURE_CLIENT_ID` | 1-1 で出力された `appId` |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

これらは資格情報そのものではありませんが、public リポジトリなので
Variables ではなく Secrets に入れています。

### 2-3. Variables を登録する

`Settings > Secrets and variables > Actions > Variables`

| 名前 | 値 |
|---|---|
| `AZURE_RESOURCE_GROUP` | `kcjp26-event-scheduler-dev` |
| `AZURE_WEBAPP_NAME_STAGING` | `kcjp26-event-scheduler-staging` |
| `AZURE_WEBAPP_NAME_PROD` | `kcjp26-event-scheduler-dev-app` |

## 3. 動作確認

1. 手動実行 (`Actions > Deploy > Run workflow`) で `staging` を選ぶ
2. 成功したら `main` に push して自動デプロイを確認
3. 本番は Release を作成して確認（承認ゲートが働くこと）

## ワークフローが守っていること

デプロイ前後に、過去に踏んだ問題を検査しています。

| 検査 | 目的 |
|---|---|
| `frontend/dist` の同梱確認 | Oryx は Node をビルドしないため、無いとアプリ本体が表示されない |
| `requirements.txt` の同梱確認 | 無いと Python 依存がインストールされない |
| `.env*` の混入確認 | シークレットをデプロイ物に含めない |
| `DATA_DIR` の検証 | zip デプロイは wwwroot を丸ごと置き換えるため、実データが wwwroot 配下にあると消える |
| 起動確認 (`login.html` が 200) | `/home` のマウント未完了などによる起動失敗を検知する |

## アプリ設定・データについて

ワークフローは**アプリ設定 (環境変数) を変更しません**。変更は
`make sync-settings` で明示的に行います。

デプロイは `wwwroot` のみを置き換え、`/home/data` (DB・アップロード) には
触れません。手元からのデプロイでバックアップを取りたい場合は `make deploy`
を使ってください (バックアップ → デプロイ → データ件数検証を強制します)。
