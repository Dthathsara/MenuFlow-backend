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

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'business_email'
  ) THEN
    UPDATE "users"
    SET "email" = LOWER(TRIM("business_email"))
    WHERE ("email" IS NULL OR "email" = '')
      AND "business_email" IS NOT NULL
      AND "business_email" <> '';
  END IF;

  UPDATE "users"
  SET "email" = LOWER(TRIM("email"))
  WHERE "email" IS NOT NULL
    AND "email" <> '';

  IF NOT EXISTS (
    SELECT 1
    FROM "users"
    WHERE "email" IS NULL
       OR "email" = ''
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
  ELSE
    RAISE NOTICE 'users.email contains null or empty values; leaving column nullable for manual cleanup.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT "email"
      FROM "users"
      WHERE "email" IS NOT NULL
        AND "email" <> ''
      GROUP BY "email"
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
  ELSE
    RAISE NOTICE 'users.email contains duplicates; skipping unique index for manual cleanup.';
  END IF;

  CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
END $$;
