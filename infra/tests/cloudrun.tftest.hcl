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

run "service_scales_to_zero_and_is_capped" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].scaling[0].min_instance_count == 0
    error_message = "A warm instance would turn a free deployment into a monthly bill."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].scaling[0].max_instance_count == 3
    error_message = "An unbounded max instance count is the main runaway-cost risk on Cloud Run."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.template[0].containers[0].resources[0].cpu_idle == true
    error_message = "cpu_idle=false bills for allocated CPU between requests."
  }

  assert {
    condition     = google_cloud_run_v2_service.api.location == "us-central1"
    error_message = "The Cloud Run region is permanent once created; it must be us-central1."
  }
}

run "env_matches_the_backend_config_contract" {
  command = plan

  assert {
    condition = length(setsubtract(
      ["GOOGLE_CLOUD_PROJECT", "FIRESTORE_DATABASE", "STORAGE_BUCKET", "ALLOWED_ORIGINS", "SIGNED_URL_TTL_SECONDS"],
      [for e in google_cloud_run_v2_service.api.template[0].containers[0].env : e.name]
    )) == 0
    error_message = "config.Load() fails fast on any missing var; all five must be set."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.api.template[0].containers[0].env :
      e.name == "ALLOWED_ORIGINS" && can(regex("delivery-test.web.app", e.value))
    ])
    error_message = "ALLOWED_ORIGINS must contain the Hosting origin or every browser request fails preflight."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.api.template[0].containers[0].env :
      e.name == "PORT"
    ]) == false
    error_message = "PORT is injected by Cloud Run; setting it manually is rejected at deploy time."
  }
}

run "service_is_publicly_invokable" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service_iam_member.public.member == "allUsers"
    error_message = "allow-unauthenticated is intentional: auth is enforced in-app against the Firebase token."
  }
}
