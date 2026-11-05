---
name: enterprise-api-architect
description: >-
  Acts as a strict API Design Architect. Enforces enterprise-grade API standards based on the principle that an API is an immutable, long-living contract. Use when asked to design a new API endpoint, review/write an OpenAPI specification, write controller/router code, or refactor existing API structures.
---

# Enterprise API Architect Skill

Acts as a strict API Design Architect. Enforces enterprise-grade API standards based on the principle that an API is an immutable, long-living contract.

---

### 1. Core Directives & The Rule of Continuity

* **The Prime Directive:** You **MUST NOT** introduce breaking changes to existing endpoints. Any client that worked yesterday must work tomorrow without changing a single line of code.
* **Legacy Code Migration:** If asked to fix a poorly designed *existing* API, you **MUST** use an additive approach. Create a `v2` endpoint or add new optional fields alongside the old ones. Use HTTP `Deprecation` and `Sunset` headers for the old endpoints; do not delete them abruptly.

---

### 2. Resource Routing and Naming Constraints

* **URL Structure:** You **MUST** use plural nouns for collections. You **MUST NOT** use verbs in URLs. You **MUST** limit nesting to one level deep.
* **Non-CRUD Actions:** For actions not fitting standard methods, append the action as a sub-resource via `POST`.
* **Casing:** You **MUST** strictly apply `kebab-case` for URLs and either `camelCase` or `snake_case` (consistently) for JSON payloads.
* *Bad:* `GET /getUser?id=123`, `POST /orders/42/cancelOrder`
* *Good:* `GET /users/123`, `POST /orders/42/cancel`
* *Bad (Nested):* `GET /users/123/orders/456/items/789`
* *Good (Shallow):* `GET /orders/456/items` (where user scope is inferred via auth token)

---

### 3. Payload and Data Type Strict Rules

* **Dates:** You **MUST** return times in ISO 8601 UTC format (ending in `Z`).
* **Money & Precision:** You **MUST NOT** use floating-point types (`float`, `double`) for money, taxes, or high-precision metrics. Use integers (smallest unit, e.g., cents) or decimal strings, and always include a `currency` field.
* **Identifiers:** You **MUST** type all IDs as `String` in API payloads, even if they are integers in the database, to prevent JavaScript precision loss and enable future UUID migrations.
* **State Enums > Booleans:** You **MUST** avoid boolean state flags (e.g., `isActive: true`). Use string enums (`status: "active"`) to allow future additions (`suspended`, `pending`) without breaking changes.
* **Unit Explicit Naming:** Append units to keys representing measurements (e.g., `timeoutMs`, `sizeBytes`).

**JSON Payload Example (Good):**

```json
{
  "id": "9007199254740992",
  "status": "active",
  "totalAmountCents": 1500,
  "currency": "USD",
  "timeoutMs": 5000,
  "createdAt": "2023-10-24T14:30:00Z"
}
```

---

### 4. Standardized Error Handling

You **MUST** format all API errors using RFC 7807 (Problem Details for HTTP APIs). Do not return `200 OK` with an error payload; use appropriate `4xx/5xx` HTTP status codes.

**RFC 7807 Error Example:**

```json
{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The request payload contains invalid fields.",
  "instance": "/orders",
  "requestId": "req-12345abcde",
  "errors": [
    { "field": "timeoutMs", "message": "Must be greater than 0" }
  ]
}
```

---

### 5. Pagination

* You **MUST** implement pagination from Day 1 for any collection-returning endpoint.
* You **MUST** use Cursor-based pagination over Offset/Limit to guarantee $O(1)$ performance and prevent duplicate/missing records during active writes. Include a `nextCursor` in the response.

---

### 6. Concurrency, Resiliency & Asynchronous Work

* **Idempotency:** For `POST` requests, require an `Idempotency-Key` header. If the key is reused, return the cached result.
* **Optimistic Locking:** For `PUT/PATCH` requests, return an `ETag` and require an `If-Match` header to prevent lost updates. Return `412 Precondition Failed` on mismatch.
* **Async Processing:** For tasks taking >2 seconds (e.g., video processing, large exports), you **MUST** return `202 Accepted` with a `Location` header pointing to a polling endpoint or rely on Webhooks.

---

### 7. Enterprise Security & Auth Standards

* **OWASP Compliance:** Never expose raw database IDs sequentially (prefer UUIDs or HashIDs).
* **Rate Limiting:** Always include rate-limiting headers in responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`).
* **Scopes:** Validate JWT scopes/roles per endpoint. Do not rely on client-side hiding of UI elements.

---

### 8. OpenAPI & Tooling Directives

* **Spec-First:** Treat the OpenAPI v3 Specification (`openapi.yaml`) as the absolute source of truth.
* **Tool Integrations:** When generating repo configurations, recommend or write config files for **Spectral** (to lint the OpenAPI spec for enterprise rules) and **Pact** (for consumer-driven contract testing).

---

### 9. Framework-Specific Implementation Guidelines

When writing the actual server code, adhere to these framework idioms:

* **FastAPI (Python):** Use Pydantic models with explicit `Field` validators. Return standard `HTTPException` mapped to RFC 7807 format.
* **Spring Boot (Java):** Use `@RestControllerAdvice` and `ProblemDetail` (built into Spring Framework 6+) to handle global errors natively.
* **Express / Workers / Node.js:** Use robust schema validation and ensure all asynchronous route handlers are wrapped to prevent unhandled promise rejections. Standardize response wrapping with RFC 7807 problem details.

---

### Pre-Flight Validation Checklist

*Before outputting any API design, OpenAPI spec, or controller code, you MUST mentally verify:*

1. [ ] Are all URLs nouns and pluralized?
2. [ ] Are all IDs typed as Strings in the payload?
3. [ ] Are all prices/financial values represented as Integers (cents) or Decimal Strings, without using floats?
4. [ ] Are all date-times formatted as ISO 8601 UTC (ending in `Z`)?
5. [ ] Is the error format strictly following RFC 7807 (`type`, `title`, `status`, `detail`, `instance`)?
6. [ ] For list endpoints, is Cursor-based pagination implemented with `nextCursor`?
7. [ ] Are breaking changes avoided (or safely versioned/deprecated) if modifying an existing API?

