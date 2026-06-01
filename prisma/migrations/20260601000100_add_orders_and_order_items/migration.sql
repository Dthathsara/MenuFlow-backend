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

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_session_id text NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qr_code_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'dine_in';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'accepted';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 5;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_charge_rate numeric(5,2) NOT NULL DEFAULT 3;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_charge_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_note text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS placed_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at timestamp(3);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preparing_at timestamp(3);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at timestamp(3);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamp(3);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamp(3);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at timestamp(3);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS order_id text NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS menu_item_id text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS food_name text NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sub_category_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS serving_size text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_total numeric(10,2) NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS prep_time_min integer;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS item_note text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS deleted_at timestamp(3);

CREATE INDEX IF NOT EXISTS orders_tenant_id_idx ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS orders_customer_session_id_idx ON public.orders(customer_session_id);
CREATE INDEX IF NOT EXISTS orders_order_status_idx ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
