CREATE TABLE IF NOT EXISTS "generate_qr_codes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "table_number" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "customer_url" TEXT NOT NULL,
    "qr_image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "generate_qr_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "generate_qr_codes_tenant_id_idx" ON "generate_qr_codes"("tenant_id");
CREATE INDEX IF NOT EXISTS "generate_qr_codes_qr_token_idx" ON "generate_qr_codes"("qr_token");
CREATE INDEX IF NOT EXISTS "generate_qr_codes_deleted_at_idx" ON "generate_qr_codes"("deleted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "generate_qr_codes_qr_token_key" ON "generate_qr_codes"("qr_token");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generate_qr_codes_tenant_id_fkey'
  ) THEN
    ALTER TABLE "generate_qr_codes"
    ADD CONSTRAINT "generate_qr_codes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generate_qr_codes_created_by_id_fkey'
  ) THEN
    ALTER TABLE "generate_qr_codes"
    ADD CONSTRAINT "generate_qr_codes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
