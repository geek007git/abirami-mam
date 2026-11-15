-- Client review catalogue only. Checkout must remain disabled (STORE_LIVE=false).
-- These sample prices, stock counts and images are not approved product data.
begin;

insert into public.categories (name, slug, sort_order) values
  ('Millets', 'millets', 1),
  ('Natural Sweeteners', 'natural-sweeteners', 2),
  ('Rice & Grains', 'rice-grains', 3),
  ('Pulses', 'pulses', 4)
on conflict (slug) do nothing;

insert into public.products (category_id, name, slug, description, label_info, published)
select c.id, d.name, d.slug,
  'Preview listing for client review. Final product details and price await approval.',
  '{"demo":true}'::jsonb, true
from (values
  ('millets', 'Whole Ragi', 'demo-whole-ragi'),
  ('natural-sweeteners', 'Palm Jaggery Powder', 'demo-palm-jaggery-powder'),
  ('rice-grains', 'Traditional Red Rice', 'demo-traditional-red-rice'),
  ('pulses', 'Unpolished Toor Dal', 'demo-unpolished-toor-dal')
) as d(category_slug, name, slug)
join public.categories c on c.slug=d.category_slug
on conflict (slug) do nothing;

insert into public.product_variants (product_id, sku, label, price_paise, mrp_paise, stock_on_hand, active)
select p.id, d.sku, d.label, d.price_paise, d.mrp_paise, d.stock_on_hand, true
from (values
  ('demo-whole-ragi', 'DEMO-RAGI-500G', '500 g', 9500, 11000, 20),
  ('demo-palm-jaggery-powder', 'DEMO-PALM-JAGGERY-500G', '500 g', 22000, 25000, 20),
  ('demo-traditional-red-rice', 'DEMO-RED-RICE-1KG', '1 kg', 13500, 15500, 20),
  ('demo-unpolished-toor-dal', 'DEMO-TOOR-DAL-500G', '500 g', 17500, 19500, 20)
) as d(product_slug, sku, label, price_paise, mrp_paise, stock_on_hand)
join public.products p on p.slug=d.product_slug and p.label_info->>'demo'='true'
on conflict (sku) do nothing;

commit;
