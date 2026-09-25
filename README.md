# Wallet API

A small NestJS backend for practicing authentication, relational data, and wallet transactions.

## Stack

- NestJS and TypeScript
- PostgreSQL and TypeORM migrations
- JWT authentication
- Swagger at `/api/docs`

## Run locally

1. Create a PostgreSQL database named `wallet_api`.
2. Copy `.env.example` to `.env` and set a private `JWT_SECRET`.
3. Install dependencies and create the tables:

   ```sh
   npm install
   npm run migration:run
   npm run start:dev
   ```

The included migration creates the schema for a new database. If you already
ran the old migrations, use a fresh development database before starting this
simplified version.

## Main routes

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account and receive an access token |
| `POST` | `/auth/login` | Sign in and receive an access token |
| `GET` | `/auth/me` | Get the current account |
| `POST` | `/wallets` | Create a wallet (currency defaults to USD) |
| `POST` | `/wallets/deposit` | Add cents to a wallet |
| `POST` | `/wallets/withdraw` | Withdraw cents from a wallet |
| `POST` | `/wallets/transfers` | Transfer cents between wallets |
| `GET` | `/wallets/:id/transactions` | View a wallet's paginated history |

Send the token from register or login as `Authorization: Bearer <token>` for
protected routes. Create a wallet before making a deposit or withdrawal. Tokens
expire after one hour; log in again to get another. Amounts are integer cents,
so the API avoids floating-point money calculations.

## Topics to explain in an interview

- Why passwords are stored as hashes rather than plain text.
- How JWT authentication and wallet ownership checks work.
- Why database transactions keep a transfer's debit and credit together.
- How row locks prevent concurrent withdrawals from spending the same balance.
- Why money amounts use integer cents instead of decimals or floating point.
- How pagination and filters are applied to transaction history.
