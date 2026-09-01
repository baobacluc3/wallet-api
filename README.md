# Auth module — integration guide

This NestJS + TypeORM wallet API uses PostgreSQL. It's built around
one core mechanism: **refresh token rotation with reuse detection**, using the
same pessimistic-locking pattern you already used for wallet transfers.

## 1. Install dependencies

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt argon2 @nestjs/throttler @nestjs/config ioredis pg
npm install -D @types/passport-jwt
```

## 2. Configure PostgreSQL

Create a PostgreSQL database, then copy `.env.example` to `.env` and set the
connection details. `DATABASE_URL` may be used instead of the individual
`DB_*` variables. For example:

```bash
createdb wallet_api
cp .env.example .env
```

The application enables TypeORM schema synchronization outside production.
In production, run reviewed migrations before deploying rather than relying on
automatic synchronization.

## 3. Generate an RS256 key pair

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
base64 -i private.pem | tr -d '\n'   # → JWT_PRIVATE_KEY_BASE64
base64 -i public.pem  | tr -d '\n'   # → JWT_PUBLIC_KEY_BASE64
```

Copy `.env.example` into your `.env` and fill in those two values, plus
`REDIS_URL`. Delete the `.pem` files afterward — only the env vars should
exist on disk.

## 4. Merge the User entity changes

`src/users/entities/user.entity.ts` here shows the four new columns
(`role`, `isEmailVerified`, `failedLoginAttempts`, `lockedUntil`) and the
`refreshTokens` relation. Merge these into your existing entity rather than
overwriting it if you've already got other fields on there.

## 5. Run the migration

Copy `migrations/1735300000000-CreateAuthTables.ts` into your migrations
folder (rename the timestamp if your CLI cares) and run it the same way you
ran your wallet migrations:

```bash
npm run typeorm migration:run
```

## 6. Fix the Wallet import path

`auth.module.ts` and `wallet-owner.guard.ts` import
`../wallets/entities/wallet.entity`. Point that at wherever your actual
`Wallet` entity lives.

## 7. Wire up app.module.ts

```ts
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ...your existing TypeOrmModule.forRoot(...) etc.
    RedisModule,
    AuthModule,
    // ...WalletsModule, etc.
  ],
})
export class AppModule {}
```

## 8. Global validation + basic hardening in main.ts

```ts
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

app.use(helmet());
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

## 9. Protect the wallet endpoints

Every route on your wallet controller is now guarded by default (the
`JwtAuthGuard` is global). Add ownership checks on top for the wallet-specific
routes:

```ts
@UseGuards(WalletOwnerGuard)
@Get(':id/balance')
getBalance(@Param('id') id: string) { ... }

@UseGuards(WalletOwnerGuard)
@Post(':id/withdraw')
withdraw(@Param('id') id: string, @Body() dto: WithdrawDto) { ... }
```

For `/transfers`, check ownership of `fromWalletId` against `req.user.id`
manually inside the service — the guard here only handles single `:id` routes.

## 10. Smoke test

```bash
# Register
curl -X POST localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@test.com","password":"Passw0rd123","name":"A"}'

# Login
curl -X POST localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@test.com","password":"Passw0rd123"}'

# Use the access token
curl localhost:3000/auth/me -H "Authorization: Bearer <accessToken>"

# Rotate
curl -X POST localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'

# Replay the OLD refresh token again → should now revoke the whole session
# family and return 401, since it's already been rotated away once.
```

## What's deliberately out of scope for now

You chose core-only for this pass. The schema already supports these as a
clean phase 2, without a redesign:

- **2FA (TOTP)** — add a `twoFactorSecret` column on `User` and a verify step
  between login and token issuance.
- **Google OAuth** — add a `GoogleStrategy`, link by email, issue the same
  token pair `issueTokenPair` already produces.
- **Session/device management** — you're already storing `ip` and
  `userAgent` per refresh token. A `GET /auth/sessions` endpoint listing
  active (non-revoked) tokens is mostly a `find()` away.
