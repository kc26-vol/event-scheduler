# Cloudflare Workers デプロイ

| GitHub イベント | 動作 |
|---|---|
| Pull request | Node 24 で型検査・テスト・OpenNext ビルド。ローカル D1/R2 を使い 登録と権限をテストし、HTTP 経由で日程、Excel・ZIP 出力、写真のアクセス制御を検証 |
| main の Worker・ワークフロー変更 | staging をデプロイ |
| Release の公開 | リリースのコミットを production にデプロイ |
| Deploy to Cloudflare の手動実行 | 選択した ref と環境をデプロイ |

## Shion のアカウントと GitHub の設定

Cloudflare ダッシュボードでデプロイ先のアカウント ID を確認し、workers.dev サブドメインと R2 を有効にします。Workers の CPU 制限は、大会データでの自動配置や写真入り Excel 作成に必要な処理時間に合わせてください。

GitHub の **Settings → Environments** で `staging` と `production` のそれぞれに設定します。

| 種類 | 名前 | 値 |
|---|---|---|
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Shion の対象アカウント ID |
| Secret | `CLOUDFLARE_API_TOKEN` | このアカウントの Workers Scripts、D1、Workers R2 Storage に編集権限を持つ API トークン |
| Secret | `INITIAL_ADMIN_EMAIL` | 最初の管理者のメールアドレス。名簿が空の環境を初めてデプロイする時に使用 |
| Variable | `AUTH_EMAIL_FROM` | 登録リンクの送信元 `noreply@lfstaff.shion.dev` |
| Variable | `APP_ORIGIN` | 任意。登録リンク・LINE コールバックに使う公開 URL。既定値はこの Worker の HTTPS workers.dev URL。カスタムドメインを使う場合は先に Worker へ割り当てる |
| Variable | `FIREBASE_PROJECT_ID` / `FIREBASE_API_KEY` | Google を使う場合。Firebase のウェブアプリ設定の `projectId` と `apiKey` |
| Variable | `FIREBASE_AUTH_DOMAIN` | 任意。既定値は `<projectId>.firebaseapp.com` |
| Variable | `LINE_CHANNEL_ID` | LINE を使う場合。LINE Login チャネルの Channel ID |
| Secret | `LINE_CHANNEL_SECRET` | LINE を使う場合。同じチャネルの Channel secret |

`INITIAL_ADMIN_EMAIL` はデプロイジョブが D1 に最初の管理者を登録する際にだけ読みます。既存の名簿があれば、シークレットを削除・変更しても管理者の追加や権限変更は発生しません。2人目以降の管理者は管理画面で追加できます。

ジョブは検証済みバンドルを受け取り、対象アカウントの `event-scheduler-staging` または `event-scheduler-production` の D1 と、同名に `-storage` を付けた R2 バケットを検索します。初回は作成し、以降は既存のものを再使用します。D1 に未適用のマイグレーションを実行し、名簿が空なら管理者を1人追加してから Worker・アセット・LINE を利用する場合のシークレットを配置します。最後に実 URL の `/api/health` で Worker と D1 の応答を検証します。各環境の URL は Actions の deployment に表示されます。

## スタッフ個別ログインの準備

| GitHub 環境 | Worker | `APP_ORIGIN` | LINE の Callback URL |
|---|---|---|---|
| staging | `event-scheduler-staging` | `https://stg.lfstaff.shion.dev` | `https://stg.lfstaff.shion.dev/auth/line-callback` |
| production | `event-scheduler-production` | `https://lfstaff.shion.dev` | `https://lfstaff.shion.dev/auth/line-callback` |

1. **ドメインを Worker に割り当てる。** Cloudflare ダッシュボードで各 Worker の **Settings → Domains & Routes** から表のホスト名を Custom Domain として割り当てます。DNS と証明書が有効になったら各ホストの `/api/health` が `{"status":"ok"}` を返すことを確認します。このワークフローは割り当て済みのドメインを維持し、デプロイ後に `APP_ORIGIN` のヘルスチェックを実行します。[Cloudflare の Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
2. **メールの送信元を有効にする。** Cloudflare の **Compute → Email Service → Email Sending → Onboard Domain** で Cloudflare DNS のドメインを選び、指定された DNS レコードの検証を完了します。送信ドメインは `lfstaff.shion.dev`、両環境の `AUTH_EMAIL_FROM` は `noreply@lfstaff.shion.dev` です。Workers Free では Cloudflare 上で確認済みの宛先へ送れます。管理者が名簿に追加した任意の宛先にメールを送るには Workers Paid が必要です。[Cloudflare の送信設定](https://developers.cloudflare.com/email-service/get-started/send-emails/)・[プランごとの宛先制限](https://developers.cloudflare.com/email-service/)
3. **ログイン方法を設定する。** Google と LINE の両方、または用意できた一方から開始できます。両方を表示する場合は両方の設定を行います。
   - **Google** — Firebase プロジェクトにウェブアプリを追加し、コンソールの **Authentication → Sign-in method** で Google を有効にします。**Authentication → Settings → Authorized domains** に対象環境のホスト名 (`stg.lfstaff.shion.dev` または `lfstaff.shion.dev`) を追加し、ウェブアプリ設定の `projectId`、`apiKey` を GitHub 環境変数に転記します。Google ログインには Firebase のウェブ SDK を使用します。[Firebase の Google ログイン](https://firebase.google.com/docs/auth/web/google-signin)
   - **LINE** — LINE Developers コンソールでプロバイダーと **LINE Login** チャネルを作成し、アプリタイプに **Web app** を設定します。**LINE Login** タブの Callback URL に表の対象環境の Callback URL を登録します。権限は `openid` を使い、スタッフのメール確認は登録リンクで行います。開発中はチャネルの Admin と Tester が利用でき、全スタッフが利用する際にはチャネルを公開します。[LINE Login の設定](https://developers.line.biz/en/docs/line-login/getting-started/)・[コールバック URL の登録](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
4. **最初の管理者を登録する。** GitHub の Environment Secret `INITIAL_ADMIN_EMAIL` に管理者のメールアドレスを登録してデプロイします。完了後は本人が `/register` でそのアドレスに登録リンクを送り、受信したリンクを開いて Google または LINE を連携します。以降はその連携先でログインできます。
5. **名簿を登録する。** 管理者が `/accounts` でスタッフまたは他の管理者のメールアドレスと権限を追加します。各自に `/register` を案内します。参加可否・権限・外部アカウントとの関連は D1 が管理します。

共有パスワードから切り替える際には、個別ログイン版のデプロイで旧パスワードとログイン済みセッションが使えなくなります。管理者のメール登録、プロバイダー連携、スタッフ権限での参照を staging で確認してから production を切り替えてください。

## 既存イベントを移す

まず staging の専用リソースでリハーサルします。本番切替時は旧アプリの更新とバックアップジョブを止め、同じ時点の SQLite とファイルをコピーします。SQLite はオンラインバックアップか停止後の一貫したコピーを使用します。

1. 対象環境へ先にデプロイしてスキーマを作ります。管理者の名簿だけが初期化されます。初回の管理者ログインはデータ取り込み後に行い、D1 のイベント用テーブルが空であることを確認します。
2. 作業マシン上で対象アカウントの `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を設定します。以下はリポジトリのルートから実行します。`DATA_COPY` は旧環境データのコピーを置いた絶対パス、`SQL_OUT` は非公開ディレクトリの未使用ファイル名です。
3. SQLite とオブジェクトを検証してインポートします。

```sh
(cd web && npm ci && node scripts/prepare-cloudflare.mjs staging --storage-only)
uv run --no-sync scripts/export_d1.py "$DATA_COPY/scheduler.db" "$SQL_OUT"
uv run --no-sync scripts/import_objects.py "$DATA_COPY" --config web/wrangler.deploy.json
(cd web && npx --no-install wrangler d1 execute DB --config wrangler.deploy.json --remote --file "$SQL_OUT")
uv run --no-sync scripts/import_objects.py "$DATA_COPY" --config web/wrangler.deploy.json --apply-remote
```

SQL にはログイン設定や個人情報が含まれます。SQL の再投入先には空の D1 を使用してください。オブジェクト転送は同じ凍結コピーから再実行できます。ファイルをすべて転送してから D1 の履歴を登録します。旧バックアップ ID には公開スナップショット ID との衝突を避けるため `legacy-backup-` が付きます。公開中のスナップショット ID と API キーは維持します。

4. 旧環境とセッション数・スタッフ数・配置数を照合します。上の手順で最初の管理者を登録し、各スタッフの名簿にメールを追加します。管理者としてのログイン、スタッフ権限での閲覧、写真、バックアップ ZIP と公開 API を確認します。
5. production でも同じ手順を実施し、利用者と外部 API クライアントの接続先を切り替えます。新規イベントの場合はデータ移行を省略して、デプロイ時に登録した管理者のメールで登録を開始します。

イベントの ZIP バックアップを後から復元する場合、ログイン名簿と権限は保持されます。復元前後でスタッフ ID の指す人が変わる可能性があるため、各アカウントとスケジュール上のスタッフとの関連付けは解除されます。復元後に管理者が `/accounts` で対応するスタッフを再選択してください。

## 切り戻し

互換性のある以前の Worker は Cloudflare の Worker バージョンから再配置できます。コードの切り戻しと D1 の復元は別操作です。データの復元時は書き込みを止め、対象時刻の D1 と R2 オブジェクトを揃えて検証します。移行中に旧 Azure へ戻す場合、新環境で受け付けた更新を照合してから接続先を戻します。既存 Azure リソースと移行元ファイルはこのワークフローでは削除しません。
