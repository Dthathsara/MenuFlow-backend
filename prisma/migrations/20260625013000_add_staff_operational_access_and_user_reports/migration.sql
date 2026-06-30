-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "operational_access" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_reports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_member_id" TEXT,
    "staff_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "orders_served" INTEGER NOT NULL DEFAULT 0,
    "revenue_handled" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tables_served" INTEGER NOT NULL DEFAULT 0,
    "shifts_worked" INTEGER NOT NULL DEFAULT 0,
    "report_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_reports_tenant_id_staff_member_id_period_key_key" ON "user_reports"("tenant_id", "staff_member_id", "period_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_reports_tenant_id_idx" ON "user_reports"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_reports_staff_member_id_idx" ON "user_reports"("staff_member_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_reports_role_idx" ON "user_reports"("role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_reports_period_key_idx" ON "user_reports"("period_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_reports_report_date_idx" ON "user_reports"("report_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_reports_deleted_at_idx" ON "user_reports"("deleted_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_reports_tenant_id_fkey'
    ) THEN
        ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_reports_staff_member_id_fkey'
    ) THEN
        ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
