
# HTTP/3 Protocol Implementation Guide for Edge Computing Networks

**Version:** 2.1
**Date:** 2026-01-20
**Author:** @network-engineering
**Status:** Final Draft
**Classification:** Internal

## Executive Summary

This document provides a comprehensive implementation guide for deploying HTTP/3 across our edge computing infrastructure. The migration from HTTP/2 to HTTP/3 is motivated by the need for improved connection establishment times, better handling of packet loss in mobile networks, and native support for connection migration.

The protocol stack replaces TCP+TLS with QUIC, a UDP-based transport protocol that integrates encryption at the transport layer. Initial testing shows a reduction in page load times of 15-30% for users on high-latency mobile networks, with negligible impact on datacenter-to-datacenter communication.

Deployment will proceed in three phases across our 14 edge locations, with full rollout targeted for Q2 2026. Each phase includes performance validation, security audit, and capacity planning review.

## 1. Protocol Overview

### 1.1 Transport Layer

HTTP/3 uses QUIC (Quick UDP Internet Connections) as its transport protocol. Unlike TCP, QUIC provides built-in encryption using TLS 1.3 and supports multiplexed streams without head-of-line blocking. Each stream operates independently — a lost packet on one stream does not block other streams.

The Maximum Transmission Unit (MTU) for QUIC packets is set to 1280 bytes to avoid fragmentation on most network paths. This is smaller than the typical TCP Maximum Segment Size (MSS) of 1460 bytes, but the reduction in head-of-line blocking more than compensates for the smaller payload size.

Connection establishment requires a single round trip (1-RTT) for new connections and zero round trips (0-RTT) for resumed connections. The 0-RTT mode uses previously cached cryptographic parameters, reducing connection latency from between 10-20 milliseconds to effectively zero for returning clients.

### 1.2 Stream Multiplexing

QUIC supports up to 2^62 concurrent streams per connection. In practice, our edge proxies limit this to 256 concurrent streams per client connection. Each stream has independent flow control with a default window size of 256 KB.

Stream priorities follow the Extensible Priority Scheme (RFC 9218) with 8 urgency levels (0-7) and an incremental flag. Priority signals are advisory — the server can override client priorities based on server-side policies configured in the edge proxy.

### 1.3 Performance Characteristics

Under controlled testing conditions, HTTP/3 shows the following throughput characteristics compared to HTTP/2:

| Metric | HTTP/2 | HTTP/3 | Improvement |
|---|---|---|---|
| Connection setup (cold) | 3-RTT | 1-RTT | 66% faster |
| Connection setup (warm) | 1-RTT | 0-RTT | 100% faster |
| Page load (3G, 300ms RTT) | 4.2s | 3.1s | 26% faster |
| Page load (LTE, 50ms RTT) | 1.1s | 0.95s | 14% faster |
| Goodput at 5% packet loss | 82% | 94% | +12 points |
| Goodput at 0.1% packet loss | 99.2% | 99.5% | +0.3 points |

Tests were conducted with 1500 ms connection timeout on a simulated network with variable latency. Sample size was approximately 500 requests per configuration.

## 2. Architecture Requirements

### 2.1 Edge Proxy Configuration

Each edge location runs a QUIC-capable reverse proxy (Envoy 1.29+ with QUIC listener enabled). The proxy handles:

- TLS 1.3 certificate management via cert-manager with automatic rotation
- Connection pooling with upstream services (HTTP/2 to origin)
- Rate limiting per client IP and per authenticated identity
- Request routing based on Host header and path prefix
- Health checking of upstream services (active and passive)
- Logging of all connection metrics to the telemetry pipeline

The proxy exposes both TCP (ports 80/443) and UDP (port 443) listeners. Clients that do not support HTTP/3 fall back to HTTP/2 over TCP automatically via the Alt-Svc header mechanism.

### 2.2 Certificate Requirements

QUIC mandates TLS 1.3 with specific cipher suites. Our deployment uses:

- **Key exchange:** X25519 (Curve25519 ECDH)
- **Signature:** ECDSA with P-256 or Ed25519
- **Encryption:** AES-128-GCM or ChaCha20-Poly1305
- **Certificate chain:** Maximum 3 certificates, total size under 4 KiB
- **Key size:** Minimum 2048 bits for RSA (legacy only), 256 bits for ECDSA

Certificates are rotated every 30 days. The proxy supports both ECDSA and RSA certificates simultaneously during the migration period, preferring ECDSA when the client supports it.

### 2.3 Network Requirements

QUIC relies on UDP, which introduces specific network requirements:

1. All edge firewalls must allow UDP port 443 inbound and outbound
2. NAT devices must support UDP connection tracking with a minimum timeout of 30 seconds
3. Load balancers must support UDP flow affinity (connection ID-based routing)
4. DDoS mitigation must distinguish legitimate QUIC traffic from UDP floods
5. Quality of Service policies must treat QUIC traffic equivalently to TCP/TLS traffic

**Note:** Some enterprise networks block UDP port 443. The proxy's TCP fallback ensures connectivity in these environments, though users will not benefit from HTTP/3's performance improvements.

## 3. Security Considerations

### 3.1 Authentication and Authorization

All client connections require authentication via one of three mechanisms:

1. **Mutual TLS (mTLS):** Client presents a certificate signed by our internal CA. Used for service-to-service communication.
2. **JWT bearer tokens:** Issued by the identity provider, validated at the edge proxy. Token lifetime is 1 hour with sliding refresh.
3. **API keys:** Static keys for legacy integrations. Deprecated — all new integrations must use JWT.

The edge proxy extracts the client identity from the authentication credential and attaches it to all upstream requests via the `X-Client-Identity` header. Upstream services trust this header because it originates from a trusted proxy within the service mesh.

### 3.2 Encryption and Key Management

QUIC integrates encryption at the transport layer using Transport Layer Security 1.3. All data in transit is encrypted — there is no plaintext QUIC. The handshake negotiates a shared secret using X25519 and derives traffic keys using HKDF-SHA256.

Session tickets enable 0-RTT resumption but introduce a replay attack vector. Our deployment mitigates this by:

- Limiting 0-RTT to idempotent requests (GET, HEAD, OPTIONS)
- Maintaining a server-side strike register to reject duplicate tickets
- Setting ticket lifetime to 300 seconds (5 minutes)
- Rotating ticket encryption keys every 3600 seconds (1 hour)

### 3.3 Connection Migration

QUIC connections survive IP address changes (e.g., WiFi to cellular handoff). This is a security-sensitive feature because it allows a connection to continue from a different network address without re-authentication.

Our implementation restricts connection migration as follows:

- Migration is only allowed for persistent connections with mTLS client certificates
- The server validates the new path using a PATH_CHALLENGE/PATH_RESPONSE exchange
- Migration events are logged to the security audit stream
- Maximum of 5 migrations per connection lifetime

## 4. Deployment Plan

### 4.1 Phase 1: Canary (Weeks 1-2)

Deploy HTTP/3 support to a single edge location (us-east-1-edge-01) with 1% of traffic routed via QUIC. Monitor for:

- Connection success rate (target: > 99.5%)
- P50/P99 latency regression vs HTTP/2 baseline
- Memory and CPU utilization on edge proxies
- Error rates by type (handshake failures, stream resets, timeouts)

### 4.2 Phase 2: Regional Rollout (Weeks 3-6)

Expand to all edge locations in the primary region (us-east-1, us-west-2). Increase QUIC traffic allocation to 25%, then 50%, then 100% over 4 weeks. Key validation criteria:

- No increase in error rate above 0.01% over HTTP/2 baseline
- P99 latency within 5% of HTTP/2 for equivalent request profiles
- Content Delivery Network cache hit rates remain stable
- No increase in customer support tickets related to connectivity

### 4.3 Phase 3: Global Rollout (Weeks 7-10)

Deploy to remaining edge locations (eu-west-1, eu-central-1, ap-southeast-1, ap-northeast-1). Each region follows the same canary → 25% → 100% progression over 2 weeks.

Global deployment introduces additional complexity:

- Round Trip Time (RTT) variations across regions (20ms intra-region to 200ms cross-region)
- Different ISP behaviors regarding UDP traffic (some throttle)
- Regulatory requirements for encryption in certain jurisdictions
- Time zone considerations for maintenance windows

## 5. Configuration Reference

### 5.1 Edge Proxy Configuration

```yaml
listeners:
  - name: quic_listener
    address: 0.0.0.0:443
    protocol: UDP
    filter_chains:
      - transport_socket:
          name: quic_transport
          config:
            tls_params:
              cipher_suites: [TLS_AES_128_GCM_SHA256, TLS_CHACHA20_POLY1305_SHA256]
              min_version: TLS_1_3
              max_version: TLS_1_3
            idle_timeout: 300s
            max_concurrent_streams: 256
            initial_stream_window_size: 262144  # 256 KiB
            initial_connection_window_size: 1048576  # 1 MiB
```

### 5.2 Client Detection

Clients advertise HTTP/3 support through the Alt-Svc header returned in HTTP/2 responses. The header format is:

```
Alt-Svc: h3=":443"; ma=86400
```

This tells the client that HTTP/3 is available on the same host, port 443, with a maximum age of 86400 seconds (24 hours). Clients that support HTTP/3 will attempt a QUIC connection on subsequent requests.

Fallback detection: if a client's QUIC connection fails three consecutive times, the proxy sets a cookie (`_h3_fallback=1; Max-Age=3600`) to suppress Alt-Svc headers for that client for 1 hour. This prevents clients behind UDP-blocking firewalls from repeatedly attempting failed QUIC connections.

### 5.3 Monitoring Configuration

The following metrics are exported to Prometheus and visualized in Grafana:

| Metric | Labels | Alert Threshold |
|---|---|---|
| `quic_connections_total` | `status={success,failed,migrated}` | Failed > 1% of total |
| `quic_handshake_duration_ms` | `type={initial,0rtt,retry}` | P99 > 100ms |
| `quic_stream_errors_total` | `code={flow_control,reset,timeout}` | > 10/min sustained |
| `quic_path_validation_failures` | `reason={timeout,mismatch}` | > 5/min |
| `quic_0rtt_replay_blocked` | — | > 100/hour |
| `quic_connection_migrations` | `from={wifi,cellular,wired}` | — (informational) |

Alert routing follows the standard on-call rotation. Critical alerts (connection failure > 1%) page immediately. Warning alerts occurred more than 3 times in 10 minutes trigger a Slack notification.

## 6. Troubleshooting

### 6.1 Common Issues

**Q: Clients are not upgrading to HTTP/3.**
A: Verify that the Alt-Svc header is present in HTTP/2 responses. Check that UDP port 443 is not blocked by intermediate firewalls. Some corporate proxies strip Alt-Svc headers — clients behind these proxies will never discover HTTP/3 support.

**Q: 0-RTT connections are being rejected.**
A: This occurs when session tickets have expired (lifetime > 300s) or when the ticket encryption key has been rotated. Check the `quic_0rtt_replay_blocked` metric — if it is elevated, the strike register is functioning correctly and rejecting replay attempts.

**Q: Connection migrations are failing.**
A: Ensure the PATH_CHALLENGE/PATH_RESPONSE exchange completes within the configured timeout (5 seconds). NAT rebinding on the new path can cause the response to arrive from a different source port. Verify that the load balancer supports connection ID-based routing rather than 5-tuple routing.

**Q: Higher latency than HTTP/2 for some requests.**
A: QUIC's congestion control (Cubic by default) can be more conservative than TCP's on low-loss networks. Consider switching to BBRv2 for datacenter-to-edge links where packet loss is minimal and bandwidth is well-provisioned. See Section 3.2 for encryption overhead details.

### 6.2 Diagnostic Tools

- **qlog:** QUIC-specific logging format that captures connection-level events. Enable with `QUIC_LOG_DIR=/var/log/qlog` environment variable.
- **Wireshark:** Version 4.0+ supports QUIC dissection. Use display filter `quic` and provide the TLS keys file for decryption.
- **curl:** Version 8.6+ supports HTTP/3 natively. Use `--http3` flag: `curl --http3 https://edge.example.com/health`
- **h3i:** Interactive HTTP/3 client for debugging. Useful for testing specific frame types and error conditions.

## 7. Migration Checklist

Before enabling HTTP/3 at each edge location, verify the following items have been addressed separately for each deployment environment:

- [ ] UDP port 443 is open in all relevant firewall rules
- [ ] Load balancer supports QUIC connection ID routing
- [ ] TLS 1.3 certificates are deployed and valid
- [ ] Edge proxy is running Envoy 1.29+ with QUIC listener enabled
- [ ] DDoS mitigation rules updated to allow legitimate QUIC traffic
- [ ] Monitoring dashboards and alerts configured
- [ ] Rollback procedure documented and tested
- [ ] On-call team briefed on QUIC-specific troubleshooting
- [ ] Client fallback behavior verified for UDP-blocked environments
- [ ] 0-RTT replay protection (strike register) operational
- [ ] Connection migration policies configured per security requirements
- [ ] Performance baseline captured for comparison with HTTP/2
- [ ] JSON logging format for QUIC events verified in telemetry pipeline
- [ ] Certificate rotation schedule confirmed with cert-manager

## Appendix A: Glossary

| Term | Definition |
|---|---|
| 0-RTT | Zero Round Trip Time — connection resumption without a handshake round trip |
| Alt-Svc | Alternative Services — HTTP header advertising protocol upgrade availability |
| BBR | Bottleneck Bandwidth and Round-trip propagation time — congestion control algorithm |
| CDN | Content Delivery Network — distributed cache infrastructure |
| ECDSA | Elliptic Curve Digital Signature Algorithm |
| HKDF | HMAC-based Key Derivation Function |
| MTU | Maximum Transmission Unit — largest packet size without fragmentation |
| QUIC | Quick UDP Internet Connections — UDP-based transport protocol |
| RTT | Round Trip Time — time for a packet to travel to destination and back |
| TLS | Transport Layer Security — cryptographic protocol for secure communication |

## Appendix B: References

1. RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport
2. RFC 9001 — Using TLS to Secure QUIC
3. RFC 9002 — QUIC Loss Detection and Congestion Control
4. RFC 9114 — HTTP/3
5. RFC 9218 — Extensible Prioritization Scheme for HTTP
6. Internal: Edge Proxy Operations Runbook (Confluence)
7. Internal: Network Security Policy v4.2
