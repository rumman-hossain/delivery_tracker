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

run "email_password_sign_in_is_enabled_and_requires_a_password" {
  command = plan

  assert {
    condition     = google_identity_platform_config.default.sign_in[0].email[0].enabled == true
    error_message = "Firebase Auth email/password is the only sign-in method this app supports."
  }

  assert {
    condition     = google_identity_platform_config.default.sign_in[0].email[0].password_required == true
    error_message = "Email-link sign-in is not part of the design; a password must be required."
  }
}

run "hosting_site_matches_the_requested_id" {
  command = plan

  assert {
    condition     = google_firebase_hosting_site.default.site_id == "delivery-test"
    error_message = "The hosting site id determines the origin the API must allow in CORS."
  }
}
