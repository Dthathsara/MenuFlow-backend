DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'business_email'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "email" TO "business_email";
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

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  ) THEN
    UPDATE "users"
    SET "business_email" = COALESCE(NULLIF("business_email", ''), "email")
    WHERE "business_email" IS NULL
      OR "business_email" = '';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'contact_person_name'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "contact_person_name" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'first_name'
  ) THEN
    UPDATE "users"
    SET "contact_person_name" = COALESCE(
      NULLIF("contact_person_name", ''),
      NULLIF(TRIM(CONCAT_WS(' ', "first_name", "last_name")), '')
    )
    WHERE "contact_person_name" IS NULL
      OR "contact_person_name" = '';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'contact_person_mobile_number'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "contact_person_mobile_number" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'mobile_number'
  ) THEN
    UPDATE "users"
    SET "contact_person_mobile_number" = COALESCE(
      NULLIF("contact_person_mobile_number", ''),
      "mobile_number"
    )
    WHERE "contact_person_mobile_number" IS NULL
      OR "contact_person_mobile_number" = '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'mobile'
  ) THEN
    UPDATE "users"
    SET "contact_person_mobile_number" = COALESCE(
      NULLIF("contact_person_mobile_number", ''),
      "mobile"
    )
    WHERE "contact_person_mobile_number" IS NULL
      OR "contact_person_mobile_number" = '';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'hotel_name'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "hotel_name" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'business_name'
  ) THEN
    UPDATE "users"
    SET "hotel_name" = COALESCE(NULLIF("hotel_name", ''), "business_name")
    WHERE "hotel_name" IS NULL
      OR "hotel_name" = '';
  END IF;
END $$;

UPDATE "users" SET "business_email" = LOWER(TRIM("business_email"));
UPDATE "users" SET "contact_person_name" = '' WHERE "contact_person_name" IS NULL;
UPDATE "users" SET "contact_person_mobile_number" = '' WHERE "contact_person_mobile_number" IS NULL;
UPDATE "users" SET "hotel_name" = '' WHERE "hotel_name" IS NULL;

DROP INDEX IF EXISTS "users_email_idx";
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_business_email_key" ON "users"("business_email");
CREATE INDEX IF NOT EXISTS "users_business_email_idx" ON "users"("business_email");

ALTER TABLE "users" ALTER COLUMN "business_email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "contact_person_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "contact_person_mobile_number" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "hotel_name" SET NOT NULL;

ALTER TABLE "users" DROP COLUMN IF EXISTS "email";
ALTER TABLE "users" DROP COLUMN IF EXISTS "first_name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "mobile_number";
ALTER TABLE "users" DROP COLUMN IF EXISTS "business_name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "mobile";
