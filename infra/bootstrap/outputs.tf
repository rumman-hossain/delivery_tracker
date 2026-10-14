output "project_id" {
  description = "The created project id."
  value       = google_project.this.project_id
}

output "state_bucket" {
  description = "Bucket holding the root module's state; pass to tofu init -backend-config."
  value       = google_storage_bucket.state.name
}
