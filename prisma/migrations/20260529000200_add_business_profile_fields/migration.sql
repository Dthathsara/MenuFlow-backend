ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS business_type text,
ADD COLUMN IF NOT EXISTS business_location text,
ADD COLUMN IF NOT EXISTS kitchen_close_time text;
