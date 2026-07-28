variable "name" {
  description = "Web App 名 (グローバルに一意)"
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "service_plan_id" {
  type = string
}

variable "https_only" {
  description = "HTTP を HTTPS へ強制するか"
  type        = bool
  default     = true
}

variable "client_affinity_enabled" {
  type    = bool
  default = true
}

variable "always_on" {
  description = "アイドル時もコンテナを落とさない。有効にするとコールドスタート起因の起動失敗が減る"
  type        = bool
  default     = false
}

variable "app_command_line" {
  description = "スタートアップコマンド"
  type        = string

  # worker 数は -w で固定せず、gunicorn が既定で参照する WEB_CONCURRENCY に任せる。
  # アプリ側 (app/security.py の worker_count) も同じ環境変数を見て
  # レート制限を頭割りするため、二箇所に別々の数字が書かれる状態を避ける。
  # WEB_CONCURRENCY は make sync-settings で反映する。
  default = "gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000"
}

variable "app_settings" {
  description = "アプリ設定。WEBSITE_HTTPLOGGING_RETENTION_DAYS は provider の予約キーなので含められない"
  type        = map(string)

  # ここで sensitive = true にしない。
  # map 全体に sensitive マークが付くと、import した state (マーク無し) との間に
  # 「値は同一なのに sensitive 属性だけ違う」差分が生じ、plan が永久に
  # "1 to change" のままになるため。
  # 個々のシークレットは呼び出し側の変数 (app_password 等) が sensitive なので、
  # そこから伝播して保護される。
}

variable "scm_basic_auth_enabled" {
  description = <<-EOT
    SCM (Kudu) のベーシック認証。GitHub Actions の発行プロファイルデプロイに必要。
    OIDC (Workload Identity Federation) へ移行できたら false に戻すこと。
  EOT
  type        = bool
  default     = true
}
