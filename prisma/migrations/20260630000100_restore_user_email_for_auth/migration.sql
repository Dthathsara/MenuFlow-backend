DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "email" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'business_email'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "business_email" TEXT;
  END IF;
END $$;

UPDATE "users"
SET "email" = LOWER(TRIM(COALESCE(NULLIF("email", ''), NULLIF("business_email", ''), 'user-' || "id" || '@menuflow.local')));

WITH duplicate_emails AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM("email")) ORDER BY "created_at", "id") AS duplicate_number
  FROM "users"
)
UPDATE "users" AS u
SET "email" = 'user-' || u."id" || '@menuflow.local'
FROM duplicate_emails AS d
WHERE u."id" = d."id"
  AND d.duplicate_number > 1;

UPDATE "users"
SET "business_email" = COALESCE(NULLIF("business_email", ''), "email");

DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_email_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
