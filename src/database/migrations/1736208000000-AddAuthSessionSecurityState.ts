import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds durable, server-validated session state and a user-wide credential
 * version. Existing refresh-token families are backfilled into sessions
 * before the foreign key is added, so this migration is safe for databases
 * created by the original baseline migration.
 */
export class AddAuthSessionSecurityState1736208000000
  implements MigrationInterface
{
  name = 'AddAuthSessionSecurityState1736208000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "is_active" boolean NOT NULL DEFAULT true,
        ADD COLUMN "auth_version" integer NOT NULL DEFAULT 1,
        ADD CONSTRAINT "CHK_users_auth_version_positive" CHECK ("auth_version" > 0)
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY,
        "user_id" integer NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "revoked_at" timestamptz,
        "expires_at" timestamptz NOT NULL,
        "last_used_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "user_agent" text,
        "ip" inet,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_auth_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_auth_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_user_revoked_expires" ON "auth_sessions" ("user_id", "revoked", "expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")`,
    );

    // Original refresh tokens did not have a session row. Preserve active
    // sessions and their longest legacy expiry during the one-time backfill.
    await queryRunner.query(`
      INSERT INTO "auth_sessions" (
        "id", "user_id", "revoked", "revoked_at", "expires_at",
        "last_used_at", "user_agent", "ip", "created_at", "updated_at"
      )
      SELECT DISTINCT ON ("family_id")
        "family_id",
        MIN("user_id") OVER (PARTITION BY "family_id"),
        BOOL_AND("revoked") OVER (PARTITION BY "family_id"),
        CASE
          WHEN BOOL_AND("revoked") OVER (PARTITION BY "family_id")
          THEN MAX("revoked_at") OVER (PARTITION BY "family_id")
          ELSE NULL
        END,
        MAX("expires_at") OVER (PARTITION BY "family_id"),
        MAX("created_at") OVER (PARTITION BY "family_id"),
        "user_agent",
        "ip",
        MIN("created_at") OVER (PARTITION BY "family_id"),
        MAX("created_at") OVER (PARTITION BY "family_id")
      FROM "refresh_tokens"
      ORDER BY "family_id", "created_at" ASC, "id" ASC
    `);

    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD CONSTRAINT "FK_refresh_tokens_family_id"
        FOREIGN KEY ("family_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(
      `ALTER TYPE "auth_event_type_enum" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum values cannot be removed safely in place. Leaving the
    // extra value is intentional; it may already be present in audit rows.
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_family_id"`,
    );
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_auth_version_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "auth_version", DROP COLUMN "is_active"`,
    );
  }
}
