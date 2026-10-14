resource "google_firebase_project" "default" {
  provider = google-beta

  project    = var.project_id
  depends_on = [time_sleep.api_propagation]
}

resource "google_identity_platform_config" "default" {
  project = var.project_id

  sign_in {
    email {
      enabled           = true
      password_required = true
    }

    phone_number {
      enabled            = false
      test_phone_numbers = {}
    }
  }

  client {
    permissions {
      disabled_user_signup = true

      disabled_user_deletion = true
    }
  }

  authorized_domains = concat([
    "localhost",
    "${google_firebase_hosting_site.default.site_id}.firebaseapp.com",
    "${google_firebase_hosting_site.default.site_id}.web.app",
  ], var.custom_domains)

  depends_on = [google_firebase_project.default]
}

resource "google_firebase_hosting_site" "default" {
  provider = google-beta

  project = var.project_id
  site_id = var.site_id

  depends_on = [google_firebase_project.default]
}

resource "google_firebase_web_app" "default" {
  provider = google-beta

  project         = var.project_id
  display_name    = "Delivery Tracker"
  deletion_policy = "DELETE"

  depends_on = [google_firebase_project.default]
}

data "google_firebase_web_app_config" "default" {
  provider = google-beta

  project    = var.project_id
  web_app_id = google_firebase_web_app.default.app_id
}
