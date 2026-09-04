import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for a new PostgreSQL database.
 *
 * This migration intentionally uses explicit SQL: it makes the database
 * contract (checks, partial indexes, and foreign-key delete behaviour) easy
 * to review in a pull request and avoids relying on synchronize in production.
 */
export class CreateProductionSchema1736121600000 implements MigrationInterface {
  name = 'CreateProductionSchema1736121600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('user', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transaction_type_enum" AS ENUM ('CREDIT', 'DEBIT', 'TRANSFER_IN', 'TRANSFER_OUT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transaction_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transfer_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "auth_event_type_enum" AS ENUM ('REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'TOKEN_ROTATED', 'TOKEN_REUSE_DETECTED', 'LOGOUT', 'LOGOUT_ALL')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar(320) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "name" varchar(100) NOT NULL,
        "role" "user_role_enum" NOT NULL DEFAULT 'user',
        "locked_until" timestamptz,
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_users_failed_login_attempts_non_negative" CHECK ("failed_login_attempts" >= 0),
        CONSTRAINT "CHK_users_name_not_blank" CHECK (length(btrim("name")) > 0)
      )
    `);
    // AuthService stores normalised email, while this index also protects the
    // database from accidental case-variant duplicates from other clients.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_lower" ON "users" (LOWER("email"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL UNIQUE,
        "balance_cents" integer NOT NULL DEFAULT 0,
        "currency" char(3) NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_wallets_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_wallets_balance_non_negative" CHECK ("balance_cents" >= 0),
        CONSTRAINT "CHK_wallets_currency_iso_4217" CHECK ("currency" ~ '^[A-Z]{3}$')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "transfers" (
        "id" SERIAL PRIMARY KEY,
        "from_wallet_id" integer NOT NULL,
        "to_wallet_id" integer NOT NULL,
        "amount_cents" integer NOT NULL,
        "idempotency_key" varchar(128) NOT NULL,
        "status" "transfer_status_enum" NOT NULL DEFAULT 'PENDING',
        "reference" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_transfers_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_transfers_from_wallet_id" FOREIGN KEY ("from_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transfers_to_wallet_id" FOREIGN KEY ("to_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_transfers_amount_positive" CHECK ("amount_cents" > 0),
        CONSTRAINT "CHK_transfers_distinct_wallets" CHECK ("from_wallet_id" <> "to_wallet_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_transfers_from_wallet_created_at" ON "transfers" ("from_wallet_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transfers_to_wallet_created_at" ON "transfers" ("to_wallet_id", "created_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" SERIAL PRIMARY KEY,
        "wallet_id" integer NOT NULL,
        "transfer_id" integer,
        "type" "transaction_type_enum" NOT NULL,
        "amount_cents" integer NOT NULL,
        "balance_before_cents" integer NOT NULL,
        "balance_after_cents" integer NOT NULL,
        "status" "transaction_status_enum" NOT NULL,
        "idempotency_key" varchar(128),
        "reference_id" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_transactions_wallet_id" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transactions_transfer_id" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_transactions_amount_positive" CHECK ("amount_cents" > 0),
        CONSTRAINT "CHK_transactions_balance_non_negative" CHECK ("balance_before_cents" >= 0 AND "balance_after_cents" >= 0),
        CONSTRAINT "CHK_transactions_balance_transition" CHECK (
          (
            "status" = 'COMPLETED' AND (
              ("type" IN ('CREDIT', 'TRANSFER_IN') AND "balance_after_cents" = "balance_before_cents" + "amount_cents") OR
              ("type" IN ('DEBIT', 'TRANSFER_OUT') AND "balance_after_cents" = "balance_before_cents" - "amount_cents")
            )
          ) OR (
            "status" <> 'COMPLETED' AND "balance_after_cents" = "balance_before_cents"
          )
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_transactions_wallet_idempotency_key" ON "transactions" ("wallet_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_wallet_created_at" ON "transactions" ("wallet_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_wallet_type_created_at" ON "transactions" ("wallet_id", "type", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_wallet_amount_cents" ON "transactions" ("wallet_id", "amount_cents", "id" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" SERIAL PRIMARY KEY,
        "token_hash" char(64) NOT NULL,
        "family_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "replaced_by_token_id" integer,
        "revoked" boolean NOT NULL DEFAULT false,
        "revoked_at" timestamptz,
        "user_agent" text,
        "ip" inet,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refresh_tokens_replaced_by_token_id" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_refresh_tokens_expiry_after_creation" CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user_revoked" ON "refresh_tokens" ("user_id", "revoked")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family_revoked" ON "refresh_tokens" ("family_id", "revoked")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "auth_events" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "type" "auth_event_type_enum" NOT NULL,
        "ip" inet,
        "user_agent" text NOT NULL,
        "meta" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_auth_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_events_user_created_at" ON "auth_events" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_events_type_created_at" ON "auth_events" ("type", "created_at" DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_events"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "transfers"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "auth_event_type_enum"`);
    await queryRunner.query(`DROP TYPE "transfer_status_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_status_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
