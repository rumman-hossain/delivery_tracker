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

run "runtime_sa_holds_exactly_the_three_project_roles" {
  command = plan

  assert {
    condition     = length(google_project_iam_member.api) == 3
    error_message = "The runtime needs Firestore, Firebase Auth admin and object admin - no more, no less."
  }

  assert {
    condition     = contains(keys(google_project_iam_member.api), "roles/storage.objectAdmin")
    error_message = "Without objectAdmin the API cannot write or read proof photos."
  }

  assert {
    condition     = contains(keys(google_project_iam_member.api), "roles/firebaseauth.admin")
    error_message = "Without firebaseauth.admin the API cannot provision drivers or set role claims."
  }
}

run "runtime_sa_can_sign_urls_as_itself" {
  command = plan

  assert {
    condition     = google_service_account_iam_member.api_token_creator.role == "roles/iam.serviceAccountTokenCreator"
    error_message = "V4 signing on Cloud Run needs the SA to be a token creator on itself; this binding must exist."
  }

  assert {
    condition     = google_service_account_iam_member.api_token_creator.member == "serviceAccount:${google_service_account.api.email}"
    error_message = "The token-creator binding must name the runtime SA itself, not another principal."
  }
}

run "image_storage_is_bounded" {
  command = plan

  assert {
    condition     = anytrue([for p in google_artifact_registry_repository.api.cleanup_policies : p.action == "DELETE"])
    error_message = "Untagged images must be deleted or Artifact Registry grows past the free tier."
  }
}
