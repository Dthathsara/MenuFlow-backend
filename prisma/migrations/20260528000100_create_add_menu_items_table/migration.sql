CREATE TABLE IF NOT EXISTS public.add_menu_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text NOT NULL,
  category_name text NOT NULL,
  sub_category_name text,
  description text,
  small_price numeric(10,2) NOT NULL DEFAULT 0,
  medium_price numeric(10,2) NOT NULL DEFAULT 0,
  large_price numeric(10,2) NOT NULL DEFAULT 0,
  prep_time_min integer NOT NULL DEFAULT 12,
  is_available boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,
  image_url text
);

CREATE INDEX IF NOT EXISTS add_menu_items_tenant_id_idx
ON public.add_menu_items (tenant_id);

CREATE INDEX IF NOT EXISTS add_menu_items_category_name_idx
ON public.add_menu_items (category_name);

CREATE INDEX IF NOT EXISTS add_menu_items_is_available_idx
ON public.add_menu_items (is_available);

CREATE INDEX IF NOT EXISTS add_menu_items_deleted_at_idx
ON public.add_menu_items (deleted_at);
