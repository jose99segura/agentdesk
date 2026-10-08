variable "project_id" {
  description = "The Google Cloud project that hosts agentdesk."
  type        = string
}

variable "region" {
  description = "Close to the Supabase project (eu-west-1, Ireland)."
  type        = string
  default     = "europe-west1"
}

variable "core_image" {
  description = "Image for the API and the worker, e.g. europe-west1-docker.pkg.dev/<p>/agentdesk/core:<sha>. Empty until the first build."
  type        = string
  default     = ""
}

variable "dashboard_image" {
  description = "Image for the dashboard. Empty until the first build."
  type        = string
  default     = ""
}

variable "langfuse_host" {
  type    = string
  default = "https://langfuse.senaproject.online"
}

variable "langfuse_project_id" {
  type    = string
  default = "cmuzbb1t2000gp708h15hk9ns"
}

variable "telegram_chat_id" {
  type    = string
  default = "232114558"
}

variable "mistral_model" {
  type    = string
  default = "ministral-8b-latest"
}

variable "model_chain" {
  description = "Providers in order; one without a key secret is skipped."
  type        = string
  default     = "mistral,anthropic,offline"
}

variable "with_anthropic" {
  description = "Set true once the anthropic-api-key secret has a value (Cloud Run refuses a secret with no version)."
  type        = bool
  default     = false
}

variable "shop_intake_url" {
  description = "n8n webhook the demo store's chat posts to; empty sends straight to the API."
  type        = string
  default     = "https://n8n.senaproject.online/webhook/agentdesk/intake"
}
