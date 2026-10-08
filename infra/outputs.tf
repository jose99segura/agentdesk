output "registry" {
  description = "Where images are pushed."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "api_url" {
  value = local.deployed ? google_cloud_run_v2_service.api[0].uri : null
}

output "dashboard_url" {
  value = local.deployed ? google_cloud_run_v2_service.dashboard[0].uri : null
}

output "worker_url" {
  value = local.deployed ? google_cloud_run_v2_service.worker[0].uri : null
}
