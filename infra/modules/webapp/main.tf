# Event Scheduler の Web App 1つ分。prod / staging で共有する。
#
# アプリのコード自体は zip デプロイ (make deploy) で配信するため、
# このモジュールはインフラ設定のみを扱う。

resource "azurerm_linux_web_app" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = var.service_plan_id

  https_only                    = var.https_only
  client_affinity_enabled       = var.client_affinity_enabled
  public_network_access_enabled = true

  # SCM へのベーシック認証は使わない (AAD トークンのみ)。
  # provider の既定値は true なので、明示しないと有効化されてしまう。
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false

  site_config {
    always_on           = var.always_on
    ftps_state          = "FtpsOnly"
    http2_enabled       = false
    minimum_tls_version = "1.2"
    worker_count        = 1
    use_32_bit_worker   = true

    app_command_line = var.app_command_line

    application_stack {
      python_version = "3.11"
    }
  }

  app_settings = var.app_settings

  lifecycle {
    ignore_changes = [
      tags,
      logs, # ログ保持設定は Terraform の管理外 (既存値を維持)
      # アプリ設定の値は make sync-settings が管理する。
      # Terraform 側で管理しようとすると、シークレットが sensitive 変数由来である
      # ために import した state (sensitive マーク無し) との間で値が同一でも
      # 差分が出続け、apply のたびにアプリが再起動してしまう。
      # 再起動は /home のマウント未完了による起動失敗の契機になるため避ける。
      # (上の app_settings は「あるべき姿」の記述として残している)
      app_settings,
      # 実サーバ側は未設定(空)だが provider の既定値は "Allow"。
      # 意味は同じ(制限なし)ため、無用な書き込みを避けて現状維持する。
      site_config[0].ip_restriction_default_action,
      site_config[0].scm_ip_restriction_default_action,
    ]
  }
}
