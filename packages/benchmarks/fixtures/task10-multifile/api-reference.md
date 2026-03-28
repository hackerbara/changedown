<!-- changedown.com/v1: tracked -->
# API Reference

## Overview

The ShopStream platform exposes a Rest API through a unified gateway. All endpoints require authenication via Bearer tokens issued by the User Identity Service. The API follows RESTful conventions and returns json responses with standard HTTP status codes. For architectural context on the services behind these endpoints, see the [Architecture Overview](architecture-overview.md).

## Base URL

All API requests should be directed to `https://api.shopstream.io/v2.0`. Rate limiting is enforced at 1,000 requests per minute per API key. Requests that exceed this limit receive an HTTP 429 reponse with a `Retry-After` header.

## Authentication

To obtain an access token, send a POST request to `/auth/token` with valid credentials in the request body. The token endpoint accepts `application/json` content type and returns a signed JWT with a configurable expiration. Tokens must be included in the `Authorization` header of all subsequent requests. Failed authenication attempts are logged and monitored as described in the [Monitoring Setup](monitoring-setup.md).

## Product Catalog

The Product Catalog Service exposes the following endpoints:

- `GET /products` returns a paginated list of products. Supports query paramters for filtering by category, price range, and availability.
- `GET /products/:id` returns detailed information for a single product, including pricing, inventory status, and related items
- `POST /products` creates a new product listing. Requires an admin-scoped token.

## Order Management

The Order Management Service provides endpoints for the complete order lifecycle:

- `POST /orders` creates a new order. The request body must include line items, shipping address, and payment method. The service validates inventory availability before confirming the order.
- `GET /orders/:id` retrieves the current status and details of an existing order.
- `PUT /orders/:id/cancel` cancels a pending order. Orders that have already entered the fulfillment pipeline cannot be cancelled through this endpoint.

## Response Format

All endpoints return a standard JSON envelope with the following structure: a `data` field containing the requested resource, a `meta` field with pagination information where applicable, and an `errors` array present only when the request fails. Successful requests return HTTP 200 with a response latency target of 200ms as measured at the gateway. Error responses include a machine-readable error code and a human-readable message.

## Deployment and Versioning

API deployments follow the rollout procedures described in the [Deployment Guide](deployment-guide.md). The REST API uses URL-based versioning with the version paramter included in the base path. Breaking changes are introduced under a new version prefix, and previous versions remain available for a deprecation period of six months.
