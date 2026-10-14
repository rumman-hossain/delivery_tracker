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

run "bucket_is_the_firebase_default_and_locked_down" {
  command = plan

  assert {
    condition     = google_storage_bucket.photos.name == "delivery-test-photos"
    error_message = "The default .firebasestorage.app bucket cannot be Terraform-provisioned since Oct 2024, and a dotted name needs domain verification; this must be an additional, dotless-named bucket."
  }

  assert {
    condition     = google_storage_bucket.photos.uniform_bucket_level_access == true
    error_message = "Per-object ACLs would bypass storage.rules; uniform access must be on."
  }

  assert {
    condition     = google_storage_bucket.photos.public_access_prevention == "enforced"
    error_message = "Proof photos are evidence and must never be world-readable."
  }

  assert {
    condition     = google_storage_bucket.photos.location == "US-CENTRAL1"
    error_message = "The bucket region is permanent once created; it must be us-central1."
  }
}

run "bucket_permits_the_signed_put_upload_from_a_browser" {
  command = plan

  assert {
    condition     = anytrue([for c in google_storage_bucket.photos.cors : contains(c.method, "PUT")])
    error_message = "Without PUT in CORS the signed-URL upload fails preflight in every browser."
  }

  assert {
    condition     = anytrue([for c in google_storage_bucket.photos.cors : contains(c.response_header, "Content-Type")])
    error_message = "The signed URL pins Content-Type: image/jpeg, so that header must be allowed."
  }

  assert {
    condition     = anytrue([for c in google_storage_bucket.photos.cors : contains(c.origin, "http://localhost:5173")])
    error_message = "Local dev against the deployed bucket must work, or photo upload cannot be developed."
  }

  assert {
    condition     = anytrue([for c in google_storage_bucket.photos.cors : contains(c.origin, "https://delivery-test.web.app")])
    error_message = "Dropping the Hosting origin from CORS would silently break photo upload from the deployed PWA."
  }

  assert {
    condition     = anytrue([for c in google_storage_bucket.photos.cors : contains(c.origin, "https://delivery-test.firebaseapp.com")])
    error_message = "Hosting also serves the site on .firebaseapp.com; that origin must be allowed too or it fails CORS."
  }
}

run "photos_get_cheaper_then_expire" {
  command = plan

  assert {
    condition = anytrue([
      for r in google_storage_bucket.photos.lifecycle_rule :
      anytrue([for a in r.action : a.type == "Delete"])
    ])
    error_message = "A lifecycle rule bounds storage growth; without it the bucket grows forever."
  }

  assert {
    condition = anytrue([
      for r in google_storage_bucket.photos.lifecycle_rule :
      anytrue([for a in r.action : a.type == "SetStorageClass" && a.storage_class == "NEARLINE"])
    ])
    error_message = "Photos are write-once/read-rarely; they must tier to Nearline rather than sit in Standard."
  }
}
