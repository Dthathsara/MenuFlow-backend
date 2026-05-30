ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS business_type text,
ADD COLUMN IF NOT EXISTS business_location text,
ADD COLUMN IF NOT EXISTS business_address text,
ADD COLUMN IF NOT EXISTS kitchen_open_time text,
ADD COLUMN IF NOT EXISTS kitchen_close_time text,
ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 5,
ADD COLUMN IF NOT EXISTS service_charge_rate numeric(5,2) DEFAULT 3,
ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2);

CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  order_number text NOT NULL UNIQUE,
  customer_session_id text NOT NULL,
  table_id text,
  qr_code_id text,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  order_type text NOT NULL DEFAULT 'dine_in',
  order_status text NOT NULL DEFAULT 'accepted',
  payment_status text NOT NULL DEFAULT 'unpaid',
  subtotal numeric(10,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL DEFAULT 5,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  service_charge_rate numeric(5,2) NOT NULL DEFAULT 3,
  service_charge_amount numeric(10,2) NOT NULL DEFAULT 0,
  discount_rate numeric(5,2),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL,
  item_note text,
  placed_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at timestamp(3),
  preparing_at timestamp(3),
  ready_at timestamp(3),
  delivered_at timestamp(3),
  cancelled_at timestamp(3),
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp(3),
  CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

CREATE INDEX IF NOT EXISTS orders_tenant_id_idx ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS orders_customer_session_id_idx ON public.orders(customer_session_id);
CREATE INDEX IF NOT EXISTS orders_deleted_at_idx ON public.orders(deleted_at);

CREATE TABLE IF NOT EXISTS public.order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  menu_item_id text,
  food_name text NOT NULL,
  category_name text,
  sub_category_name text,
  serving_size text,
  unit_price numeric(10,2) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(10,2) NOT NULL,
  prep_time_min integer,
  image_url text,
  item_note text,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp(3),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_menu_item_id_idx ON public.order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS order_items_deleted_at_idx ON public.order_items(deleted_at);
