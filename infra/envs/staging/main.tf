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

  # ここが効くのは環境を新規作成するときだけ。作成済みの環境では
  # ignore_changes により無視される (詳細は infra/modules/webapp/main.tf)。
  # 稼働中の値を変えるには .env.staging を直して make sync-settings ENV=staging。
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

    # staging を新規作成した時点では /home/data が空なので、
    # 起動時ガードを通すために空ボリュームを許可する。
    #
    # 解除するときはこの行を消すだけでは駄目 (更新は ignore_changes で
    # 無視されるため、消して apply しても設定は残る)。az で明示的に削除する:
    #   az webapp config appsettings delete -n <app> -g <rg> \
    #     --setting-names ALLOW_EMPTY_DATA_DIR
    ALLOW_EMPTY_DATA_DIR = "1"
  }
}

output "app_url" {
  value = module.app.url
}

output "app_name" {
  value = module.app.name
}
