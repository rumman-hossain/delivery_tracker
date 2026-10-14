output "project_id" {
  description = "Fills GOOGLE_CLOUD_PROJECT and VITE_FIREBASE_PROJECT_ID."
  value       = var.project_id
}

output "storage_bucket" {
  description = "Fills STORAGE_BUCKET and VITE_FIREBASE_STORAGE_BUCKET."
  value       = google_storage_bucket.photos.name
}

output "api_url" {
  description = "Cloud Run base URL; fills VITE_API_BASE_URL."
  value       = google_cloud_run_v2_service.api.uri
}

output "hosting_url" {
  description = "Firebase Hosting origin; already wired into ALLOWED_ORIGINS."
  value       = local.hosting_origin
}

output "artifact_registry_repo" {
  description = "Push target for the API image."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}"
}

output "runtime_service_account" {
  description = "Cloud Run runtime identity; useful when debugging IAM."
  value       = google_service_account.api.email
}

output "firebase_web_config" {
  description = "The five VITE_FIREBASE_* values for web/.env."
  value = {
    api_key        = data.google_firebase_web_app_config.default.api_key
    auth_domain    = data.google_firebase_web_app_config.default.auth_domain
    project_id     = var.project_id
    storage_bucket = google_storage_bucket.photos.name
    app_id         = google_firebase_web_app.default.app_id
  }
}

output "build_service_account" {
  description = "Identity Cloud Build runs as; pass to `gcloud builds submit --service-account`."
  value       = google_service_account.build.email
}
