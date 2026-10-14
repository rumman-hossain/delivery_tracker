resource "google_firebaserules_ruleset" "firestore" {
  provider = google-beta

  project = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../api/firestore.rules")
    }
  }

  depends_on = [google_firebase_project.default]
}

resource "google_firebaserules_release" "firestore" {
  provider = google-beta

  name         = "cloud.firestore"
  project      = var.project_id
  ruleset_name = "projects/${var.project_id}/rulesets/${google_firebaserules_ruleset.firestore.name}"

  lifecycle {
    replace_triggered_by = [google_firebaserules_ruleset.firestore]
  }

  depends_on = [google_firestore_database.default]
}

resource "google_firebaserules_ruleset" "storage" {
  provider = google-beta

  project = var.project_id

  source {
    files {
      name    = "storage.rules"
      content = file("${path.module}/../api/storage.rules")
    }
  }

  depends_on = [google_firebase_project.default]
}

resource "google_firebaserules_release" "storage" {
  provider = google-beta

  name         = "firebase.storage/${google_storage_bucket.photos.name}"
  project      = var.project_id
  ruleset_name = "projects/${var.project_id}/rulesets/${google_firebaserules_ruleset.storage.name}"

  lifecycle {
    replace_triggered_by = [google_firebaserules_ruleset.storage]
  }

  depends_on = [google_firebase_storage_bucket.photos]
}
