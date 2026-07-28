# 本番環境。既存リソースを import で取り込む (新規作成しない)。
# `terraform plan` が "No changes" になることがゴール。
#
# 対象外: kcjp26-event-scheduler-restore (スナップショット復元の受け皿。
#         Terraform では管理しない)

locals {
  resource_group_name = "kcjp26-event-scheduler-dev"
  service_plan_name   = "kcjp26-event-plan"
  app_name            = "kcjp26-event-scheduler-dev-app"

  # RG は japaneast だが、実リソースは Japan West にある
  resource_group_location = "japaneast"
  location                = "japanwest"
}

resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = local.resource_group_location
}

resource "azurerm_service_plan" "main" {
  name                = local.service_plan_name
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location

  os_type  = "Linux"
  sku_name = "B3"

  worker_count           = 1
  zone_balancing_enabled = false
}

module "app" {
  source = "../../modules/webapp"

  name                = local.app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = local.location
  service_plan_id     = azurerm_service_plan.main.id

  https_only = true

  # 現状は無効。有効にするとコールドスタートが減り、
  # /home のマウント未完了による起動失敗の機会も減る。
  always_on = false

  # ここが効くのは環境を新規作成するときだけ。作成済みの環境では
  # ignore_changes により無視される (詳細は infra/modules/webapp/main.tf)。
  # 稼働中の値を変えるには .env.<環境> を直して make sync-settings ENV=<環境>。
  app_settings = {
    APP_PASSWORD                   = var.app_password
    SESSION_SECRET                 = var.session_secret
    RESET_PASSWORD                 = var.reset_password
    DATA_DIR                       = var.data_dir
    TZ                             = var.timezone
    SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
    WEB_CONCURRENCY                = var.web_concurrency

    # /home を永続ストレージとしてマウントする。組み込みイメージでは既定で
    # 永続だが、カスタムコンテナでは既定が false のため明示しておく。
    WEBSITES_ENABLE_APP_SERVICE_STORAGE = "true"
  }
}

output "app_url" {
  value = module.app.url
}
