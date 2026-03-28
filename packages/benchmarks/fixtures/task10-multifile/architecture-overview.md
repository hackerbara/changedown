<!-- changedown.com/v1: tracked -->
# Architecture Overview

## System Design

The ShopStream platform is built on a microservces architecture designed to handle high-throughput e-commerce workloads. Each service owns its data and communicates with other services through well-defined interfaces. The platform currently serves over 2 million active users and processes roughly 15,000 orders per day.

## Core Services

The platform comprises six core services: the Product Catalog Service, the Order Management Service, the User Identity Service, the Payment Gateway Service, the Inventory Service, and the Notification Service. Each service is deployed independently and maintains its own PostgresQL database instance. Services that require real-time data exchange use GRPC for synchronous communication, while event-driven workflows rely on Apache Kafka for asynchronous messaging.

## Communication Patterns

Inter-service communication follows two primary patterns. For request-response interactions that demand low latency, services communicate via gRPC with Protocol Buffers serialization. For event-driven workflows, services publish domain events to kafka topics. The Order Management Service, for example, publishes an `OrderPlaced` event which the Inventory Service and Notification Service both consume independently.

However the choice between synchronuous and asynchronous communication depends on the use case. Operations which require an immediate response, such as payment authorization, use gRPC. Operations that can tolerate eventual consistency, such as sending confirmation emails, use Kafka event streams. This separation ensures that a slow downstream consumer does not block the critical order path.

## Data Architecture

Each service maintains its own database, enforcing strict data ownership boundaries. The Product Catalog Service uses PostgreSQL with full-text search extensions for product queries. The Order Management Service uses PostgreSQL with partitioned tables for historical order data. The User Identity Service stores credentials and session tokens in a dedicated PostgreSQL instance with row-level encryption enabled.

## Infrastructure Requirements

All services are containerized and deployed to a Kubernetes cluster. Each service container is allocated a maximum of 128mb of memory, with CPU limits varying by workload profile. The Kafka cluster runs on dedicated nodes with SSD-backed storage to sustain the required message throughput. Detailed deployment procedures are documented in the [Deployment Guide](deployment-guide.md), and monitoring configuration is covered in the [Monitoring Setup](monitoring-setup.md).

## API Layer

External clients interact with the platform through a unified API gateway that routes requests to the appropriate backend service. The gateway handles authentication, rate limiting, and request validation before forwarding traffic. A complete reference for all public endpoints is available in the [API Reference](api-reference.md).
