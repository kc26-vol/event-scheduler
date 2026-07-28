# Event Scheduler

カンファレンスのセッション管理・スタッフ配置を行うWebアプリケーション。

## 利用方法

### 基本的な流れ

1. **部屋を登録** — 会場の部屋名・収容人数を設定
2. **セッションを登録** — セッショングループ（日程）ごとに、タイトル・時間・部屋を設定。LT・パネルディスカッションは複数登壇者に対応
3. **スタッフを登録** — 名前・スキル・対応可能時間帯・希望セッションを設定
4. **スタッフを配置** — 手動配置、または自動配置アルゴリズムで一括割り当て
5. **確認・エクスポート** — 全体スケジュール・スタッフ別詳細で確認し、Excel出力

### 主な機能

| タブ | 内容 |
|------|------|
| 全体スケジュール | 全セッション・配置表の表示 |
| スタッフ別詳細 | スタッフごとの担当一覧 |
| 会場 | 会場地図の表示 |
| 全体スケジュール管理 | セッションの追加・編集・削除 |
| スタッフ管理 | スタッフの登録・一覧（タイル表示）。タイルをクリックすると詳細ページ (`/staffs/:id`) でスキル・希望・可用時間・配置一覧の確認と編集が可能 |
| 部屋管理 | 部屋の追加・編集・削除 |
| 会場地図 | フロアマップ画像のアップロード |
| 配置アルゴリズム | スキル・希望・バランスを考慮した自動配置 |
| エクスポート | Excel出力、connpassタイムライン・登壇者テンプレート生成 |
| 公開API | スケジュールJSONの外部配信、Webhook・GitHub Actions連携 |
| バックアップ | 自動バックアップ（間隔/毎日）、手動バックアップ、リストア、履歴管理 |
| 設定 | アプリタイトル、カテゴリ管理、セッショングループ管理、パスワード変更、データ初期化 |

### セッション形式

デフォルトで以下の形式が用意されています。設定画面から追加・編集・削除が可能です。

- **通常セッション** — 1人の登壇者による発表
- **LT（ライトニングトーク）** — 複数登壇者を登録可能
- **パネルディスカッション** — 複数登壇者を登録可能

### 公開API

イベント公式サイト等の外部サイトからスケジュールデータをJSON形式で取得できるAPIを提供します。

- **スナップショット方式** — 「パブリッシュ」で確定したデータのみ公開。編集中のデータは外部に漏れません
- **APIキー認証** — クエリパラメータまたはヘッダーで認証
- **Webhook** — パブリッシュ時に任意のURLへPOST通知
- **GitHub Actions連携** — パブリッシュ時にworkflow_dispatchを自動実行し、GitHub Pages等のキャッシュを更新
- **パブリッシュ履歴** — 過去のスナップショットに切り替え可能

### 自動配置アルゴリズム

スタッフの希望・スキル・対応可能時間・負荷バランスをスコアリングして最適な配置を算出します。配置後に手動で調整も可能です。

**自動配置は日程ごとに実行します。** 日程タブで日付を選ぶと、その日の全セッション（セッション担当・受付案内・懇親会など全カテゴリ）がまとめて配置されます。全日程を一括で配置する機能はありません。

- 活動可能時間・時間重複・移動時間・最大稼働時間（`max_hours`）といったハード制約と、負荷の平準化は **1日単位** で適用します
- 日をまたいだ担当の偏りは、ハード制約ではなくスコアのソフトな減点として考慮します
- 他の日の配置は書き換えません。3日開催なら3回実行してください

### セキュリティ

- パスワードはPBKDF2-SHA256でハッシュ化して保存
- GeoIP制限、レート制限、ブルートフォース防止
- セキュリティヘッダー（CSP、X-Frame-Options等）

## サンプルデータ

`sample/sample_data.zip` にサンプルデータを同梱しています。設定画面のリストア機能からインポートすることで、サンプルのセッション・スタッフ・部屋データを確認できます。

## 技術構成

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy + SQLite
- **Frontend**: Vue 3 (SFC + TypeScript) + Vue Router + Vite (パッケージマネージャ: pnpm)
- **Server**: Gunicorn + Uvicorn Worker

### フロントエンド構成

```
frontend/
├── index.html          # Vite エントリ
├── vite.config.ts      # dev server の /api, /auth, /uploads, /public プロキシ設定
├── tsconfig.json       # TypeScript 設定 (vue-tsc による型チェックをビルドに統合)
├── public/             # そのままコピーされる静的ファイル (login.html, setup.html, robots.txt)
└── src/
    ├── main.ts         # アプリ初期化 (ルーター / グローバルコンポーネント登録)
    ├── App.vue         # サイドバーレイアウト + 共通モーダル + <router-view>
    ├── router.ts       # ルート定義とタブ名⇔パスの対応
    ├── store.ts        # グローバルストア (全状態・API呼び出しを集約した composable)
    ├── types.ts        # API レスポンスの型定義 (Room, Session, Staff, Assignment など)
    ├── assets/style.css
    ├── components/     # 共通コンポーネント (TlGrid など)
    └── views/          # ページ単位の SFC (全体スケジュール, スタッフ管理, 部屋管理, ...)
```

各ページは URL パスで分かれています (例: `/` = 全体スケジュール, `/staffs` = スタッフ管理,
`/staffs/:id` = スタッフ詳細, `/groups/:id/manage` = セッショングループ管理)。
リロード時は URL に基づいて同じページが復元されます。

## ローカル実行

フロントエンドのビルドが必要です (初回のみ + フロントエンド変更時)。

```bash
# フロントエンドのビルド (要 pnpm)
cd frontend
pnpm install
pnpm build
cd ..

# バックエンド起動 (ビルド成果物 frontend/dist を配信)
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

ブラウザで http://localhost:8000 にアクセス。

### フロントエンド開発 (ホットリロード)

```bash
# バックエンドを :8000 で起動した状態で
cd frontend
pnpm dev    # http://localhost:5173
```

Vite dev server が `/api`, `/auth`, `/uploads`, `/public` をバックエンド
(デフォルト `http://localhost:8000`、`BACKEND_URL` 環境変数で変更可) にプロキシします。

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `APP_PASSWORD` | ログインパスワード | `password` |
| `SESSION_SECRET` | Cookie署名キー | (ランダム生成) |
| `RESET_PASSWORD` | 管理者パスワード | `password` |
| `DATA_DIR` | DB・アップロード・バックアップの保存先 | `.` (DBは `./scheduler.db`) |
| `ALLOW_EMPTY_DATA_DIR` | 空の `DATA_DIR` を許可 (`1`で有効) | 無効 |
| `TZ` | タイムゾーン | `Asia/Tokyo` |
| `GEOIP_ENABLED` | GeoIP制限 (`1`で有効) | 無効 |
| `IPINFO_TOKEN` | ipinfo.ioトークン | (なし) |

`DATA_DIR` を設定すると、起動時にそのディレクトリが実在する永続ボリュームかを
検証します (未マウントのまま空のDBを作る事故を防ぐため)。詳細は
[データを失わないための前提](#データを失わないための前提) を参照してください。
`ALLOW_EMPTY_DATA_DIR` は初回デプロイ時のみ使う一時的な例外です。

## デプロイ

Azure Web Apps へのデプロイは `make deploy` に集約されています。

```bash
make deploy
```

**バックアップ取得 → `DATA_DIR` 検証 → ビルド → デプロイ → データ件数検証** を
この順に必ず通し、途中で失敗した時点で中断します
(バックアップが取れなければデプロイまで到達しません)。

接続先と環境変数は `.env.<環境>` から読み込みます。初回のみ用意してください
(`.env.*` は `.gitignore` 済みです。シークレットを含むためコミットしないこと)。

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
$EDITOR .env.prod   # AZURE_WEBAPP_NAME・APP_PASSWORD などを埋める
```

### 環境の切り替え

対象環境は `ENV` で指定します。既定は本番 (`prod`) です。

```bash
make deploy                # .env.prod    → 本番のみ
make deploy ENV=staging    # .env.staging → staging のみ
make deploy ENV=all        # staging → 本番 の順に両方
```

`ENV=all` は `staging` を先に流し、**そこで失敗したら本番へ進みません**
(検証を挟まずに本番が変わるのを防ぐため、この順序は固定です)。
環境ごとに確認プロンプトが出ます。対応するのは
`deploy` / `deploy-no-backup` / `sync-settings` / `backup` / `verify` です。

バックアップのファイル名も環境ごとに分かれます
(`backups/prod-<日時>.zip` / `backups/staging-<日時>.zip`)。
`make sync-settings` と `make deploy-no-backup` の確認プロンプトには
対象の環境名とアプリ名が出ます。

### コマンド一覧

`make` または `make help` で一覧が出ます (現在の対象環境も表示されます)。

| コマンド | 内容 |
|---|---|
| `make deploy` | バックアップ→デプロイ→検証。通常はこれを使う |
| `make backup` | 対象環境のデータを `backups/` へ取得 (アプリのバックアップAPI経由) |
| `make check-data-dir` | 対象環境の `DATA_DIR` が永続領域を指しているか検証 |
| `make verify` | 起動確認とデータ件数の検証 |
| `make sync-settings` | `.env.<環境>` のアプリ設定を Azure へ反映 (明示実行のみ) |
| `make build` | フロントエンドのビルド |
| `make test` | バックエンドのテスト |
| `make logs` | 実行中のログを表示 |

`make deploy` はアプリ設定 (環境変数) を変更しません。変更したいときだけ
`make sync-settings` を実行します (確認プロンプトあり)。指定キーのみ更新し、
既存の他キーは削除しません。

### データを失わないための前提

**zip デプロイは `wwwroot` を丸ごと置き換えます。** そのため実データは必ず
`wwwroot` の外に置く必要があります。

- `DATA_DIR=/home/data` を設定する (`/home` は再起動・デプロイをまたいで保全される永続領域)
- DB・アップロード画像・バックアップはすべて `DATA_DIR` 配下に作られる
- `make check-data-dir` が、未設定や `wwwroot` 配下を検出してデプロイを中断する

また `/home` は Azure Files (SMB) のネットワーク共有で、**コンテナ起動直後は
マウントが完了していないことがあります**。その状態で起動すると「DBがまだ無い」と
誤認して空のDBを作ってしまうため、`DATA_DIR` を設定している場合は起動時に
ボリュームの実在を検証します (`app/storage_guard.py`)。確認できなければ
空のDBを作らずに起動を中止し、コンテナの再起動に任せます。

ボリュームが空で正当なケース (**初回デプロイ時のみ**) は `ALLOW_EMPTY_DATA_DIR=1` を
設定して明示的に許可してください。2回目以降は不要です。

### 初回セットアップ

1. **リソース作成**

```bash
az group create --name <リソースグループ名> --location japaneast

az appservice plan create \
  --name <プラン名> \
  --resource-group <リソースグループ名> \
  --sku B3 --is-linux

az webapp create \
  --name <アプリ名> \
  --resource-group <リソースグループ名> \
  --plan <プラン名> \
  --runtime "PYTHON|3.11"
```

2. **スタートアップコマンド設定**

```bash
az webapp config set \
  --name <アプリ名> \
  --resource-group <リソースグループ名> \
  --startup-file "gunicorn -w 1 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000"
```

SQLite を使うため、ワーカーは 1 のままにしてください。

3. **環境変数設定**

`.env.prod` を用意して `make sync-settings` を実行するか、以下を直接実行します。

```bash
az webapp config appsettings set \
  --name <アプリ名> \
  --resource-group <リソースグループ名> \
  --settings \
    APP_PASSWORD="<ログインパスワード>" \
    SESSION_SECRET="<ランダム文字列>" \
    RESET_PASSWORD="<管理者パスワード>" \
    DATA_DIR="/home/data" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="true"
```

4. **初回デプロイ**

```bash
# 初回はデータ領域が空なので、空ボリュームを明示的に許可する
az webapp config appsettings set \
  --name <アプリ名> --resource-group <リソースグループ名> \
  --settings ALLOW_EMPTY_DATA_DIR="1"

make deploy

# 起動を確認したら外す (以降は空ボリューム = 異常として扱わせる)
az webapp config appsettings delete \
  --name <アプリ名> --resource-group <リソースグループ名> \
  --setting-names ALLOW_EMPTY_DATA_DIR
```

### Makefile を使わずにデプロイする場合

`SCM_DO_BUILD_DURING_DEPLOYMENT` による Oryx のビルドは Python 依存のインストールのみで、
Node のビルドは実行されません。**先にローカルでフロントエンドをビルドし、
`frontend/dist` をデプロイ物に含めてください** (無いと `frontend/public` のみが配信され、
アプリ本体が表示されません)。

```bash
cd frontend && pnpm install && pnpm build && cd ..

zip -r deploy.zip . \
  -x ".git/*" ".venv/*" "*/node_modules/*" "*__pycache__/*" "*.pyc" \
     "data/*" "backups/*" ".env*"

az webapp deploy \
  --name <アプリ名> \
  --resource-group <リソースグループ名> \
  --src-path deploy.zip \
  --type zip
```

`.env*` を除外すること (本番のシークレットをデプロイ物に含めないため)。

> **uv 移行PR (#3) との関係について**: Azure (Oryx) の Python ビルドは `requirements.txt` を前提とします。
> uv 移行PR (kc26-vol/event-scheduler#3) で `requirements.txt` が廃止される場合は、
> `uv export --format requirements-txt` などにより `requirements.txt` を生成してからデプロイするか、
> 両PRのマージ後にデプロイ手順の整合を取ってください。


## ライセンス

[MIT License](LICENSE)
