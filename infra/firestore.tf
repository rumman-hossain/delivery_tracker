resource "google_firestore_database" "default" {
  project                     = var.project_id
  name                        = "(default)"
  location_id                 = var.region
  type                        = "FIRESTORE_NATIVE"
  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"

  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [time_sleep.api_propagation]
}

locals {
  firestore_indexes = {
    trips_driver_date_status_created = {
      collection = "trips"
      fields = [
        { field_path = "driverUid", order = "ASCENDING" },
        { field_path = "assignedDate", order = "ASCENDING" },
        { field_path = "status", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    trips_driver_status_created = {
      collection = "trips"
      fields = [
        { field_path = "driverUid", order = "ASCENDING" },
        { field_path = "status", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    trips_date_status_created = {
      collection = "trips"
      fields = [
        { field_path = "assignedDate", order = "ASCENDING" },
        { field_path = "status", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    trips_status_created = {
      collection = "trips"
      fields = [
        { field_path = "status", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    trips_driver_created = {
      collection = "trips"
      fields = [
        { field_path = "driverUid", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    trips_date_created = {
      collection = "trips"
      fields = [
        { field_path = "assignedDate", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    trips_driver_date_created = {
      collection = "trips"
      fields = [
        { field_path = "driverUid", order = "ASCENDING" },
        { field_path = "assignedDate", order = "ASCENDING" },
        { field_path = "createdAt", order = "DESCENDING" },
      ]
    }
    events_type_seq = {
      collection = "events"
      fields = [
        { field_path = "type", order = "ASCENDING" },
        { field_path = "seq", order = "ASCENDING" },
      ]
    }
  }
}

resource "google_firestore_index" "this" {
  for_each = local.firestore_indexes

  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = each.value.collection
  query_scope = "COLLECTION"

  dynamic "fields" {
    for_each = each.value.fields

    content {
      field_path = fields.value.field_path
      order      = fields.value.order
    }
  }
}
