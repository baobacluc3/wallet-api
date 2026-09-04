# Wallet API

A NestJS wallet backend built to demonstrate production-minded backend
fundamentals without turning a junior portfolio project into a bank core:
authentication, authorization, transactional money movements, audit data, and
an indexed transaction-history API.

## Stack

- NestJS, TypeORM, PostgreSQL, Redis
- Argon2id password hashing and JWT access tokens
- Refresh-token rotation with token-family reuse detection
- Swagger at `GET /api/docs`

## Request pipeline

The cross-cutting concerns are deliberately small and live in `src/common` or
the owning `auth` module rather than in controllers and services:

- `RequestContextMiddleware` assigns or validates `X-Request-Id`, captures
  request metadata, and returns the correlation ID to the client.
- Global `JwtAuthGuard` makes endpoints private by default; `@Public()` is
  used only for the health and credential endpoints. `RolesGuard` enforces
  `@Roles(...)` metadata only on routes that declare a role requirement (the
  wallet reconciliation endpoint is administrator-only), and
  `WalletOwnerGuard` is applied only to commands that mutate a specific wallet.
- Global validation rejects unknown input and transforms validated DTOs.
  `ParsePositiveIntPipe` is reserved for wallet route IDs, where its strict
  integer semantics add value beyond generic DTO validation.
- `RequestLoggingInterceptor` adds `Cache-Control: no-store` and records
  completed request timing with the correlation ID. `HttpExceptionFilter`
  provides one client-safe error shape and never exposes unexpected exception
  details.
- `@CurrentUser()`, `@ClientCtx()`, `@Public()`, and `@Roles()` keep handlers
  declarative without hiding business rules in decorators.

The lifecycle is middleware → guards → interceptor → pipes/controller →
interceptor response; exceptions are normalized by the filter. Unit tests cover
the strict pipe, error filter, roles guard, JWT identity mapping, and wallet
history access rules.

## Database design

The schema uses PostgreSQL and stores monetary values as **integer minor units**
(for example, cents). It deliberately does not use JavaScript floating point for
money.

| Table            | Purpose                                   | Important guarantees                                                                 |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `users`          | Accounts and lockout state                | Case-insensitive unique email, hidden password hash, timestamps                      |
| `wallets`        | One wallet per user                       | Non-negative balance, ISO-4217 currency check, optimistic version column             |
| `transactions`   | Append-only wallet ledger                 | Balance snapshots, positive amount and balance-transition checks, scoped idempotency |
| `transfers`      | Links the debit and credit ledger entries | Different source/destination wallets, positive amount, idempotency key               |
| `refresh_tokens` | Rotating sessions                         | Hashed token only, family/revocation indexes, replacement lineage                    |
| `auth_events`    | Security audit trail                      | Indexed user/type timelines, IP, user agent, structured metadata                     |

Foreign keys intentionally use `RESTRICT` for financial ledger data, so a
wallet or user cannot be removed while its money/audit history still exists.

## Setup

1. Create a PostgreSQL database and (for full logout/token-revocation support)
   a Redis instance.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` or the `DB_*` values,
   `REDIS_URL`, and a long random `JWT_SECRET`.
   For local development without Redis, set `REDIS_ENABLED=false`; revoked
   access tokens will not be blacklisted until Redis is enabled.
3. Install dependencies and apply the schema:

```bash
npm install
npm run migration:run
npm run start:dev
```

The Swagger UI is available at `http://localhost:3000/api/docs`.

> The included migration is a **baseline for a fresh database**. If a database
> was previously created using TypeORM `synchronize`, create and review a
> one-off upgrade migration before deploying; do not apply the baseline over
> existing data.

## Useful commands

```bash
npm run build
npm test -- --runInBand
npm run migration:run
npm run migration:revert
```

## Transaction history

Only the wallet owner can access the endpoint below:

```http
GET /wallets/:id/transactions?page=1&limit=20&type=transfer&sortBy=createdAt&sortOrder=desc
Authorization: Bearer <access-token>
```

Supported filters are `type=deposit|withdraw|transfer`, `fromDate`, and
`toDate`. The response contains `{ data, meta }` and uses indexed TypeORM
queries for pagination.

## Design choices to discuss in an interview

- Pessimistic row locks protect concurrent withdrawals and transfers.
- Transfers lock wallets in numeric order to reduce deadlocks.
- The database, not just the API, rejects negative balances, invalid currency
  codes, invalid ledger transitions, and duplicate idempotency keys.
- Refresh tokens are stored only as SHA-256 hashes; a reused rotated token
  revokes its whole token family.
- Migrations are reviewed and run by deployment tooling. Runtime schema
  synchronization is disabled in every environment.
