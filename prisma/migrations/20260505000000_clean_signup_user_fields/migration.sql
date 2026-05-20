DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'hotel_name'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "hotel_name" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'mobile_number'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "mobile_number" TEXT;
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

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'mobile'
  ) THEN
    UPDATE "users"
    SET "mobile_number" = COALESCE(NULLIF("mobile_number", ''), "mobile")
    WHERE "mobile_number" IS NULL
      OR "mobile_number" = '';
  END IF;
END $$;

UPDATE "users" SET "first_name" = '' WHERE "first_name" IS NULL;
UPDATE "users" SET "last_name" = '' WHERE "last_name" IS NULL;
UPDATE "users" SET "hotel_name" = '' WHERE "hotel_name" IS NULL;
UPDATE "users" SET "mobile_number" = '' WHERE "mobile_number" IS NULL;

ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "last_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "hotel_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "mobile_number" SET NOT NULL;

ALTER TABLE "users" DROP COLUMN IF EXISTS "business_name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "mobile";
