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
| `DATA_DIR` | SQLiteファイル保存先 | `./data` |
| `TZ` | タイムゾーン | `Asia/Tokyo` |
| `GEOIP_ENABLED` | GeoIP制限 (`1`で有効) | 無効 |
| `IPINFO_TOKEN` | ipinfo.ioトークン | (なし) |

## デプロイ例

デプロイ前にフロントエンドのビルド (`cd frontend && pnpm install && pnpm build`) を行い、
`frontend/dist` をデプロイ物に含めてください。バックエンドは `frontend/dist` を静的配信します
(見つからない場合は `frontend/public` のみ配信され、アプリ本体は表示されません)。

> **uv 移行PR (#3) との関係について**: Azure (Oryx) の Python ビルドは `requirements.txt` を前提とします。
> uv 移行PR (kc26-vol/event-scheduler#3) で `requirements.txt` が廃止される場合は、CI で
> `uv export --format requirements-txt` などにより `requirements.txt` を生成してからデプロイするか、
> 両PRのマージ後にデプロイ手順の整合を取ってください
> ([.github/workflows/deploy.yml](.github/workflows/deploy.yml) に生成ステップのコメント例があります)。

### Azure Web Apps

#### 方法1: GitHub Actions

mainブランチへのpush時に自動デプロイされます。

##### 初回セットアップ

1. **リソース作成**

```bash
az group create --name <リソースグループ名> --location japaneast

az appservice plan create \
  --name <プラン名> \
  --resource-group <リソースグループ名> \
  --sku F1 --is-linux

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

3. **環境変数設定**

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

`DATA_DIR` を `/home/data` に設定すると、デプロイ時にデータが消えません（`/home` は永続ストレージ）。

4. **GitHub Actions設定**

Azureポータルで発行プロファイルをダウンロードし、GitHubリポジトリの Settings > Secrets に `AZURE_WEBAPP_PUBLISH_PROFILE` として登録。

ワークフローファイルは [.github/workflows/deploy.yml](.github/workflows/deploy.yml) を参照してください
(pnpm のセットアップ → `pnpm install` → `pnpm build` で `frontend/dist` を生成してからデプロイします)。
`app-name` の `<アプリ名>` を実際の値に書き換えて使います。

#### 方法2: Azure CLI で直接デプロイ

いずれの方法でも、先にローカルでフロントエンドをビルドして `frontend/dist` を生成しておきます
(Oryx のビルド `SCM_DO_BUILD_DURING_DEPLOYMENT` は Python 依存のインストールのみで、
Node のビルドは実行されません)。

```bash
# フロントエンドのビルド (必須)
cd frontend && pnpm install && pnpm build && cd ..

# プロジェクトディレクトリで実行 (frontend/dist もアップロードされる)
az webapp up \
  --name <アプリ名> \
  --resource-group <リソースグループ名> \
  --runtime "PYTHON|3.11" \
  --sku F1
```

または ZIP デプロイ:

```bash
# フロントエンドのビルド (必須)
cd frontend && pnpm install && pnpm build && cd ..

# プロジェクトをZIPに圧縮 (frontend/dist を含める)
zip -r deploy.zip . -x ".git/*" "data/*" "__pycache__/*" "*.pyc" "frontend/node_modules/*"

# デプロイ
az webapp deploy \
  --name <アプリ名> \
  --resource-group <リソースグループ名> \
  --src-path deploy.zip \
  --type zip
```

スタートアップコマンドと環境変数の設定は方法1と同じです。

#### 方法3: ローカルGitデプロイ (非推奨)

`frontend/dist` は `.gitignore` で除外されているため、ローカルGitデプロイではビルド成果物が
デプロイ物に含まれず、アプリ本体が表示されません。使う場合はデプロイ用ブランチで
`frontend/dist` を強制的にコミット (`git add -f frontend/dist`) するなどの運用が必要です。
**方法1 (GitHub Actions) または方法2 (Azure CLI) を推奨します。**

```bash
# デプロイソースをローカルGitに設定
az webapp deployment source config-local-git \
  --name <アプリ名> \
  --resource-group <リソースグループ名>

# 出力されたURLをリモートに追加
git remote add azure https://<アプリ名>.scm.azurewebsites.net/<アプリ名>.git

# デプロイ
git push azure main
```

初回pushでAzureのデプロイ資格情報を求められます。資格情報は以下で設定:

```bash
az webapp deployment user set --user-name <ユーザー名> --password <パスワード>
```

## ライセンス

[MIT License](LICENSE)
