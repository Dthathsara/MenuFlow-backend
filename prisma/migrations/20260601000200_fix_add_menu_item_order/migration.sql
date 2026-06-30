WITH ranked_items AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.add_menu_items
  WHERE deleted_at IS NULL
)
UPDATE public.add_menu_items AS ami
SET sort_order = ranked_items.rn
FROM ranked_items
WHERE ami.id = ranked_items.id
  AND (ami.sort_order IS NULL OR ami.sort_order = 0);
