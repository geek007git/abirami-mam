# VS Organics Store

A mobile-friendly grocery storefront and Node backend for VS Organics. The local preview includes sample products. Production is designed for Supabase data and authentication, Razorpay payments, and Render hosting.

## Run

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

Open `http://localhost:4173`. Without Supabase credentials, the site serves a preview catalogue and checkout remains disabled in the new storefront. Local JSON records are development data only. When Supabase is configured, the backend switches to database APIs and the server recalculates orders from stored variant prices.

## Production integration

Apply `supabase/schema.sql` and then `supabase/commerce_functions.sql` to a development Supabase project. The database functions create orders under a transaction, reserve online stock for 15 minutes, commit paid stock once, and record order history. Use `.env.example` as the variable list. `render.yaml` defines the Render web service and secret placeholders.

Before public launch, replace every sample product and price with the client-approved catalogue and images; configure the WhatsApp number, PIN coverage, shipping and COD rules; approve food labels and policy text; configure Razorpay and email; and complete live test orders, refunds, RLS checks, and backups. Set `STORE_LIVE=true` only after those checks pass.
