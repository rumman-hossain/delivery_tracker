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

run "database_is_native_in_the_fixed_region_and_protected" {
  command = plan

  assert {
    condition     = google_firestore_database.default.type == "FIRESTORE_NATIVE"
    error_message = "Datastore mode would break every query the store package makes."
  }

  assert {
    condition     = google_firestore_database.default.location_id == "us-central1"
    error_message = "Firestore location is permanent; it must be us-central1."
  }

  assert {
    condition     = google_firestore_database.default.delete_protection_state == "DELETE_PROTECTION_ENABLED"
    error_message = "Delete protection must be on: this database holds the only copy of trip evidence."
  }
}

run "all_six_indexes_from_the_spec_exist" {
  command = plan

  assert {
    condition     = length(google_firestore_index.this) == 8
    error_message = "api/firestore.indexes.json defines eight composite indexes; all eight must be declared."
  }

  assert {
    condition     = contains(keys(google_firestore_index.this), "trips_driver_date_status_created")
    error_message = "Missing the index behind ListTrips filtered by driver and assigned date."
  }

  assert {
    condition     = contains(keys(google_firestore_index.this), "events_type_seq")
    error_message = "Missing the events index that orders a trip's stops by sequence."
  }

  assert {
    condition = [
      for f in google_firestore_index.this["trips_driver_date_status_created"].fields :
      { field_path = f.field_path, order = f.order }
      ] == [
      { field_path = "driverUid", order = "ASCENDING" },
      { field_path = "assignedDate", order = "ASCENDING" },
      { field_path = "status", order = "ASCENDING" },
      { field_path = "createdAt", order = "DESCENDING" },
    ]
    error_message = "trips_driver_date_status_created must be driverUid ASC, assignedDate ASC, status ASC, createdAt DESC in that exact order, or the query it serves won't use it."
  }
}
