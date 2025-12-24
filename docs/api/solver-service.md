# Solver Service API

This document describes the Solver Service API for the GTO Poker Trainer. It covers authentication, rate limits, local fast-path execution, cloud asynchronous workflows, request/response schemas, and common error handling patterns.

## Conventions
- **Base URL (cloud)**: `https://api.pokertrnr.example.com`
- **Base URL (local fast-path)**: `http://localhost:8080`
- **Headers**:
  - `Authorization: Bearer <token>` (required for all endpoints unless noted)
  - `Content-Type: application/json` for requests with bodies
  - `Accept: application/json`
- **Identifiers**: `jobId` values are UUID strings.
- **Timestamps**: ISO-8601 in UTC (e.g., `2024-04-23T18:25:43Z`).

## Rate Limits
- Default: **60 requests/minute** per API key unless otherwise specified.
- Burst behavior: token bucket with capacity 20; exceeding capacity returns `429 Too Many Requests` with `Retry-After` header.
- Local fast-path endpoints are not rate limited but are bounded by local resource constraints.

## Error Model
Errors follow a consistent JSON envelope:

```json
{
  "error": {
    "code": "string",
    "message": "human readable",
    "details": { "optional": "context" }
  }
}
```

Common HTTP statuses:
- `400 Bad Request`: validation failure (missing fields, invalid range, conflicting constraints)
- `401 Unauthorized`: missing/invalid token
- `403 Forbidden`: insufficient scope or quota exhausted
- `404 Not Found`: unknown job ID or endpoint
- `409 Conflict`: job state prevents action (e.g., cancel on a completed job)
- `422 Unprocessable Entity`: structurally correct but semantically invalid input (e.g., unsupported game variant)
- `429 Too Many Requests`: rate limit exceeded (cloud only)
- `500 Internal Server Error`: unexpected server failure
- `503 Service Unavailable`: transient capacity issue; include `Retry-After`

## Local Fast-Path Endpoint
Low-latency solving for small problems executed on the caller's host.

### `POST /solve/local`
- **Purpose**: Synchronous solve with strict resource caps to avoid local starvation.
- **Constraints**:
  - `maxNodes`: ≤ **100,000** (hard limit)
  - `timeCapMs`: ≤ **2,000 ms** (hard limit)
  - Supported variants: `nlhe` and `plo` only.
- **Request Body**

```json
{
  "variant": "nlhe",
  "hand": "AsKh",
  "board": "QcJd2c",
  "stackSize": 100.0,
  "potSize": 10.0,
  "maxNodes": 50000,
  "timeCapMs": 1500,
  "randomSeed": 42
}
```

- **Response (200 OK)**

```json
{
  "solution": {
    "nodeCount": 48750,
    "exploitability": 0.012,
    "strategy": { "bet": 0.65, "check": 0.35 }
  },
  "meta": {
    "durationMs": 1420,
    "truncated": false,
    "requestId": "9c0d4ad1-5f44-4e2e-a9b3-7f3d3200b9a2"
  }
}
```

- **Response (422 Unprocessable Entity)**

```json
{
  "error": {
    "code": "constraint_violation",
    "message": "maxNodes exceeds local limit",
    "details": { "maxAllowed": 100000 }
  }
}
```

## Cloud Asynchronous Workflow
Longer-running solves are queued and executed in the cloud.

### `POST /solve`
- **Purpose**: Enqueue a solve job for asynchronous processing.
- **Request Body**

```json
{
  "variant": "nlhe",
  "hand": "AsKh",
  "board": "QcJd2c",
  "stackSize": 200.0,
  "potSize": 20.0,
  "maxNodes": 2000000,
  "timeCapMs": 15000,
  "precision": "high",
  "notifyUrl": "https://app.example.com/hooks/solver"
}
```

- **Responses**
  - `202 Accepted`

```json
{
  "jobId": "3f6f4c7c-2f4c-42b2-8f2c-4b3e6a5569ba",
  "status": "queued",
  "queuedAt": "2024-05-01T12:00:00Z",
  "etaSeconds": 45
}
```

  - Errors use standard envelope (e.g., `401`, `403`, `422`).

### `GET /jobs/{id}`
- **Purpose**: Retrieve job status or finished results.
- **Path Parameter**: `id` — job ID (UUID).
- **Responses**
  - `200 OK` (in-progress)

```json
{
  "jobId": "3f6f4c7c-2f4c-42b2-8f2c-4b3e6a5569ba",
  "status": "running",
  "progress": { "percent": 64, "nodeCount": 1200000 },
  "submittedAt": "2024-05-01T12:00:00Z",
  "startedAt": "2024-05-01T12:00:10Z"
}
```

  - `200 OK` (completed)

```json
{
  "jobId": "3f6f4c7c-2f4c-42b2-8f2c-4b3e6a5569ba",
  "status": "succeeded",
  "result": {
    "exploitability": 0.006,
    "strategy": { "bet": 0.72, "check": 0.28 },
    "nodeCount": 2100000
  },
  "submittedAt": "2024-05-01T12:00:00Z",
  "startedAt": "2024-05-01T12:00:10Z",
  "finishedAt": "2024-05-01T12:00:24Z"
}
```

  - `200 OK` (failed)

```json
{
  "jobId": "3f6f4c7c-2f4c-42b2-8f2c-4b3e6a5569ba",
  "status": "failed",
  "error": {
    "code": "solver_failure",
    "message": "Diverged during CFR",
    "details": { "lastStableNode": 1800000 }
  },
  "submittedAt": "2024-05-01T12:00:00Z",
  "startedAt": "2024-05-01T12:00:10Z",
  "finishedAt": "2024-05-01T12:00:24Z"
}
```

  - `404 Not Found` if the job ID does not exist.

### `POST /jobs/{id}/cancel`
- **Purpose**: Request cancellation of a pending or running job.
- **Path Parameter**: `id` — job ID (UUID).
- **Responses**
  - `202 Accepted`

```json
{
  "jobId": "3f6f4c7c-2f4c-42b2-8f2c-4b3e6a5569ba",
  "status": "cancel_requested"
}
```

  - `409 Conflict` if the job is already `succeeded` or `failed`.
  - `404 Not Found` if the job ID does not exist.

## Validation Rules & Constraints
- `maxNodes` and `timeCapMs` must be positive integers.
- `precision` must be one of `standard`, `high`, or `ultra` for cloud solves.
- `notifyUrl` must be HTTPS if provided.
- For local solves, combined constraints (nodes/time) are enforced server-side and return `422` on violation.
- Cloud solves may be capped by account-level quotas; quota breaches return `403` with `code: "quota_exceeded"`.

## Idempotency & Retries
- Use `Idempotency-Key` header on `POST /solve` to safely retry client timeouts; duplicate keys return the original job record.
- Clients should back off using `Retry-After` when receiving `429` or `503` responses.

## Observability
- Responses include `requestId` in headers for log correlation.
- Cloud jobs emit state change webhooks to `notifyUrl` with the same payloads as `GET /jobs/{id}` responses.

## Sample Error Responses
- **401 Unauthorized**

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid token"
  }
}
```

- **429 Too Many Requests**

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests; retry after 15 seconds"
  }
}
```
