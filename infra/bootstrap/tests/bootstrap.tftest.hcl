mock_provider "google" {}

variables {
  project_id         = "delivery-test"
  project_name       = "Delivery Tracker"
  billing_account_id = "000000-000000-000000"
  region             = "us-central1"
}

run "project_cannot_be_destroyed_by_accident" {
  command = plan

  assert {
    condition     = google_project.this.deletion_policy == "PREVENT"
    error_message = "The production project must be protected from tofu destroy."
  }
}

run "state_bucket_is_versioned_and_private" {
  command = plan

  assert {
    condition     = google_storage_bucket.state.versioning[0].enabled == true
    error_message = "State bucket versioning must be on; it is the only recovery path from a corrupted state write."
  }

  assert {
    condition     = google_storage_bucket.state.uniform_bucket_level_access == true
    error_message = "State contains resource metadata and must not be reachable via per-object ACLs."
  }

  assert {
    condition     = google_storage_bucket.state.force_destroy == false
    error_message = "A state bucket that tofu destroy can empty defeats its own purpose."
  }

  assert {
    condition     = google_storage_bucket.state.public_access_prevention == "enforced"
    error_message = "State bucket must not be publicly reachable."
  }
}
