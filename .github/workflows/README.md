# Cloudflare Workers デプロイ

| GitHub イベント | 動作 |
|---|---|
| Pull request | Node 24 で型検査・テスト・OpenNext ビルド。ローカル D1/R2 を使い HTTP 経由で初回ログイン、日程、Excel・ZIP 出力、写真のアクセス制御を検証 |
| main の Worker・ワークフロー変更 | staging をデプロイ |
| Release の公開 | リリースのコミットを production にデプロイ |
| Deploy to Cloudflare の手動実行 | 選択した ref と環境をデプロイ |

## Shion のアカウントと GitHub の設定

Cloudflare ダッシュボードでデプロイ先のアカウント ID を確認し、workers.dev サブドメインと R2 を有効にします。Workers の CPU 制限は、大会データでの自動配置・写真入り Excel 作成・既存パスワードのハッシュ検証に必要な処理時間に合わせてください。

GitHub の **Settings → Environments** で `staging` と `production` のそれぞれに設定します。

| 種類 | 名前 | 値 |
|---|---|---|
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Shion の対象アカウント ID |
| Secret | `CLOUDFLARE_API_TOKEN` | このアカウントの Workers Scripts、D1、Workers R2 Storage に編集権限を持つ API トークン |
| Secret | `SESSION_SECRET` | 環境専用のランダムなセッション署名鍵。変更すると全員が再ログイン |
| Secret | `APP_PASSWORD` | 参加者に配布するログインパスワード |
| Secret | `RESET_PASSWORD` | データ初期化の確認に使う管理者専用パスワード |

署名鍵と2つのパスワードにはそれぞれ別の値を生成します (`openssl rand -hex 32`)。環境の設定値は GitHub Actions の deploy ジョブで使用します。

ジョブは検証済みバンドルを受け取り、対象アカウントの `event-scheduler-staging` または `event-scheduler-production` の D1 と、同名に `-storage` を付けた R2 バケットを検索します。初回は作成し、以降は既存のものを再使用します。D1 に未適用のマイグレーションを実行してから、Worker・アセット・シークレットを配置します。最後に実 URL の `/api/health` で Worker と D1 の応答を検証します。各環境の URL は Actions の deployment に表示されます。

## 既存イベントを移す

まず staging の専用リソースでリハーサルします。本番切替時は旧アプリの更新とバックアップジョブを止め、同じ時点の SQLite とファイルをコピーします。SQLite はオンラインバックアップか停止後の一貫したコピーを使用します。

1. 対象環境へ先にデプロイしてスキーマを作ります。ログイン画面やヘルスチェックはイベント用テーブルを変更しません。初回ログイン時に空の D1 を初期化するため、既存イベントの取り込みは最初のログイン前に実行します。
2. 作業マシン上で対象アカウントの `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を設定します。以下はリポジトリのルートから実行します。`DATA_COPY` は旧環境データのコピーを置いた絶対パス、`SQL_OUT` は非公開ディレクトリの未使用ファイル名です。
3. SQLite とオブジェクトを検証してインポートします。

```sh
(cd web && npm ci && node scripts/prepare-cloudflare.mjs staging)
uv run --no-sync scripts/export_d1.py "$DATA_COPY/scheduler.db" "$SQL_OUT"
uv run --no-sync scripts/import_objects.py "$DATA_COPY" --config web/wrangler.deploy.json
(cd web && npx --no-install wrangler d1 execute DB --config wrangler.deploy.json --remote --file "$SQL_OUT")
uv run --no-sync scripts/import_objects.py "$DATA_COPY" --config web/wrangler.deploy.json --apply-remote
```

SQL にはログイン設定や個人情報が含まれます。SQL の再投入先には空の D1 を使用してください。オブジェクト転送は同じ凍結コピーから再実行できます。ファイルをすべて転送してから D1 の履歴を登録します。旧バックアップ ID には公開スナップショット ID との衝突を避けるため `legacy-backup-` が付きます。公開中のスナップショット ID と API キーは維持します。

4. 旧環境とセッション数・スタッフ数・配置数を照合し、既存パスワードでのログイン、スタッフ写真、バックアップ ZIP と公開 API を確認します。以前と同じパスワードを使う場合は、デプロイ前に GitHub Environment の `APP_PASSWORD` と `RESET_PASSWORD` に元の値を設定します。デプロイされたシークレットが DB の旧パスワードに優先します。
5. production でも同じ手順を実施し、利用者と外部 API クライアントの接続先を切り替えます。新規イベントだけの場合はデータ移行を省略し、`APP_PASSWORD` でログインします。イベント名・タイムゾーンは設定画面から変更できます。

## 切り戻し

互換性のある以前の Worker は Cloudflare の Worker バージョンから再配置できます。コードの切り戻しと D1 の復元は別操作です。データの復元時は書き込みを止め、対象時刻の D1 と R2 オブジェクトを揃えて検証します。移行中に旧 Azure へ戻す場合、新環境で受け付けた更新を照合してから接続先を戻します。既存 Azure リソースと移行元ファイルはこのワークフローでは削除しません。
