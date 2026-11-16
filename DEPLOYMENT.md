# VS Organics deployment

The source is prepared for one Render Node web service and a Supabase project. The public site should be published only after the client approves product data, pricing, food labels and policies.

1. Connect the Supabase and Render integrations to this workspace. Choose an existing project/service or create them through the connected tools.
2. In a development Supabase project, apply `supabase/schema.sql` followed by `supabase/commerce_functions.sql` through the SQL editor or migration system. Test role policies and checkout concurrency before applying to production.
3. Create a **public** `product-images` Storage bucket. Uploads are performed only by the server secret key; the public catalogue reads the resulting image URLs.
4. Create the owner in Supabase Auth. The trigger creates a `CUSTOMER` profile. Promote only that verified user to `OWNER` in the SQL editor using their Auth UUID.
   In Supabase Auth URL Configuration, allow `https://<your-render-host>/reset-password` as a redirect URL. Staff can then use the sign-in page's password reset link. An invited owner must complete the invitation before signing in.
5. Connect a Git repository containing this source to Render and use `render.yaml` for the Node web service. The app must have `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in Render's environment. The secret key must never appear in browser code.
6. Add `RESEND_API_KEY` and a verified `EMAIL_FROM` for order emails. Add `WHATSAPP_NUMBER` in international digits and `SITE_URL` for links if used.
7. Replace all demonstration content with client-approved products, pack sizes, prices, images, FSSAI details, shipping rules, PIN coverage, and policies. Set the store's shipping/COD options in the admin settings.
8. Run full UAT: guest and account COD checkout, concurrent last-unit checkout, shipment email, owner cancellation, customer isolation, and mobile accessibility. Rehearse database backup restoration.
9. Set `STORE_LIVE=true` only after those checks are approved. Until then Render may show the catalogue while checkout remains closed.

For a client review, `supabase/demo_catalog.sql` adds four clearly marked sample products and prices. The storefront uses the provisional images in `assets/products` for these demo rows. Keep `STORE_LIVE=false` throughout the review; replace the demo rows and images with approved catalogue data before opening checkout.

An existing owner can open `/#/admin/staff` and invite another owner by email. The invitee opens the email, sets their own password, and signs in at `/#/admin`. The Supabase Auth redirect allowlist must include the live site's `/reset-password` URL. Do not share passwords or invitation links through chat.

## Google sign-in (customer and staff)

1. In Google Cloud Console, configure the OAuth consent screen for the intended audience and create a **Web application** OAuth client. Use `https://vs-organics-store.onrender.com` as the authorized JavaScript origin. Use the exact Supabase Google callback shown in **Authentication → Sign In / Providers → Google** as the authorized redirect URI (for this project: `https://yrecqoqlxddggwsznmrs.supabase.co/auth/v1/callback`).
2. In the VS Organics Supabase project, open **Authentication → Sign In / Providers → Google**, enter the Google Client ID and Client Secret there, and enable the provider. Keep the secret in the dashboard, never in the repository or chat. The site reads Supabase's public provider status; Google buttons appear automatically after the provider is enabled.
3. Keep the Supabase Site URL at `https://vs-organics-store.onrender.com`. Correct the separate password/invitation redirect allowlist entry to `https://vs-organics-store.onrender.com/reset-password`.
4. Test customer Google sign-in at `/#/account`. Test admin Google sign-in at `/#/admin` with an email whose `public.profiles.role` is already `OWNER`, `CATALOG_MANAGER` or `FULFILLMENT_STAFF`. Google sign-in alone never grants staff access. Supabase automatically links a verified Google identity to an existing account with the same email; verify the resulting user ID and role before client handoff.

The backend uses Supabase's implicit OAuth flow and receives the session in the browser URL fragment. The storefront removes the fragment immediately and stores the access token in session storage, matching the existing password-login session handling.

Render's health endpoint is `/api/health`. It returns a healthy response only after Supabase credentials are configured. The service listens on Render's `PORT` and `0.0.0.0` in production.
