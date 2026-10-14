mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = {
      name  = "projects/delivery-harness-test/serviceAccounts/delivery-api-run@delivery-harness-test.iam.gserviceaccount.com"
      email = "delivery-api-run@delivery-harness-test.iam.gserviceaccount.com"
    }
  }
}
mock_provider "google-beta" {}

variables {
  project_id         = "delivery-harness-test"
  site_id            = "delivery-harness-test"
  billing_account_id = "000000-000000-000000"
}

run "variable_validation_accepts_a_good_project_id" {
  command = plan

  assert {
    condition     = var.region == "us-central1"
    error_message = "Region default drifted from the fixed decision."
  }
}
