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

run "signing_and_firebase_apis_are_enabled" {
  command = plan

  assert {
    condition     = contains(keys(google_project_service.apis), "iamcredentials.googleapis.com")
    error_message = "iamcredentials is required: V4 signed URLs are signed via the IAM signBlob API, not a key file."
  }

  assert {
    condition     = contains(keys(google_project_service.apis), "identitytoolkit.googleapis.com")
    error_message = "identitytoolkit is required by google_identity_platform_config (Firebase Auth)."
  }

  assert {
    condition     = contains(keys(google_project_service.apis), "firebasestorage.googleapis.com")
    error_message = "firebasestorage is required to register the bucket with Firebase so storage.rules applies."
  }
}

run "apis_survive_destroy" {
  command = plan

  assert {
    condition     = alltrue([for s in google_project_service.apis : s.disable_on_destroy == false])
    error_message = "Disabling APIs on destroy is slow and can strand dependent resources."
  }
}
