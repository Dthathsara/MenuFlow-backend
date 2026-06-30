ALTER TABLE "generate_qr_codes"
ADD COLUMN IF NOT EXISTS "scan_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "last_scanned_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "generate_qr_code_scan_logs" (
  "id" TEXT NOT NULL,
  "generate_qr_code_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "qr_token" TEXT NOT NULL,
  "table_number" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generate_qr_code_scan_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "qr_token" TEXT,
ADD COLUMN IF NOT EXISTS "table_number" TEXT,
ADD COLUMN IF NOT EXISTS "section" TEXT;

CREATE INDEX IF NOT EXISTS "generate_qr_code_scan_logs_generate_qr_code_id_idx" ON "generate_qr_code_scan_logs"("generate_qr_code_id");
CREATE INDEX IF NOT EXISTS "generate_qr_code_scan_logs_tenant_id_idx" ON "generate_qr_code_scan_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "generate_qr_code_scan_logs_qr_token_idx" ON "generate_qr_code_scan_logs"("qr_token");
CREATE INDEX IF NOT EXISTS "generate_qr_code_scan_logs_table_number_idx" ON "generate_qr_code_scan_logs"("table_number");
CREATE INDEX IF NOT EXISTS "generate_qr_code_scan_logs_section_idx" ON "generate_qr_code_scan_logs"("section");
CREATE INDEX IF NOT EXISTS "generate_qr_code_scan_logs_scanned_at_idx" ON "generate_qr_code_scan_logs"("scanned_at");

CREATE INDEX IF NOT EXISTS "orders_qr_code_id_idx" ON "orders"("qr_code_id");
CREATE INDEX IF NOT EXISTS "orders_qr_token_idx" ON "orders"("qr_token");
CREATE INDEX IF NOT EXISTS "orders_table_number_idx" ON "orders"("table_number");
CREATE INDEX IF NOT EXISTS "orders_section_idx" ON "orders"("section");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generate_qr_code_scan_logs_generate_qr_code_id_fkey'
  ) THEN
    ALTER TABLE "generate_qr_code_scan_logs"
    ADD CONSTRAINT "generate_qr_code_scan_logs_generate_qr_code_id_fkey"
    FOREIGN KEY ("generate_qr_code_id") REFERENCES "generate_qr_codes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
