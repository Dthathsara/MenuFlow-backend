DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'business_email'
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "business_email" DROP NOT NULL;

    UPDATE "users"
    SET "business_email" = COALESCE(NULLIF("business_email", ''), "email")
    WHERE "business_email" IS NULL OR "business_email" = '';
  END IF;
END $$;
