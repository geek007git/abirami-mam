-- Production schema foundation. Apply through Supabase migrations after review.
create type staff_role as enum ('OWNER','CATALOG_MANAGER','FULFILLMENT_STAFF','CUSTOMER');
create type order_status as enum ('PENDING_PAYMENT','PLACED','CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED');
create type payment_status as enum ('NOT_REQUIRED','PENDING','PAID','FAILED','REFUND_PENDING','REFUNDED');
create type reservation_status as enum ('ACTIVE','COMMITTED','RELEASED','EXPIRED');

create table profiles (id uuid primary key references auth.users on delete cascade, role staff_role not null default 'CUSTOMER', full_name text, active boolean not null default true, created_at timestamptz not null default now());
create table categories (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, active boolean not null default true, sort_order int not null default 0);
create table products (id uuid primary key default gen_random_uuid(), category_id uuid references categories, name text not null, slug text unique not null, description text, ingredients text, nutrition jsonb, label_info jsonb not null default '{}', published boolean not null default false, created_at timestamptz not null default now());
create table product_variants (id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade, sku text unique not null, label text not null, price_paise int not null check(price_paise>=0), mrp_paise int not null check(mrp_paise>=price_paise), stock_on_hand int not null default 0 check(stock_on_hand>=0), low_stock_threshold int not null default 5, active boolean not null default true);
create table product_images (id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade, storage_path text not null, alt_text text not null, sort_order int not null default 0, is_primary boolean not null default false);
create table product_categories (product_id uuid not null references products on delete cascade, category_id uuid not null references categories on delete cascade, primary key(product_id,category_id));
create type discount_type as enum ('PERCENT','FIXED');
create table coupons (id uuid primary key default gen_random_uuid(), code text unique not null check(code=upper(code)), discount_type discount_type not null, value int not null check(value>0), minimum_subtotal_paise int not null default 0, maximum_discount_paise int, usage_limit int, per_customer_limit int not null default 1, starts_at timestamptz, ends_at timestamptz, active boolean not null default true, created_at timestamptz not null default now());
create table orders (id uuid primary key default gen_random_uuid(), order_number text unique not null, customer_id uuid references profiles, customer_name text not null, email text not null, phone text not null, address_snapshot jsonb not null, subtotal_paise int not null, discount_paise int not null default 0, shipping_paise int not null default 0, total_paise int not null, status order_status not null, payment_status payment_status not null, tracking_token uuid not null default gen_random_uuid(), courier_name text, tracking_number text, customer_notes text, created_at timestamptz not null default now());
create table order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade, variant_id uuid references product_variants, product_name text not null, variant_label text not null, sku text not null, quantity int not null check(quantity>0), unit_price_paise int not null);
create table coupon_redemptions (id uuid primary key default gen_random_uuid(), coupon_id uuid not null references coupons, order_id uuid not null unique references orders on delete cascade, customer_id uuid references profiles, email_hash text not null, redeemed_at timestamptz not null default now());
create table payments (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade, provider text not null default 'cod', provider_order_id text unique, provider_payment_id text unique, provider_refund_id text, amount_paise int not null check(amount_paise>=0), status payment_status not null, verified_at timestamptz, refunded_at timestamptz, created_at timestamptz not null default now());
create table inventory_reservations (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade, variant_id uuid not null references product_variants, quantity int not null check(quantity>0), status reservation_status not null default 'ACTIVE', expires_at timestamptz not null, created_at timestamptz not null default now());
create table inventory_movements (id bigint generated always as identity primary key, variant_id uuid not null references product_variants, quantity_delta int not null, reason text not null, order_id uuid references orders, actor_id uuid references profiles, created_at timestamptz not null default now());
create table order_status_history (id bigint generated always as identity primary key, order_id uuid not null references orders on delete cascade, from_status order_status, to_status order_status not null, actor_id uuid references profiles, note text, created_at timestamptz not null default now());
create table webhook_events (provider_event_id text primary key, event_type text not null, payload jsonb not null, processed_at timestamptz, error text, created_at timestamptz not null default now());
create table notification_jobs (id uuid primary key default gen_random_uuid(), order_id uuid references orders on delete cascade, template text not null, recipient text not null, payload jsonb not null default '{}', status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','SENT','FAILED')), attempts int not null default 0, provider_response jsonb, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now());
create table store_settings (id boolean primary key default true check(id), store_name text not null default 'VS Organics', announcement text, contact jsonb not null default '{}', social_links jsonb not null default '{}', branding jsonb not null default '{}', shipping_fee_paise int not null default 6000, free_shipping_threshold_paise int not null default 49900, serviceable_pin_codes text[] not null default '{}', cod_enabled boolean not null default true, cod_minimum_paise int not null default 0, cod_maximum_paise int, low_stock_threshold int not null default 5, seo jsonb not null default '{}', updated_at timestamptz not null default now());
create table content_sections (id uuid primary key default gen_random_uuid(), page text not null, section_key text not null, heading text, body jsonb not null default '{}', active boolean not null default true, sort_order int not null default 0, updated_at timestamptz not null default now(), unique(page,section_key));
create table audit_logs (id bigint generated always as identity primary key, actor_id uuid references profiles, action text not null, entity_type text not null, entity_id text, before_data jsonb, after_data jsonb, ip_hash text, created_at timestamptz not null default now());
create sequence order_number_seq start 1043;

create or replace function is_staff(required_roles staff_role[]) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and active and role=any(required_roles)); $$;
create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,role,full_name) values(new.id,'CUSTOMER',coalesce(new.raw_user_meta_data->>'full_name','')) on conflict do nothing; return new; end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile();

alter table profiles enable row level security; alter table categories enable row level security; alter table products enable row level security; alter table product_variants enable row level security; alter table product_images enable row level security; alter table product_categories enable row level security; alter table coupons enable row level security; alter table orders enable row level security; alter table order_items enable row level security; alter table payments enable row level security; alter table inventory_reservations enable row level security; alter table inventory_movements enable row level security; alter table order_status_history enable row level security; alter table notification_jobs enable row level security; alter table store_settings enable row level security; alter table content_sections enable row level security; alter table audit_logs enable row level security;
create policy "published products are public" on products for select using (published);
create policy "active variants of published products are public" on product_variants for select using (active and exists(select 1 from products p where p.id=product_id and p.published));
create policy "customers read own orders" on orders for select to authenticated using (customer_id=auth.uid());
create policy "public categories" on categories for select using (active);
create policy "public product images" on product_images for select using (exists(select 1 from products p where p.id=product_id and p.published));
create policy "public product category links" on product_categories for select using (exists(select 1 from products p where p.id=product_id and p.published));
create policy "public store settings" on store_settings for select using (true);
create policy "public active content" on content_sections for select using (active);
create policy "own profile" on profiles for select to authenticated using (id=auth.uid());
create policy "staff read profiles" on profiles for select to authenticated using (is_staff(array['OWNER']::staff_role[]));
create policy "customers read own items" on order_items for select to authenticated using (exists(select 1 from orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy "staff read orders" on orders for select to authenticated using (is_staff(array['OWNER','CATALOG_MANAGER','FULFILLMENT_STAFF']::staff_role[]));
create policy "catalog staff manage products" on products for all to authenticated using (is_staff(array['OWNER','CATALOG_MANAGER']::staff_role[])) with check (is_staff(array['OWNER','CATALOG_MANAGER']::staff_role[]));
create policy "catalog staff manage variants" on product_variants for all to authenticated using (is_staff(array['OWNER','CATALOG_MANAGER']::staff_role[])) with check (is_staff(array['OWNER','CATALOG_MANAGER']::staff_role[]));
create policy "owner reads audit" on audit_logs for select to authenticated using (is_staff(array['OWNER']::staff_role[]));

create unique index one_primary_image_per_product on product_images(product_id) where is_primary;
create index reservations_active_expiry on inventory_reservations(expires_at) where status='ACTIVE';
create index orders_customer_created on orders(customer_id,created_at desc);
create index orders_status_created on orders(status,created_at desc);
create index notification_jobs_ready on notification_jobs(next_attempt_at) where status in ('PENDING','FAILED');
create unique index one_notification_per_order_template on notification_jobs(order_id,template,recipient);
create index orders_tracking_token on orders(tracking_token);

insert into store_settings(id) values(true) on conflict do nothing;

-- The Node server uses the secret key; browser clients cannot execute checkout functions.
-- Apply the companion commerce_functions.sql after this schema.
