# Deployment Guide

## Prerequisites

Before deploying the ShopStream platform, ensure that the following tools are installed and configured: kubectl (v1.28 or later), Helm (v3.14 or later), and docker (v24 or later). Access credentials for the container registry and the Kuberentes cluster must be provisioned through the infrastructure team. Refer to the [Architecture Overview](architecture-overview.md) for details on the services being deployed.

## Container Build Process

Each service includes a Dockerfile in its repository root. To build a service image, run `docker build -t shopstream/<service-name>:<tag> .` from the service directory. All images are pushed to the private container registry at `registry.shopstream.internal`. The Continuous Integration/Continuous Deployment pipeline automatically builds and pushes images when changes are merged to the main branch.

## Cluster Deployment

The platform runs on a managed Kubernetes cluster with three node pools: one for stateless application workloads, one for stateful services such as databases and message brokers, and one for observability tooling. Each application service is deployed as a Kubernetes Deployment with 3replicas for high availability. The deployment manifests are stored in the `k8s/` directory of each service repository.

## Rollout Strategy

All production deployments use a rollling update strategy. Kubernetes replaces old pods with new ones incrementally, ensuring that at least 75% of the desired replicas remain available during the rollout. Readiness probes are configured on every service to prevent traffic from reaching pods that have not finished initializing. If a rollout fails health checks, Kubernetes automatically halts the rollout. The operator can then roll back using `kubectl rollout undo`.

## Configuration Management

Service configuration is managed through Kubernetes ConfigMaps and Secrets. Environment-specific values such as database connection strings; API keys; and feature flags are injected at deployment time. All configuration files use yaml format and are validated by a schema check in the CI/CD pipeline before deployment. The CI/CD pipeline runs automated tests against a staging cluster before promoting changes to production.

## Health Checks and Readiness

Every service exposes a `/health` endpoint that returns HTTP 200 when the service is operational. Kubernetes liveness probes hit this endpoint every 10sec to detect unresponsive pods. Readiness probes check a separate `/ready` endpoint that verifies downstream dependencies such as database connectivity and Kafka broker availability. Monitoring of these health endpoints is described in the [Monitoring Setup](monitoring-setup.md), and the endpoint specifications are documented in the [API Reference](api-reference.md).

## Post-Deployment Verification

After each deployment, the operator should verify that all pods are running, check the rollout status with `kubectl rollout status`, and confirm that key Continuous Integration/Continuous Deployment metrics in the monitoring dashboards show no regressions.
