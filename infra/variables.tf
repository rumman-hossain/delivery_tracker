variable "project_id" {
  description = "Globally unique GCP project id."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{5,29}$", var.project_id))
    error_message = "Project id must be 6-30 chars, lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "region" {
  description = "Region for Firestore, the photo bucket, Artifact Registry and Cloud Run. Cannot be changed once Firestore exists."
  type        = string
  default     = "us-central1"
}

variable "custom_domains" {
  description = "Optional custom domains (e.g. [\"app.example.com\"]) allowed as browser origins."
  type        = list(string)
  default     = []
}

variable "site_id" {
  description = "Firebase Hosting site id; becomes https://<site_id>.web.app."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.site_id))
    error_message = "Site id must be a lowercase DNS label: 6-30 chars, lowercase letters, digits and hyphens, starting with a letter and not ending with a hyphen."
  }
}

variable "photo_retention_days" {
  description = "Days before a proof photo is deleted by lifecycle rule."
  type        = number
  default     = 365
}

variable "api_image" {
  description = "Container image for the API. Defaults to Google's hello image so the first apply succeeds before any build."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "billing_account_id" {
  description = "Billing account the budget watches, format XXXXXX-XXXXXX-XXXXXX."
  type        = string

  validation {
    condition     = can(regex("^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$", var.billing_account_id))
    error_message = "Billing account id must look like XXXXXX-XXXXXX-XXXXXX (see: gcloud billing accounts list)."
  }
}

variable "budget_amount" {
  description = "Monthly budget in the billing account's currency. Expected spend is under 2."
  type        = number
  default     = 5

  validation {
    condition     = floor(var.budget_amount) == var.budget_amount
    error_message = "budget_amount must be a whole number: it becomes budget.amount.specified_amount.units, an int64 string, and fractions belong in nanos instead."
  }
}
