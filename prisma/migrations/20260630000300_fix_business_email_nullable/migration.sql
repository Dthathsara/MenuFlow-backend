ALTER TABLE "users" ALTER COLUMN "business_email" DROP NOT NULL;

UPDATE "users"
SET "business_email" = COALESCE(NULLIF("business_email", ''), "email")
WHERE "business_email" IS NULL OR "business_email" = '';
