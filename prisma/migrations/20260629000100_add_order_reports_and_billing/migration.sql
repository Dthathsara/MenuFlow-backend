CREATE TABLE IF NOT EXISTS "order_reports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "total_monthly_orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "qr_scans" INTEGER NOT NULL DEFAULT 0,
    "pending_payments" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "collected_revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_collected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_charges" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sales_overview" JSONB,
    "payment_summary" JSONB,
    "peak_hours" JSONB,
    "qr_usage" JSONB,
    "top_selling_items" JSONB,
    "order_status_mix" JSONB,
    "report_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "order_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "order_id" TEXT,
    "table_number" TEXT NOT NULL,
    "waiter_name" TEXT NOT NULL,
    "items_count" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_charge_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'Pending',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "billing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_reports_tenant_id_period_key_key" ON "order_reports"("tenant_id", "period_key");
CREATE INDEX IF NOT EXISTS "order_reports_tenant_id_idx" ON "order_reports"("tenant_id");
CREATE INDEX IF NOT EXISTS "order_reports_period_key_idx" ON "order_reports"("period_key");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_tenant_id_bill_number_key" ON "billing"("tenant_id", "bill_number");
CREATE INDEX IF NOT EXISTS "billing_tenant_id_idx" ON "billing"("tenant_id");
CREATE INDEX IF NOT EXISTS "billing_status_idx" ON "billing"("status");
CREATE INDEX IF NOT EXISTS "billing_method_idx" ON "billing"("method");
CREATE INDEX IF NOT EXISTS "billing_issued_at_idx" ON "billing"("issued_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_reports_tenant_id_fkey'
  ) THEN
    ALTER TABLE "order_reports"
    ADD CONSTRAINT "order_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_tenant_id_fkey'
  ) THEN
    ALTER TABLE "billing"
    ADD CONSTRAINT "billing_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
