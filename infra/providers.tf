provider "google" {
  project = var.project_id
  region  = var.region

  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

locals {
  hosting_origin = "https://${google_firebase_hosting_site.default.site_id}.web.app"

  browser_origins = concat([
    local.hosting_origin,
    "https://${google_firebase_hosting_site.default.site_id}.firebaseapp.com",
    "http://localhost:5173",
  ], [for d in var.custom_domains : "https://${d}"])
}
