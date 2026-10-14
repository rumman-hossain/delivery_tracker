variable "project_id" {
  description = "Globally unique GCP project id."
  type        = string
}

variable "project_name" {
  description = "Human-readable project name shown in the console."
  type        = string
  default     = "Delivery Tracker"
}

variable "billing_account_id" {
  description = "Billing account to attach, format XXXXXX-XXXXXX-XXXXXX."
  type        = string

  validation {
    condition     = can(regex("^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$", var.billing_account_id))
    error_message = "Billing account id must look like XXXXXX-XXXXXX-XXXXXX (see: gcloud billing accounts list)."
  }
}

variable "region" {
  description = "Region for the state bucket."
  type        = string
  default     = "us-central1"
}
