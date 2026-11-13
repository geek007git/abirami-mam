# Supabase setup

Once the Supabase integration is connected:

1. Create separate development and production projects.
2. Apply `schema.sql`, then `commerce_functions.sql`, to development first.
3. Create a public `product-images` Storage bucket. Only the backend secret key uploads images; published product pages use public image URLs.
4. Configure email/password Auth and the production redirect origins.
5. Create the first Auth user, then change its `profiles.role` to `OWNER` through the SQL editor. The `create_profile` trigger creates a customer profile automatically.
6. Run RLS allow/deny tests before loading real customers or orders.
7. Put the project URL and keys into deployment secrets; never expose the service-role key to browser code.

The checkout transaction and Razorpay webhook execute with the secret key on the server. Public clients must never write orders, payments, inventory, webhook events, notification jobs, or audit logs directly. Before real orders, run concurrent checkout, payment retry, RLS, and refund tests against development and complete a backup restore rehearsal.
