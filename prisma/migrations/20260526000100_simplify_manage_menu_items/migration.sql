-- Add direct Manage Menu fields to menu_items. Legacy tables/columns stay in place.
ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "category_name" TEXT,
  ADD COLUMN IF NOT EXISTS "sub_category_name" TEXT,
  ADD COLUMN IF NOT EXISTS "small_price" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "medium_price" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "large_price" DECIMAL(10, 2);

-- menu_id remains as a legacy column but is no longer required for Manage Menu rows.
ALTER TABLE "menu_items"
  ALTER COLUMN "menu_id" DROP NOT NULL;

-- Backfill category/subcategory names from legacy relations when available.
UPDATE "menu_items" mi
SET "category_name" = c."name"
FROM "categories" c
WHERE mi."category_id" = c."id"
  AND mi."category_name" IS NULL;

UPDATE "menu_items" mi
SET "sub_category_name" = sc."name"
FROM "sub_categories" sc
WHERE mi."sub_category_id" = sc."id"
  AND mi."sub_category_name" IS NULL;

-- Backfill size prices from legacy options by case-insensitive labels.
UPDATE "menu_items" mi
SET "small_price" = opt."price"
FROM (
  SELECT DISTINCT ON ("menu_item_id") "menu_item_id", "price"
  FROM "menu_item_options"
  WHERE "label" ILIKE 'Small'
  ORDER BY "menu_item_id", "sort_order" ASC, "created_at" ASC
) opt
WHERE mi."id" = opt."menu_item_id"
  AND mi."small_price" IS NULL;

UPDATE "menu_items" mi
SET "medium_price" = opt."price"
FROM (
  SELECT DISTINCT ON ("menu_item_id") "menu_item_id", "price"
  FROM "menu_item_options"
  WHERE "label" ILIKE 'Medium'
  ORDER BY "menu_item_id", "sort_order" ASC, "created_at" ASC
) opt
WHERE mi."id" = opt."menu_item_id"
  AND mi."medium_price" IS NULL;

UPDATE "menu_items" mi
SET "large_price" = opt."price"
FROM (
  SELECT DISTINCT ON ("menu_item_id") "menu_item_id", "price"
  FROM "menu_item_options"
  WHERE "label" ILIKE 'Large'
  ORDER BY "menu_item_id", "sort_order" ASC, "created_at" ASC
) opt
WHERE mi."id" = opt."menu_item_id"
  AND mi."large_price" IS NULL;
