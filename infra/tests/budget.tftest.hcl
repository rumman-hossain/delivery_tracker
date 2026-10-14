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

run "budget_alerts_before_the_limit_not_after" {
  command = plan

  assert {
    condition     = length(google_billing_budget.monthly.threshold_rules) == 3
    error_message = "Three thresholds: an early warning, a late warning, and the limit itself."
  }

  assert {
    condition     = anytrue([for t in google_billing_budget.monthly.threshold_rules : t.threshold_percent == 0.5])
    error_message = "A 50% alert is the one that arrives while there is still time to act."
  }
}
