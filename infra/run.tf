resource "google_artifact_registry_repository" "api" {
  project       = var.project_id
  location      = var.region
  repository_id = "delivery"
  format        = "DOCKER"
  description   = "Container images for the delivery API"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state = "UNTAGGED"
    }
  }

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 3
    }
  }

  depends_on = [time_sleep.api_propagation]
}

resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "delivery-api-run"
  display_name = "Delivery API (Cloud Run runtime)"

  depends_on = [time_sleep.api_propagation]
}

resource "google_project_iam_member" "api" {
  for_each = toset([
    "roles/datastore.user",
    "roles/firebaseauth.admin",
    "roles/storage.objectAdmin",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_service_account_iam_member" "api_token_creator" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = "delivery-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account                  = google_service_account.api.email
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = var.api_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }

        cpu_idle          = true
        startup_cpu_boost = false
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "FIRESTORE_DATABASE"
        value = "(default)"
      }

      env {
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.photos.name
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = join(",", local.browser_origins)
      }

      env {
        name  = "SIGNED_URL_TTL_SECONDS"
        value = "300"
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    time_sleep.api_propagation,
    google_project_iam_member.api,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

// ---------------------------------------------------------------------------
// Cloud Build identity.
//
// New projects no longer get a usable legacy Cloud Build service account: Google
// deprecated it, and a build submitted without an explicit identity fails with a
// PERMISSION_DENIED that names the caller rather than the real cause. This is the
// identity builds run as. It is deliberately separate from the Cloud Run runtime
// account -- a build needs to push images and write logs, and nothing else; it must
// never hold the runtime's Firestore or signing permissions.
// ---------------------------------------------------------------------------

resource "google_service_account" "build" {
  project      = var.project_id
  account_id   = "delivery-api-build"
  display_name = "Delivery API (Cloud Build)"

  depends_on = [time_sleep.api_propagation]
}

resource "google_project_iam_member" "build" {
  for_each = toset([
    "roles/artifactregistry.writer", // push the built image
    "roles/logging.logWriter",       // a user-specified SA cannot use the default log sink
    "roles/storage.objectViewer",    // read the uploaded source tarball
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.build.email}"
}

// A bucket the build writes its logs and cached artifacts to.
//
// Cloud Build otherwise insists on a Google-managed default logs bucket and asks for
// roles/storage.admin across the project to reach it, which is far more than a build
// needs. Owning the bucket keeps the grant scoped to exactly this one. Logs are
// diagnostics, not records, so they expire.
resource "google_storage_bucket" "build_logs" {
  project                     = var.project_id
  name                        = "${var.project_id}-build-logs"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true

  lifecycle_rule {
    condition {
      age = 30
    }

    action {
      type = "Delete"
    }
  }

  depends_on = [time_sleep.api_propagation]
}

// storage.admin, not objectAdmin: Cloud Build's precondition check inspects bucket
// metadata, not just objects, and refuses the build otherwise. It asked for the role
// project-wide; granting it on this one throwaway logs bucket keeps it away from the
// proof-photo bucket, which is the only storage in this project that matters.
resource "google_storage_bucket_iam_member" "build_logs_writer" {
  bucket = google_storage_bucket.build_logs.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.build.email}"
}
