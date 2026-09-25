import { MigrationInterface, QueryRunner } from 'typeorm';

/** Creates the tables used by the wallet API in a new PostgreSQL database. */
export class CreateWalletSchema1736121600000
  implements MigrationInterface
{
  name = 'CreateWalletSchema1736121600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "transaction_type_enum" AS ENUM ('CREDIT', 'DEBIT', 'TRANSFER_IN', 'TRANSFER_OUT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transaction_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transfer_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'FAILED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar(320) NOT NULL UNIQUE,
        "password_hash" varchar NOT NULL,
        "name" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
        "balance_cents" integer NOT NULL DEFAULT 0 CHECK ("balance_cents" >= 0),
        "currency" char(3) NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "transfers" (
        "id" SERIAL PRIMARY KEY,
        "from_wallet_id" integer NOT NULL REFERENCES "wallets"("id"),
        "to_wallet_id" integer NOT NULL REFERENCES "wallets"("id"),
        "amount_cents" integer NOT NULL CHECK ("amount_cents" > 0),
        "idempotency_key" varchar(128) NOT NULL UNIQUE,
        "status" "transfer_status_enum" NOT NULL DEFAULT 'PENDING',
        "reference" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK ("from_wallet_id" <> "to_wallet_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" SERIAL PRIMARY KEY,
        "wallet_id" integer NOT NULL REFERENCES "wallets"("id"),
        "transfer_id" integer REFERENCES "transfers"("id"),
        "type" "transaction_type_enum" NOT NULL,
        "amount_cents" integer NOT NULL CHECK ("amount_cents" > 0),
        "balance_before_cents" integer NOT NULL,
        "balance_after_cents" integer NOT NULL,
        "status" "transaction_status_enum" NOT NULL,
        "idempotency_key" varchar(128),
        "reference_id" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_transactions_wallet_idempotency_key" ON "transactions" ("wallet_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_wallet_created_at" ON "transactions" ("wallet_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "transfers"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "transfer_status_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_status_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_type_enum"`);
  }
}
