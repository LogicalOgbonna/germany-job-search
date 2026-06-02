# Wunderflats — System Design & Patterns Deep Dive

Companion to `claud_prep.md`. This document drills into the architectural patterns most likely to come up in the technical loop, with the **Contract Engine** as the centerpiece.

---

## Table of Contents

1. [Contract Engine: Full Architecture Walkthrough](#1-contract-engine-full-architecture-walkthrough)
2. [Third-Party Integration Patterns](#2-third-party-integration-patterns)
3. [Data Consistency & Race Condition Patterns](#3-data-consistency--race-condition-patterns)
4. [Event-Driven Patterns](#4-event-driven-patterns)
5. [Multi-Jurisdiction / Localization Patterns](#5-multi-jurisdiction--localization-patterns)
6. [API Design Patterns (GraphQL + REST)](#6-api-design-patterns-graphql--rest)
7. [Frontend Patterns (React + Next.js)](#7-frontend-patterns-react--nextjs)
8. [Observability & Operational Patterns](#8-observability--operational-patterns)
9. [Security & Compliance Patterns](#9-security--compliance-patterns)
10. [Testing Patterns](#10-testing-patterns)
11. [Whiteboard Cheat Sheet](#11-whiteboard-cheat-sheet)

---

## 1. Contract Engine: Full Architecture Walkthrough

This is the hire's first mission per the JD: automate 95% of contracts across 9 countries (DE, AT, FR, BE, LU, CH, IT, PT, ES) next quarter. Buy/Integrate over Build is mandatory.

### 1.1 Clarifying Questions to Open With

Before drawing anything, ask:

1. **Volume** — how many contracts per day, peak vs avg? (Drives async vs sync, queue sizing.)
2. **Contract types** — residential lease only, or also addenda, terminations, renewals?
3. **Languages** — DE, FR, IT, ES, PT, NL, EN at minimum?
4. **Existing systems** — what's the current contract flow look like manually?
5. **Legal review** — is every contract reviewed by a human, or only edge cases?
6. **Signature method** — qualified e-signature (eIDAS QES) for some countries, advanced for others?
7. **Document retention** — GDPR vs legal retention duration; where stored?
8. **Payments coupling** — does contract execution gate the deposit/first-month payment?

These questions alone signal systems thinking.

### 1.2 Domain Model

```
Booking (existing)
  └── Tenant, Landlord, Property, StartDate, EndDate, Rent, Deposit

Contract
  ├── id
  ├── bookingId (FK)
  ├── jurisdiction (enum: DE, AT, FR, BE, LU, CH, IT, PT, ES)
  ├── language (enum)
  ├── templateVersionId (FK — pinned at creation)
  ├── status (state machine — see 1.4)
  ├── variables (JSONB — filled values)
  ├── generatedDocumentUrl (immutable once generated)
  ├── signedDocumentUrl (immutable once signed)
  ├── signatureProvider (enum: docusign, yousign, ...)
  ├── signatureProviderEnvelopeId
  ├── createdAt, updatedAt, executedAt, expiresAt

ContractTemplate
  ├── id
  ├── jurisdiction
  ├── language
  ├── version (semver-like)
  ├── effectiveFrom, effectiveTo
  ├── clauseIds (ordered list)
  ├── requiredVariables (schema)
  ├── reviewedByLegalAt
  ├── reviewedByLegalUserId

Clause
  ├── id
  ├── jurisdiction
  ├── language
  ├── version
  ├── body (markdown or structured AST)
  ├── tags (e.g. "deposit", "termination", "GDPR")

ContractEvent (audit trail — append-only)
  ├── id
  ├── contractId (FK)
  ├── type (enum: CREATED, GENERATED, SENT, VIEWED, SIGNED_BY_TENANT, SIGNED_BY_LANDLORD, COUNTERSIGNED, EXECUTED, VOIDED)
  ├── actorId (user or "system" or "provider:docusign")
  ├── payload (JSONB — provider webhook body, etc.)
  ├── createdAt
  └── (no updatedAt — events are immutable)

SignatureRequest
  ├── id
  ├── contractId (FK)
  ├── provider
  ├── providerEnvelopeId
  ├── recipients (tenant, landlord — order matters)
  ├── status
  ├── webhookEvents (relation to ContractEvent)
```

Key choices to articulate:

- **Templates and clauses are versioned data, not code.** Legal team updates a clause; bump version; new contracts pick up new version; existing contracts pinned to old version. No engineering deploy needed.
- `**templateVersionId` is pinned at contract creation.** Critical for legal: a contract signed under v3 must reproduce as v3 forever, even if v4 ships next week.
- **Audit trail is append-only.** Use a separate table (or event store) so contract state is reconstructible. Legal teams will need this for disputes.
- **Variables stored as JSONB.** Validated against `requiredVariables` schema at creation. Postgres + JSONB indexes scale fine for this workload.

### 1.3 High-Level Architecture

```
                          ┌────────────────────────────────────┐
                          │   Frontend (Next.js, React, TS)    │
                          │   - Contract preview                │
                          │   - Signature redirect              │
                          │   - Status polling / SSE            │
                          └──────────────┬─────────────────────┘
                                         │ GraphQL
                                         ▼
              ┌──────────────────────────────────────────────────┐
              │   Contract Service (Node.js + TS, GraphQL API)    │
              │                                                   │
              │   ┌─────────────────────────────────────────────┐ │
              │   │ Template Engine                              │ │
              │   │  - Resolve template by (jurisdiction, lang) │ │
              │   │  - Pin version, validate variables          │ │
              │   │  - Render to PDF (e.g. via React-PDF or     │ │
              │   │    Puppeteer or DocuSign template merge)    │ │
              │   └─────────────────────────────────────────────┘ │
              │                                                   │
              │   ┌─────────────────────────────────────────────┐ │
              │   │ Provider Adapters (per signature provider)  │ │
              │   │  - DocuSign, Yousign, Adobe Sign            │ │
              │   │  - Common interface: sendForSignature(),    │ │
              │   │    fetchStatus(), downloadSigned()          │ │
              │   └─────────────────────────────────────────────┘ │
              │                                                   │
              │   ┌─────────────────────────────────────────────┐ │
              │   │ State Machine                                │ │
              │   │  - Drives transitions, emits events         │ │
              │   └─────────────────────────────────────────────┘ │
              │                                                   │
              └────┬─────────────────┬────────────────┬───────────┘
                   │                 │                │
                   ▼                 ▼                ▼
            ┌──────────┐      ┌────────────┐   ┌──────────────┐
            │ Postgres  │      │   Queue    │   │ Object store │
            │  (Mongo  │      │ (Pub/Sub,  │   │   (GCS for   │
            │  Atlas in │      │  BullMQ,   │   │   PDFs)      │
            │  WF case) │      │  or SQS)   │   │              │
            └──────────┘      └────────────┘   └──────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │  Workers (idempotent jobs)   │
                    │  - send-for-signature        │
                    │  - poll-provider-status       │
                    │  - reconcile-webhook         │
                    │  - generate-pdf              │
                    └──────────────────────────────┘
                                    ▲
                                    │ Webhooks (verified)
                    ┌──────────────────────────────┐
                    │   E-signature providers      │
                    │  (DocuSign, Yousign, etc.)   │
                    └──────────────────────────────┘
```

**Wunderflats reality check:** the JD says MongoDB Atlas, not Postgres. Adapt: Mongo handles JSONB-equivalent natively, but multi-document transactions are weaker than Postgres. For the audit trail, a separate immutable collection works fine. For ACID multi-step state changes, lean on the saga pattern (section 4).

### 1.4 State Machine

```
DRAFT
  │ (variables filled, template chosen)
  ▼
PENDING_LEGAL_REVIEW   ◄── only if jurisdiction requires human review
  │
  ▼
READY_TO_SEND
  │ (system or user clicks "send")
  ▼
SENT_FOR_SIGNATURE
  │
  ├──► VIEWED_BY_TENANT (event-only, no terminal transition)
  │
  ▼
SIGNED_BY_TENANT
  │
  ▼
SIGNED_BY_LANDLORD
  │
  ▼
EXECUTED (terminal, immutable)

Side branches:
  - DECLINED → terminal
  - EXPIRED → terminal (after configurable window)
  - VOIDED → terminal (admin action; audit trail required)
```

**Patterns to mention:**

- **Explicit state machine** beats scattered `if (contract.signedAt && !contract.executedAt)` checks. Use a library (XState) or a hand-rolled `transitions` map; reject invalid transitions with a domain error.
- Each transition emits a `ContractEvent`. State is derived; events are truth.
- **Terminal states are immutable.** No code path mutates an EXECUTED contract.

### 1.5 Generation Flow (Step by Step)

```
1. Booking confirmed → emit BookingConfirmed event.
2. Worker consumes BookingConfirmed → resolves jurisdiction from property location.
3. Lookup active ContractTemplate where (jurisdiction, language, effectiveFrom <= now < effectiveTo).
4. Pin templateVersionId.
5. Validate variables against template's required schema.
6. Render contract to PDF (deterministic — same inputs produce same PDF; useful for audit).
7. Store PDF in object storage (immutable: write-once, content-addressed by hash).
8. Insert Contract row in DRAFT state.
9. Emit ContractDrafted event.
10. If jurisdiction requires legal review → enqueue review task; else transition to READY_TO_SEND.
11. Send-for-signature worker picks up READY_TO_SEND contracts → calls provider adapter.
12. Provider returns envelopeId → store, transition to SENT_FOR_SIGNATURE.
13. Provider sends webhooks as parties view/sign.
14. Webhook handler:
    a. Verifies signature (HMAC).
    b. Idempotency check (provider event ID stored uniquely).
    c. Maps to ContractEvent + state transition.
    d. On final signature → download signed PDF, store immutably, transition to EXECUTED.
15. EXECUTED triggers downstream events (e.g., notify Payments service to release deposit).
```

### 1.6 Edge Cases to Name Out Loud

A senior interviewer will probe edge cases. Have these ready:


| Scenario                                                   | Handling                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider webhook lost                                      | Worker polls every N min for `SENT_FOR_SIGNATURE` contracts older than threshold; reconciles state from provider API.                                                                       |
| Provider returns 5xx                                       | Exponential backoff with jitter. After N retries, alert + mark contract `SEND_FAILED` (recoverable).                                                                                        |
| Tenant signs, landlord drops                               | Contract sits in `SIGNED_BY_TENANT` with expiry. After N days, send reminder; after M days, expire and notify.                                                                              |
| Legal updates clause v3→v4 mid-flight                      | Existing contracts unaffected (pinned to v3). New contracts pick up v4.                                                                                                                     |
| GDPR delete request from tenant of executed contract       | Legal retention overrides. Pseudonymize PII fields where possible; flag contract `subject_to_legal_hold`. Coordinate with legal; this is a process, not a code path.                        |
| Webhook arrives twice (provider retried)                   | Idempotency: store provider event ID with unique constraint; second insert errors and no-ops.                                                                                               |
| Race: two webhooks arrive simultaneously (signed + viewed) | Per-contract advisory lock during transition; OR optimistic locking on a `version` column.                                                                                                  |
| Currency mismatch (€ vs CHF for Switzerland)               | Currency stored on Booking; templates reference `{{rent.amount}} {{rent.currency}}`.                                                                                                        |
| Country added later (e.g., NL)                             | Add ContractTemplate rows + provider config; no code change. (This is the buy/integrate dividend.)                                                                                          |
| Provider goes down for 6 hours                             | Circuit breaker opens; queue holds work; worker resumes when breaker half-opens. SLA depends on provider — fallback provider per jurisdiction is a strategic decision (cost vs resilience). |
| Tenant's signature is invalid (expired ID, etc.)           | Provider returns specific error; map to `DECLINED` with reason; surface to ops dashboard.                                                                                                   |


### 1.7 The Buy/Integrate Decision Map

Sketch this out — it's the heart of the role:


| Component                    | Buy or Build?                                    | Rationale                                                                                                             |
| ---------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| E-signature (eIDAS QES, AES) | **Buy** (DocuSign / Yousign / Skribble for CH)   | Compliance is the product; building is suicide.                                                                       |
| KYC / ID verification        | **Buy** (Onfido, Veriff, IDnow for DE)           | Same.                                                                                                                 |
| PDF generation               | **Buy or Build, lean buy**                       | If templates are simple, React-PDF or Puppeteer is fine. If complex, DocuSign templates handle merge fields natively. |
| Template versioning          | **Build** (thin layer in Postgres/Mongo)         | Off-the-shelf CMSs add too much surface; the model is small.                                                          |
| Audit trail                  | **Build** (immutable event log)                  | Specific to our domain; cheap to build.                                                                               |
| Localization (i18n strings)  | **Buy** (i18next, lokalise.com for translations) | Translation workflow is a solved problem.                                                                             |
| Workflow orchestration       | **Build** (state machine in code)                | Workflow engines (Temporal, AWS Step Functions) are overkill for this. Revisit if state machine grows.                |
| Webhook receiver / retries   | **Build** (small, stack-native)                  | Cheap; full control of retry/idempotency policy.                                                                      |


**Soundbite for Marton:** "I default to buy when the vendor is the compliance authority, build only the integration glue and our domain model. The Contract Engine is mostly a thin orchestration layer over signature, KYC, and storage providers."

---

## 2. Third-Party Integration Patterns

The role's bread and butter. Have all of these on the tip of your tongue.

### 2.1 Adapter Pattern

Wrap each provider behind a stable internal interface. Swap providers without touching call sites.

```ts
interface SignatureProvider {
  sendForSignature(req: SignatureRequest): Promise<{ envelopeId: string }>;
  fetchStatus(envelopeId: string): Promise<SignatureStatus>;
  downloadSigned(envelopeId: string): Promise<Buffer>;
  verifyWebhook(headers: Headers, body: string): boolean;
  parseWebhook(body: string): WebhookEvent;
}

class DocusignAdapter implements SignatureProvider { /* ... */ }
class YousignAdapter implements SignatureProvider { /* ... */ }
class SkribbleAdapter implements SignatureProvider { /* ... */ }  // Switzerland
```

Provider selection is **per-jurisdiction config**, not per-deploy code.

### 2.2 Idempotency Keys

Every mutating call to a provider — and every mutating endpoint we expose — accepts an idempotency key.

```
POST /contracts/{id}/send
Idempotency-Key: <uuid-v4 client-generated>

Server: SELECT result FROM idempotency_log WHERE key = ?
  - if hit: return cached response (200 with prior body)
  - if miss: execute, store (key, result, expires_at)
```

**Mention:** idempotency keys with a TTL of 24h is standard. Stripe's API is the canonical reference.

### 2.3 Retry with Exponential Backoff + Jitter

```
attempt 1: wait 0s
attempt 2: wait random(0, 2s)
attempt 3: wait random(0, 4s)
attempt 4: wait random(0, 8s)
...
max 5 attempts; then dead-letter queue for human review.
```

Jitter is critical at scale — without it, retried requests stampede the provider when it recovers.

**Don't retry** on 4xx (client error) — fix the input. **Do retry** on 5xx, network errors, and 429 (with Retry-After honored).

### 2.4 Circuit Breaker

Three states: **closed** (normal), **open** (provider failing — fail fast, don't try), **half-open** (probe with one request).

```
- Track rolling window of last N requests' success/fail.
- If failure rate > threshold (e.g. 50% over 1 min), open the breaker for cooldown (e.g. 30s).
- After cooldown: half-open. Allow one request. Success → close. Fail → re-open.
```

Library: `opossum` for Node.js. Don't reinvent unless you have a specific reason.

**Why this matters at Wunderflats:** if DocuSign goes down for an hour, you don't want every contract creation to time out for 30s. Open the breaker, queue the work, drain when DocuSign recovers.

### 2.5 Webhook Verification

```ts
function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Critical points:

- **Verify on raw body**, before JSON parsing.
- **Use timing-safe comparison** (constant time).
- **Idempotency:** store provider's event ID with a unique constraint.
- **Replay protection:** check `timestamp` is within ~5 min of now.

### 2.6 Webhook + Polling Reconciliation

Webhooks fail silently sometimes (provider outage, our endpoint flaky during a deploy). Always have a backup:

```
Cron job every 5 min:
  SELECT * FROM contracts
  WHERE status = 'SENT_FOR_SIGNATURE'
    AND last_status_check < now() - interval '15 min'
  LIMIT 100
  ORDER BY last_status_check ASC

For each: call provider.fetchStatus(envelopeId), reconcile if drift.
```

**Don't poll every contract every minute** — that's how you blow your provider's rate limit.

### 2.7 Provider Failover Strategy

Per-jurisdiction primary + fallback:

```
DE: primary=DocuSign,  fallback=null (single provider OK if SLA is solid)
CH: primary=Skribble,  fallback=null (Switzerland-specific QES requirements)
ES: primary=DocuSign,  fallback=Yousign
```

Failover is **not transparent**. You don't switch providers mid-envelope. Failover is "if the primary is down at send-time, route new envelopes to fallback." Capture this in the adapter selection logic.

### 2.8 Rate Limit Handling

Honor `Retry-After`. Track headroom (e.g., `X-RateLimit-Remaining`) and slow down proactively. Use a token bucket on the worker side if you have multiple workers hitting the same provider.

---

## 3. Data Consistency & Race Condition Patterns

The JD calls these out by name. Be specific.

### 3.1 Idempotency

Already covered above. Idempotency is the foundation; everything else assumes it.

### 3.2 Optimistic Locking (Versioned Updates)

```sql
UPDATE contracts
SET status = 'SIGNED_BY_TENANT', version = version + 1
WHERE id = ? AND version = ?  -- previous version
```

If 0 rows updated → someone else won the race. Re-read, retry.

**Use when:** contention is rare. Reads are fast, writes are rare.

### 3.3 Pessimistic Locking

```sql
SELECT * FROM contracts WHERE id = ? FOR UPDATE;
-- do work
UPDATE contracts SET ... WHERE id = ?;
```

Holds a row lock. Other transactions block.

**Use when:** contention is common (rare in this domain — contracts have one of two parties acting at a time).

**Mongo equivalent:** `findOneAndUpdate` with a filter that includes the expected state, atomically updates. Combine with multi-document transactions if multiple collections involved.

### 3.4 Transaction Isolation Levels

Be ready to discuss. Postgres defaults to READ COMMITTED. For financial operations, sometimes you want SERIALIZABLE — but it can deadlock under load.


| Level                    | Reads see               | Anomalies prevented  |
| ------------------------ | ----------------------- | -------------------- |
| READ UNCOMMITTED         | uncommitted changes     | none                 |
| READ COMMITTED (default) | committed only          | dirty reads          |
| REPEATABLE READ          | snapshot at txn start   | non-repeatable reads |
| SERIALIZABLE             | as if executed serially | phantom reads        |


**Don't claim to use SERIALIZABLE everywhere.** It's expensive. Use it surgically for double-spend-style guards.

### 3.5 Outbox Pattern

Problem: I want to write to my DB **and** publish an event. If I write the DB first, then the broker fails, I lose the event. If I publish first, then the DB fails, I emitted a phantom event.

Solution: write the event to an `outbox` table in the same DB transaction as the row change. A worker tails the outbox and publishes to the broker, marking events as published. At-least-once delivery, with idempotent consumers.

```sql
BEGIN;
  UPDATE contracts SET status = 'EXECUTED' WHERE id = ?;
  INSERT INTO outbox (type, payload) VALUES ('ContractExecuted', '{...}');
COMMIT;
```

Key for Wunderflats: when a contract is executed, Payments needs to know. Outbox guarantees that.

### 3.6 Saga Pattern (Distributed Transactions)

A booking flow might span: Booking service, Payment service, Contract service. Two-phase commit doesn't fit microservices. Use a saga: a sequence of local transactions, each with a compensating action.

```
1. Booking created (local txn)
2. Payment authorized
   - if fail: cancel booking
3. Contract drafted
   - if fail: cancel payment auth + booking
4. Contract sent for signature
5. Eventually contract signed
6. Payment captured
   - if fail: void contract + refund auth + cancel booking
```

**Two flavors:** orchestration (a central coordinator) vs choreography (services react to events). Orchestration is easier to reason about; choreography scales better.

For the Contract Engine, **orchestrated saga inside the Contract service** is fine — most steps are within our boundary, with the e-signature provider being the only external party.

### 3.7 Event Sourcing (When to Mention, When to Avoid)

Audit trail is a natural fit. But don't propose full event sourcing for the entire system — it's heavy.

Pragmatic: **state + event log** (current state in `contracts`, event log in `contract_events`). State is denormalized for query performance; events are truth for audit.

### 3.8 Exactly-Once vs At-Least-Once

There is no exactly-once delivery in distributed systems. There is at-least-once delivery + idempotent consumers, which is **effectively exactly-once processing**.

**Soundbite:** "I treat 'exactly-once' as a property of the consumer (idempotency), not the broker."

---

## 4. Event-Driven Patterns

### 4.1 Pub/Sub vs Point-to-Point

- **Pub/Sub** (GCP Pub/Sub, Kafka): one publisher, many consumers, each consumer can replay.
- **Queue** (BullMQ, SQS): one publisher, one consumer (per message), work distributed.

Wunderflats uses GCP, so GCP Pub/Sub is the likely answer for cross-service events. BullMQ on Redis is a fine choice for in-process job queues.

### 4.2 Dead Letter Queues

After N retries, send the message to a DLQ. Alarm on DLQ depth. **Don't drop messages silently** — a DLQ entry is "human attention needed."

### 4.3 Event Schema Versioning

Events are forever. Once an event is published, you can't change its shape. Versioning options:

- **Field additions only** (consumer-tolerant) — cheapest; do this by default.
- `**eventType` + `version`** in the envelope; consumers branch on version.
- **Schema registry** (Confluent-style) — heavy, only if you have many producers/consumers.

### 4.4 Backpressure

If a consumer can't keep up, what happens? Options:

- **Buffer in the broker** — natural for Kafka, bounded for SQS.
- **Drop oldest** — only for non-critical events.
- **Throttle the producer** — usually wrong for a marketplace; user actions can't be throttled.

For contracts, lag is OK; loss is not. Buffer + alert on lag.

---

## 5. Multi-Jurisdiction / Localization Patterns

### 5.1 Jurisdiction as a First-Class Discriminator

Don't sprinkle `if (country === 'DE')` across the codebase. Jurisdiction is a **column in the data model and a parameter to every contract operation**. Behavior differences live in:

- Templates (jurisdiction-tagged).
- Provider selection (jurisdiction-tagged config).
- Validation rules (e.g., German law requires 3-month deposit cap).

### 5.2 Templates as Data, Not Code

```
ContractTemplate
  jurisdiction: DE
  language: de
  version: 3
  bodyMarkdown: "Mietvertrag\n\nDer Vermieter {{landlord.name}}..."
  requiredVariables: ["landlord.name", "tenant.name", "rent.amount", ...]
```

Legal team has a CMS to edit clauses. Engineers don't deploy for legal changes. **This is the Buy/Integrate dividend.**

### 5.3 i18n vs L10n

- **i18n** (internationalization): code is locale-aware (date formats, currency formats, plural rules).
- **L10n** (localization): translated content (UI strings, contract text).

Use `i18next` or `next-intl` for UI. For contracts, translations live alongside templates in the data model.

### 5.4 Per-Country Feature Flags

Use a flag service (LaunchDarkly, Unleash, or homegrown) keyed by country. Roll out the Contract Engine to DE first, validate, then add countries one by one. Don't big-bang launch.

### 5.5 Time, Currency, Address

- **Time:** store UTC, render local. Boring but easy to get wrong.
- **Currency:** store amount + currency code (ISO 4217). Format with `Intl.NumberFormat`.
- **Address:** different fields per country. Use a structured address library (libpostal, Google Address Validation API). Don't build your own parser.

---

## 6. API Design Patterns (GraphQL + REST)

JD calls out GraphQL (Apollo/Nexus) and some REST.

### 6.1 GraphQL Schema Design

- **Nodes follow Relay conventions** (`id` is globally unique, opaque, base64 of type+id).
- **Mutations return `{ ok, errors, node }`** — GraphQL has no HTTP status codes. Always return structured errors as part of the schema.
- **Pagination is cursor-based** (`first`, `after`), not offset-based, for stable pagination on changing data.
- **Avoid mutation arrays.** One mutation per operation; client batches as needed.
- **Don't expose DB schema directly.** GraphQL types are a contract; DB is an implementation detail.

### 6.2 N+1 Queries

GraphQL's killer problem. Solution: **DataLoader**.

```ts
const userLoader = new DataLoader(async (ids) => {
  const users = await db.users.find({ id: { $in: ids } });
  return ids.map(id => users.find(u => u.id === id));
});

// In resolver:
contract: { tenant: (parent) => userLoader.load(parent.tenantId) }
```

Batches all `tenant` lookups in one query per request.

### 6.3 Authorization in GraphQL

Per-field directives or per-resolver guards. Don't put auth in middleware only — GraphQL has too many entry points. Centralize in resolvers via a `requireRole(['LANDLORD'])` helper.

### 6.4 REST: When and How

JD says "some REST." Likely for webhooks (providers send REST), file downloads, and external partner APIs.

- **REST for webhooks:** providers don't speak GraphQL.
- **REST for file uploads/downloads:** GraphQL doesn't natively handle binary; use REST or signed URLs.
- **Versioning:** `/v1/contracts`, never breaking changes within a version. Sunset old versions with deprecation headers.

### 6.5 Error Schema (REST)

```json
{
  "error": {
    "code": "CONTRACT_VALIDATION_FAILED",
    "message": "Required variable 'tenant.idNumber' is missing",
    "field": "variables.tenant.idNumber",
    "traceId": "abc-123"
  }
}
```

Codes are stable (machine-readable). Messages are human-readable. Include `traceId` for support.

---

## 7. Frontend Patterns (React + Next.js)

For Agnieszka's round.

### 7.1 Server Components + Client Components Boundary

Next.js App Router default. Server components for data fetching, SEO, no JS to ship. Client components for interactivity (forms, signatures).

**Heuristic:** start server, drop to client only when you need state, effects, or browser APIs.

### 7.2 Form Handling for Complex Contracts

A contract draft form has 30+ fields. Use:

- **react-hook-form** for performance (uncontrolled inputs, minimal re-renders).
- **zod** for schema validation (type + runtime check).
- **Server actions** (Next.js 14+) for submission — no separate API route needed.
- **Optimistic UI** for status changes (mark "sending..." instantly, reconcile on response).

### 7.3 State Management Triage


| Concern           | Tool                                             |
| ----------------- | ------------------------------------------------ |
| Server data       | React Query / SWR / RSC                          |
| URL state         | nuqs / `useSearchParams`                         |
| Form state        | react-hook-form                                  |
| Global UI state   | Zustand / Context                                |
| Global data state | Redux Toolkit (only if you have a strong reason) |


Default to React Query for server data. Only reach for Redux if the team already uses it.

### 7.4 Real-Time Status Updates

Contract status changes via webhook → backend → frontend. Options:

- **Polling**: simplest. `useQuery` with refetchInterval. OK for non-frequent updates.
- **SSE**: server-sent events. One-directional, simple. Good fit (you have OurNigeria experience).
- **WebSockets**: bidirectional. Overkill for status updates.

Mention SSE as your default; you've shipped it.

### 7.5 Performance

- **Bundle analysis**: `@next/bundle-analyzer`. Identify heavy deps.
- **Code splitting**: `next/dynamic` for big components below the fold.
- **Image optimization**: `next/image` (priority, sizes, placeholder).
- **Caching**: Next.js `revalidate` + tags for granular invalidation.
- **Web Vitals**: track in production via `next/web-vitals` reporter to your observability backend.

### 7.6 Accessibility

For contract signing, accessibility is **legal** in EU. Mention:

- Radix UI primitives for keyboard + screen reader support out of the box.
- Focus management on multi-step forms.
- Form errors announced via `aria-live`.
- Color contrast ratios (WCAG AA: 4.5:1 normal text).

---

## 8. Observability & Operational Patterns

### 8.1 The Three Pillars

- **Logs**: structured (JSON), include `traceId`, `userId`, `contractId`. Use a log aggregator (GCP Cloud Logging since they're on GCP).
- **Metrics**: counters, gauges, histograms. Latency, error rate, queue depth, contract throughput.
- **Traces**: distributed traces (OpenTelemetry). Critical for debugging integration failures.

### 8.2 SLOs Worth Defining

For the Contract Engine:

- **Contract draft latency** P95 < 5s.
- **Send-for-signature success rate** > 99% (excluding provider outages).
- **Webhook processing latency** P95 < 2s.
- **Reconciliation lag** P95 < 15 min.

### 8.3 Alerting Without Noise

- Alert on **symptoms**, not causes. "Error rate > 1%" beats "CPU > 80%."
- Page only on user-impacting issues. Cron job missed → ticket. Contracts not sending → page.
- Suppress alerts during deploys.

### 8.4 Runbooks

Every alert maps to a runbook. "DocuSign send failure rate > 5%" → runbook says: check provider status page, check our credentials, check breaker state, contact provider on-call if persistent.

---

## 9. Security & Compliance Patterns

### 9.1 GDPR (Critical for EU PropTech)

- **Right to erasure**: pseudonymize PII on tenant request, retain only what legal requires.
- **Data minimization**: don't store more than the contract needs.
- **DPA with sub-processors**: every third-party provider (DocuSign, etc.) needs a Data Processing Agreement. (Engineering doesn't sign these but knows they exist.)
- **Data residency**: EU-based providers and EU regions for storage. GCP `europe-west` regions.

### 9.2 PCI Scope (If Touching Payments)

If you handle card numbers, you're in PCI scope. **Don't.** Use Stripe/Adyen with hosted fields or Stripe Elements; never let card numbers touch your servers. The same instinct as Buy/Integrate over Build.

### 9.3 Audit Logging

Every state change on a contract → event in audit log. Audit log is append-only, queryable by contractId, exportable for legal disputes.

### 9.4 Authn + Authz

- **Authn**: OAuth/OIDC. Tenants and landlords likely use the same auth, with roles.
- **Authz**: row-level security. Tenants see only their contracts; landlords only theirs; admins see all.
- **Service-to-service**: signed JWTs or mTLS (overkill for many setups).

### 9.5 Secret Management

Don't put secrets in env vars committed anywhere. Use GCP Secret Manager (since they're on GCP) or Infisical (you have direct experience). Rotate provider API keys regularly.

---

## 10. Testing Patterns

### 10.1 Testing Pyramid for the Contract Engine

```
Few:    E2E (Playwright/Cypress)
        - Tenant signs contract end-to-end against a sandboxed provider.

Some:   Integration (testcontainers, real DB, mocked provider)
        - Contract created, sent, webhook received, executed.

Many:   Unit
        - Template renderer, state machine transitions, validators.
```

### 10.2 Provider Sandboxes vs Mocks

Both. Mocks for unit tests (fast). Sandboxes for integration and pre-prod (real wire format, real auth flow).

### 10.3 Contract Tests

For provider integrations, **consumer-driven contract tests** (Pact-style) are heavyweight. Lighter: keep a recorded fixture of the provider's webhook payload and test parser against it. When the provider changes shape, update the fixture.

### 10.4 Property-Based Testing

For the state machine, property-based tests (`fast-check`) ensure "no sequence of valid transitions reaches an invalid state." Strong fit for financial state machines.

### 10.5 Load Testing

Before launching to a new country, run k6 / artillery against the staging environment. Simulate booking → contract → signature flow at expected peak rate. Identify bottlenecks before users do.

---

## 11. Whiteboard Cheat Sheet

If asked to draw the Contract Engine architecture cold, here is the minimum viable diagram. Rehearse once.

```
                           [Frontend (Next.js)]
                                   │
                              GraphQL
                                   │
                       [Contract Service (Node + TS)]
                       │     │       │       │
                       │     │       │       │
           [Postgres/Mongo] [Queue] [Object  [Adapter
            (state +        (jobs)  Storage] interfaces]
            outbox +                          │
            audit log)                        ▼
                                      [DocuSign / Yousign /
                                        Skribble / KYC
                                        provider]
                                              │
                                          (webhooks)
                                              ▼
                                   [Webhook receiver]
                                   - verify HMAC
                                   - idempotency check
                                   - emit ContractEvent
                                   - state transition
```

Talk through:

1. State machine drives transitions.
2. Templates are versioned data; pinned at contract creation.
3. Adapters wrap providers; per-jurisdiction config selects.
4. Outbox guarantees event publishing.
5. Webhook + polling reconciliation.
6. Audit log is append-only.

If asked to expand on any one part, dive into that section's content above.

---

## Quick-Reference: 30-Second Soundbites

- **"Buy/Integrate over Build"** — "I default to buying when the vendor is the compliance authority. The Contract Engine is mostly an orchestration layer over signature providers, KYC providers, and storage. We build the domain model, the state machine, and the integration glue."
- **Race conditions** — "Idempotency keys at the API boundary. Optimistic locking on hot rows. Outbox pattern to atomically commit state and emit events. Saga pattern across service boundaries."
- **Multi-jurisdiction** — "Templates are versioned data, not code. Jurisdiction is a column, not an `if` statement. Provider selection is per-jurisdiction config. Feature flags per country for staged rollouts."
- **Webhook handling** — "Verify HMAC on raw body. Store provider event IDs uniquely for idempotency. Webhook plus polling reconciliation: webhooks are best-effort, the cron is the safety net."
- **GraphQL N+1** — "DataLoader. Per-request, batches and caches by ID."
- **GDPR** — "Pseudonymize on erasure where legal allows; retain where legal mandates. Data minimization at every step. EU-resident processors and storage."

---

## Last-Mile Reminders

- When stuck, **clarify the requirement**. Don't draw before you know the constraints.
- **Articulate trade-offs explicitly.** "I'd choose X over Y because Z; the cost is W."
- **Name patterns.** "This is the outbox pattern" lands harder than "we write to a side table and a worker reads it."
- **Defer to data when possible.** "Without measuring, I'd guess; in production we'd add a metric for X first."
- **Ask back.** "How does the team handle this today?" turns interrogation into conversation.

