mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = {
      name  = "projects/delivery-test/serviceAccounts/delivery-api-run@delivery-test.iam.gserviceaccount.com"
      email = "delivery-api-run@delivery-test.iam.gserviceaccount.com"
    }
  }
}
mock_provider "google-beta" {}

variables {
  project_id         = "delivery-test"
  site_id            = "delivery-test"
  billing_account_id = "000000-000000-000000"
}

run "rules_come_from_the_committed_files" {
  command = plan

  assert {
    condition     = can(regex("allow read, write: if false", google_firebaserules_ruleset.storage.source[0].files[0].content))
    error_message = "storage.rules must still deny all direct client access; the API is the only writer."
  }

  assert {
    condition     = google_firebaserules_release.firestore.name == "cloud.firestore"
    error_message = "The Firestore release name is a fixed literal required by the API."
  }

  assert {
    condition     = google_firebaserules_release.storage.name == "firebase.storage/delivery-test-photos"
    error_message = "A storage release must be named firebase.storage/<bucket> or it governs nothing."
  }
}
