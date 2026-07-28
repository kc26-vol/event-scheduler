# staging 環境。
#
# 本番と同じ RG・同じ App Service プランを共有する (追加コストをほぼゼロにするため)。
# RG とプランは prod の Terraform が管理しているので、ここでは data source で参照するだけ。
#
# 注意: 本番とコンピュートを共有するため、staging での負荷試験には向かない。

locals {
  resource_group_name = "kcjp26-event-scheduler-dev"
  service_plan_name   = "kcjp26-event-plan"
  app_name            = "kcjp26-event-scheduler-staging"
  location            = "japanwest"
}

data "azurerm_resource_group" "main" {
  name = local.resource_group_name
}

data "azurerm_service_plan" "main" {
  name                = local.service_plan_name
  resource_group_name = data.azurerm_resource_group.main.name
}

module "app" {
  source = "../../modules/webapp"

  name                = local.app_name
  resource_group_name = data.azurerm_resource_group.main.name
  location            = local.location
  service_plan_id     = data.azurerm_service_plan.main.id

  https_only = true
  always_on  = false

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

    # staging は新規作成なので /home/data が空。初回起動時のみ
    # 空ボリュームを許可する (起動時ガードを通すため)。
    # 一度データが入ったらこの行を消して apply し直すこと。
    ALLOW_EMPTY_DATA_DIR = "1"
  }
}

output "app_url" {
  value = module.app.url
}

output "app_name" {
  value = module.app.name
}
