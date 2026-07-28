# インフラ (Terraform)

Azure 上のリソースを Terraform で管理します。アプリのコード自体は
`make deploy` (zip デプロイ) で配信するため、ここではインフラの形だけを扱います。

## 構成

```
infra/
  modules/webapp/     Web App 1つ分の共通定義 (prod / staging で共有)
  envs/prod/          本番。既存リソースを import 済み
  envs/staging/       ステージング
```

| 環境 | Web App | プラン | 備考 |
|---|---|---|---|
| prod | `kcjp26-event-scheduler-dev-app` | `kcjp26-event-plan` (B3) を**管理** | 既存リソースを import |
| staging | `kcjp26-event-scheduler-staging` | 同じプランを**参照**(data source) | 追加コストはほぼゼロ |

プランを共有しているため CPU・メモリは本番と共用です。**staging での負荷試験は本番に影響します。**

`kcjp26-event-scheduler-restore` (スナップショット復元の受け皿) は Terraform の管理対象外です。

## 使い方

```bash
cd infra/envs/prod      # または envs/staging
terraform init
terraform plan          # 本番リソースは読むだけ。書き込みは一切しない
terraform apply
```

シークレットは各環境の `terraform.tfvars` から読みます (gitignore 済み)。
staging には本番の認証情報を流用せず、専用の値を生成してあります。

## 責務の分担

| 対象 | 管理者 | 理由 |
|---|---|---|
| RG・App Service プラン・Web App の設定 | **Terraform** | インフラの形 |
| アプリ設定 (`APP_PASSWORD` 等) の値 | **`make sync-settings`** | 下記の理由により Terraform では `ignore_changes` |
| アプリのコード | **`make deploy`** | zip デプロイ |

`modules/webapp` では `app_settings` を `ignore_changes` に入れています。
シークレットが `sensitive` 変数由来のため、**値が完全に同一でも** import した
state (sensitive マーク無し) との間で差分が出続け、`apply` のたびにアプリが
再起動してしまうためです。再起動は `/home` のマウント未完了による起動失敗の
契機になるので避けています (`app/storage_guard.py` を参照)。

`main.tf` の `app_settings` は「あるべき姿」の記述として残しています。

## state の保存先 (未対応)

現在は**ローカル state** です。Blob Storage backend への移行が
**サブスクリプションスコープの権限不足で保留中**です。

```
Microsoft.Storage       : NotRegistered
実行者のロール          : Contributor (RG kcjp26-event-scheduler-dev のみ)
→ az provider register がサブスクリプションスコープの操作のため AuthorizationFailed
```

サブスクリプションの Owner が以下を一度だけ実行すれば移行できます。

```bash
az provider register -n Microsoft.Storage

az group create -n kcjp26-tfstate -l japaneast
az storage account create -n kcjp26tfstate -g kcjp26-tfstate \
  -l japaneast --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false
# state の誤削除・破損に備えてバージョニングと論理削除を有効化する
az storage account blob-service-properties update -n kcjp26tfstate \
  -g kcjp26-tfstate --enable-versioning true \
  --enable-delete-retention true --delete-retention-days 30
az storage container create -n tfstate --account-name kcjp26tfstate --auth-mode login
```

その後、各環境の `versions.tf` の `backend "azurerm"` のコメントを外して
移行します。

```bash
cd infra/envs/prod && terraform init -migrate-state
cd ../staging      && terraform init -migrate-state
```

**移行するまでローカルの `terraform.tfstate` が唯一の正です。消さないでください。**

## import 時に踏んだ注意点

将来 import を追加する際の参考に残します。

- リソースIDは**大文字小文字まで厳密**に検証される (`serverfarms` ではなく `serverFarms`)
- `ftp_publish_basic_authentication_enabled` / `webdeploy_publish_basic_authentication_enabled`
  は provider の既定が `true`。現在の本番は**無効**なので、明示しないと
  import 時にベーシック認証を**有効化してしまう**
- `WEBSITE_HTTPLOGGING_RETENTION_DAYS` は `app_settings` に書けない
  (provider が `logs` ブロックで管理する予約キー)。現状維持のため `logs` ごと
  `ignore_changes` にしている
- `site_config[0].ip_restriction_default_action` は実サーバ側が空、provider 既定は
  `"Allow"`。意味は同じなので `ignore_changes` で無用な書き込みを避けている
