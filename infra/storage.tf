resource "google_storage_bucket" "photos" {
  provider = google-beta

  project                     = var.project_id
  name                        = "${var.project_id}-photos"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  cors {
    origin          = local.browser_origins
    method          = ["PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age        = 30
      with_state = "LIVE"
    }

    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age        = var.photo_retention_days
      with_state = "LIVE"
    }

    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = var.photo_retention_days
      with_state                 = "ARCHIVED"
    }

    action {
      type = "Delete"
    }
  }

  depends_on = [time_sleep.api_propagation]
}

resource "google_firebase_storage_bucket" "photos" {
  provider = google-beta

  project   = var.project_id
  bucket_id = google_storage_bucket.photos.name

  depends_on = [google_firebase_project.default]
}
