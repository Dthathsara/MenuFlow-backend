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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT "qr_token"
      FROM "generate_qr_codes"
      GROUP BY "qr_token"
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "generate_qr_codes_qr_token_key" ON "generate_qr_codes"("qr_token");
  ELSE
    RAISE NOTICE 'generate_qr_codes.qr_token contains duplicates; skipping unique index for manual cleanup.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generate_qr_codes_tenant_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "generate_qr_codes" qr
    LEFT JOIN "tenants" tenant ON tenant."id" = qr."tenant_id"
    WHERE tenant."id" IS NULL
  ) THEN
    ALTER TABLE "generate_qr_codes"
    ADD CONSTRAINT "generate_qr_codes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generate_qr_codes_tenant_id_fkey'
  ) THEN
    RAISE NOTICE 'generate_qr_codes contains tenant_id values without matching tenants; skipping foreign key for manual cleanup.';
  END IF;
END $$;
