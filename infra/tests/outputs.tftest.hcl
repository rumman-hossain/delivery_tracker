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

run "outputs_carry_the_values_the_env_files_need" {
  command = plan

  assert {
    condition     = output.storage_bucket == "delivery-test-photos"
    error_message = "STORAGE_BUCKET is read straight from this output; it must be the real bucket name."
  }

  assert {
    condition     = output.hosting_url == "https://delivery-test.web.app"
    error_message = "hosting_url must be a full origin so it can be pasted into ALLOWED_ORIGINS."
  }
}
