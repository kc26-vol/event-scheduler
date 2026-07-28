terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # --- state の保存先 ---------------------------------------------------------
  # 既定はローカル state。Blob Storage backend は Microsoft.Storage プロバイダの
  # 登録が済み次第、コメントを外して `terraform init -migrate-state` する。
  # 手順は infra/README.md を参照。
  #
  # backend "azurerm" {
  #   resource_group_name  = "kcjp26-tfstate"
  #   storage_account_name = "kcjp26tfstate"
  #   container_name       = "tfstate"
  #   key                  = "event-scheduler-staging.tfstate"
  #   use_azuread_auth     = true
  # }
}

provider "azurerm" {
  features {}

  subscription_id = var.subscription_id

  # 実行者にサブスクリプションスコープの権限が無く、provider による
  # 自動登録が AuthorizationFailed になるため無効化する。
  resource_provider_registrations = "none"
}
