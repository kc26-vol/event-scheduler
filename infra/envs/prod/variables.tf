variable "subscription_id" {
  description = "対象の Azure サブスクリプションID"
  type        = string
}

variable "app_password" {
  description = "ログインパスワード (APP_PASSWORD)"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Cookie 署名キー (SESSION_SECRET)"
  type        = string
  sensitive   = true
}

variable "reset_password" {
  description = "管理者パスワード (RESET_PASSWORD)"
  type        = string
  sensitive   = true
}

variable "data_dir" {
  description = "DB・アップロードの保存先。/home 配下の永続領域を指すこと"
  type        = string
  default     = "/home/data"

  validation {
    condition     = startswith(var.data_dir, "/home/") && !startswith(var.data_dir, "/home/site/wwwroot")
    error_message = "data_dir は /home 配下かつ wwwroot の外である必要があります (zip デプロイで wwwroot は丸ごと置き換わるため)。"
  }
}

variable "timezone" {
  description = "TZ"
  type        = string
  default     = "Asia/Tokyo"
}
