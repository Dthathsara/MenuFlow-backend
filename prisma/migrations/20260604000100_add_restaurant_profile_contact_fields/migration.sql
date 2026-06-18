ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS business_email text,
ADD COLUMN IF NOT EXISTS restaurant_image_url text;
