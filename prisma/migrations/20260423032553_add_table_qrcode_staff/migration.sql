/*
  Warnings:

  - A unique constraint covering the columns `[table_id]` on the table `qr_codes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `table_id` to the `qr_codes` table without a default value. This is not possible if the table is not empty.
  - Made the column `menu_id` on table `qr_codes` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "qr_codes" DROP CONSTRAINT "qr_codes_menu_id_fkey";

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "table_id" TEXT NOT NULL,
ALTER COLUMN "menu_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_code_staff" (
    "id" TEXT NOT NULL,
    "qr_code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "qr_code_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tables_tenant_id_idx" ON "tables"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tables_tenant_id_number_key" ON "tables"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "qr_code_staff_qr_code_id_idx" ON "qr_code_staff"("qr_code_id");

-- CreateIndex
CREATE INDEX "qr_code_staff_user_id_idx" ON "qr_code_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_code_staff_qr_code_id_user_id_key" ON "qr_code_staff"("qr_code_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_table_id_key" ON "qr_codes"("table_id");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_code_staff" ADD CONSTRAINT "qr_code_staff_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_code_staff" ADD CONSTRAINT "qr_code_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
