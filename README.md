# VS Organics Store

A mobile-friendly grocery storefront and Node backend for VS Organics. The local preview includes sample products. Production uses Supabase data and authentication, cash on delivery, and Render hosting.

## Run

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

Open `http://localhost:4173`. Without Supabase credentials, the site serves a preview catalogue and checkout remains disabled in the new storefront. Local JSON records and the images under `assets/products/*-preview.jpg` are launch-rehearsal material only; replace them with client-approved pack photography before publication. When Supabase is configured, the backend switches to database APIs and the server recalculates orders from stored variant prices.

## Production integration

Apply `supabase/schema.sql` and then `supabase/commerce_functions.sql` to a development Supabase project. The checkout function creates COD orders in a transaction, deducts stock, and records order history. Use `.env.example` as the variable list. `render.yaml` defines the Render web service and secret placeholders.

Before public launch, replace every sample product and price with the client-approved catalogue and images; configure PIN coverage, shipping and COD rules; approve food labels and policy text; configure an order notification email; and complete test orders, RLS checks, and backups. Set `STORE_LIVE=true` only after those checks pass.
