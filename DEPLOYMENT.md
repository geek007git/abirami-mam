# VS Organics deployment

The source is prepared for one Render Node web service and a Supabase project. The public site should be published only after the client approves product data, pricing, food labels and policies.

1. Connect the Supabase and Render integrations to this workspace. Choose an existing project/service or create them through the connected tools.
2. In a development Supabase project, apply `supabase/schema.sql` followed by `supabase/commerce_functions.sql` through the SQL editor or migration system. Test role policies and checkout concurrency before applying to production.
3. Create a **public** `product-images` Storage bucket. Uploads are performed only by the server secret key; the public catalogue reads the resulting image URLs.
4. Create the owner in Supabase Auth. The trigger creates a `CUSTOMER` profile. Promote only that verified user to `OWNER` in the SQL editor using their Auth UUID.
5. Connect a Git repository containing this source to Render and use `render.yaml` for the Node web service. The app must have `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in Render's environment. The secret key must never appear in browser code.
6. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` for Razorpay test mode. Configure the webhook URL as `https://<your-render-host>/api/webhooks/razorpay`, subscribing to `payment.captured`. Test both browser verification and webhook retries.
7. Add `RESEND_API_KEY` and a verified `EMAIL_FROM`. Add `WHATSAPP_NUMBER` in international digits and optionally `SITE_URL` for email links.
8. Replace all demonstration content with client-approved products, pack sizes, prices, images, FSSAI details, shipping rules, PIN coverage, and policies. Set the store's shipping/COD options in the admin settings.
9. Run full UAT: guest and account checkout, COD, online payment, failed payment, concurrent last-unit checkout, expired reservation, duplicate webhook, shipment email, owner cancellation, customer isolation, and mobile accessibility. Rehearse database backup restoration.
10. Set `STORE_LIVE=true` only after the checks and Razorpay live credentials are approved. Until then Render may show the catalogue while checkout remains closed.

Render's health endpoint is `/api/health`. It returns a healthy response only after Supabase credentials are configured. The service listens on Render's `PORT` and `0.0.0.0` in production.
