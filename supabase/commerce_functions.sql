create or replace function public.place_checkout(p_items jsonb,p_customer jsonb,p_address jsonb,p_payment_method text,p_coupon text default null,p_notes text default null,p_customer_id uuid default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare
  v_item jsonb; v_variant public.product_variants%rowtype; v_product public.products%rowtype;
  v_order public.orders%rowtype; v_settings public.store_settings%rowtype; v_qty integer;
  v_reserved integer; v_subtotal integer:=0; v_discount integer:=0; v_shipping integer:=0;
  v_coupon public.coupons%rowtype; v_count integer; v_key text;
begin
  if p_payment_method is distinct from 'cod' or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>40 then raise exception 'Invalid checkout'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'variantId') from jsonb_array_elements(p_items)) then raise exception 'Duplicate variants in cart'; end if;
  if length(trim(p_customer->>'name'))<2 or p_customer->>'email' !~* '^[^@ ]+@[^@ ]+\.[^@ ]+$' or p_customer->>'phone' !~ '^[6-9][0-9]{9}$' then raise exception 'Invalid contact details'; end if;
  if p_address->>'pin' !~ '^[1-9][0-9]{5}$' or length(trim(p_address->>'line1'))<5 then raise exception 'Invalid address'; end if;
  select * into v_settings from public.store_settings where id=true;
  if not found then raise exception 'Store settings missing'; end if;
  if cardinality(v_settings.serviceable_pin_codes)>0 and not (p_address->>'pin'=any(v_settings.serviceable_pin_codes)) then raise exception 'PIN code not serviceable'; end if;
  if p_payment_method='cod' and not v_settings.cod_enabled then raise exception 'COD unavailable'; end if;
  -- Serialize all checkouts while stock and coupon limits are checked. This is deliberate for a small launch catalogue.
  perform pg_advisory_xact_lock(734201);
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity') !~ '^[1-9][0-9]?$' then raise exception 'Invalid quantity'; end if;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty>20 then raise exception 'Quantity limit exceeded'; end if;
    select * into v_variant from public.product_variants where id=(v_item->>'variantId')::uuid and active for update;
    if not found then raise exception 'Variant unavailable'; end if;
    select * into v_product from public.products where id=v_variant.product_id and published;
    if not found then raise exception 'Product unavailable'; end if;
    select coalesce(sum(quantity),0)::integer into v_reserved from public.inventory_reservations where variant_id=v_variant.id and status='ACTIVE' and expires_at>now();
    if v_variant.stock_on_hand-v_reserved<v_qty then raise exception 'Insufficient stock for %',v_product.name; end if;
    v_subtotal:=v_subtotal+v_variant.price_paise*v_qty;
  end loop;
  if p_coupon is not null and trim(p_coupon)<>'' then
    select * into v_coupon from public.coupons where code=upper(trim(p_coupon)) and active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) for update;
    if not found then raise exception 'Coupon unavailable'; end if;
    if v_subtotal<v_coupon.minimum_subtotal_paise then raise exception 'Coupon minimum not reached'; end if;
    select count(*) into v_count from public.coupon_redemptions where coupon_id=v_coupon.id;
    if v_coupon.usage_limit is not null and v_count>=v_coupon.usage_limit then raise exception 'Coupon limit reached'; end if;
    v_key:=encode(extensions.digest(lower(trim(p_customer->>'email')),'sha256'),'hex');
    select count(*) into v_count from public.coupon_redemptions where coupon_id=v_coupon.id and email_hash=v_key;
    if v_count>=v_coupon.per_customer_limit then raise exception 'Coupon already used'; end if;
    if v_coupon.discount_type='PERCENT' then v_discount:=floor(v_subtotal*v_coupon.value/100); else v_discount:=v_coupon.value; end if;
    v_discount:=least(v_discount,coalesce(v_coupon.maximum_discount_paise,v_subtotal),v_subtotal);
  end if;
  if p_payment_method='cod' and (v_subtotal-v_discount<v_settings.cod_minimum_paise or (v_settings.cod_maximum_paise is not null and v_subtotal-v_discount>v_settings.cod_maximum_paise)) then raise exception 'COD order value unavailable'; end if;
  if v_subtotal-v_discount<v_settings.free_shipping_threshold_paise then v_shipping:=v_settings.shipping_fee_paise; end if;
  insert into public.orders(order_number,customer_id,customer_name,email,phone,address_snapshot,subtotal_paise,discount_paise,shipping_paise,total_paise,status,payment_status,customer_notes)
  values('VSO-'||nextval('public.order_number_seq'),p_customer_id,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),p_customer->>'phone',p_address,v_subtotal,v_discount,v_shipping,v_subtotal-v_discount+v_shipping,case when p_payment_method='cod' then 'PLACED'::public.order_status else 'PENDING_PAYMENT'::public.order_status end,case when p_payment_method='cod' then 'NOT_REQUIRED'::public.payment_status else 'PENDING'::public.payment_status end,p_notes)
  returning * into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;
    select * into v_variant from public.product_variants where id=(v_item->>'variantId')::uuid;
    select * into v_product from public.products where id=v_variant.product_id;
    insert into public.order_items(order_id,variant_id,product_name,variant_label,sku,quantity,unit_price_paise) values(v_order.id,v_variant.id,v_product.name,v_variant.label,v_variant.sku,v_qty,v_variant.price_paise);
    if p_payment_method='cod' then
      update public.product_variants set stock_on_hand=stock_on_hand-v_qty where id=v_variant.id;
      insert into public.inventory_movements(variant_id,quantity_delta,reason,order_id) values(v_variant.id,-v_qty,'COD_SALE',v_order.id);
    else
      insert into public.inventory_reservations(order_id,variant_id,quantity,expires_at) values(v_order.id,v_variant.id,v_qty,now()+interval '15 minutes');
    end if;
  end loop;
  if v_coupon.id is not null then insert into public.coupon_redemptions(coupon_id,order_id,email_hash) values(v_coupon.id,v_order.id,v_key); end if;
  insert into public.payments(order_id,amount_paise,status) values(v_order.id,v_order.total_paise,v_order.payment_status);
  insert into public.order_status_history(order_id,to_status) values(v_order.id,v_order.status);
  if p_payment_method='cod' then insert into public.notification_jobs(order_id,template,recipient,payload) values(v_order.id,'ORDER_PLACED',v_order.email,jsonb_build_object('orderNumber',v_order.order_number,'totalPaise',v_order.total_paise,'trackingToken',v_order.tracking_token)); end if;
  return v_order;
end $$;

create or replace function public.release_order_reservation(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status<>'PENDING_PAYMENT' then return; end if;
  update public.inventory_reservations set status='RELEASED' where order_id=p_order_id and status='ACTIVE';
  delete from public.coupon_redemptions where order_id=p_order_id;
  update public.orders set status='CANCELLED',payment_status='FAILED' where id=p_order_id;
  update public.payments set status='FAILED' where order_id=p_order_id;
  insert into public.order_status_history(order_id,from_status,to_status,note) values(p_order_id,'PENDING_PAYMENT','CANCELLED',p_reason);
end $$;

create or replace function public.commit_online_payment(p_order_id uuid,p_payment_id text,p_event_id text default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_res public.inventory_reservations%rowtype;
begin
  -- Keep stock changes in the same critical section as checkout reservations.
  perform pg_advisory_xact_lock(734201);
  if p_event_id is not null then
    insert into public.webhook_events(provider_event_id,event_type,payload,processed_at) values(p_event_id,'payment.captured','{}',now()) on conflict do nothing;
    if not found then select * into v_order from public.orders where id=p_order_id; return v_order; end if;
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status='PAID' then return v_order; end if;
  if v_order.status<>'PENDING_PAYMENT' then raise exception 'Order is not awaiting payment'; end if;
  for v_res in select * from public.inventory_reservations where order_id=p_order_id and status='ACTIVE' for update loop
    if v_res.expires_at<=now() then raise exception 'Reservation expired'; end if;
    update public.product_variants set stock_on_hand=stock_on_hand-v_res.quantity where id=v_res.variant_id and stock_on_hand>=v_res.quantity;
    if not found then raise exception 'Stock changed during payment'; end if;
    insert into public.inventory_movements(variant_id,quantity_delta,reason,order_id) values(v_res.variant_id,-v_res.quantity,'ONLINE_SALE',p_order_id);
    update public.inventory_reservations set status='COMMITTED' where id=v_res.id;
  end loop;
  update public.orders set status='PLACED',payment_status='PAID' where id=p_order_id returning * into v_order;
  update public.payments set status='PAID',provider_payment_id=p_payment_id,verified_at=now() where order_id=p_order_id;
  insert into public.order_status_history(order_id,from_status,to_status) values(p_order_id,'PENDING_PAYMENT','PLACED');
  insert into public.notification_jobs(order_id,template,recipient,payload) values(p_order_id,'ORDER_PLACED',v_order.email,jsonb_build_object('orderNumber',v_order.order_number,'totalPaise',v_order.total_paise,'trackingToken',v_order.tracking_token)) on conflict do nothing;
  return v_order;
end $$;

create or replace function public.transition_order(p_order_id uuid,p_to public.order_status,p_actor uuid,p_note text default null,p_courier text default null,p_tracking text default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_role public.staff_role; v_item public.order_items%rowtype; v_from public.order_status;
begin
  select role into v_role from public.profiles where id=p_actor and active;
  if v_role is null or v_role not in ('OWNER','FULFILLMENT_STAFF') then raise exception 'Permission denied'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  v_from:=v_order.status;
  if not ((v_order.status='PLACED' and p_to in ('CONFIRMED','CANCELLED')) or (v_order.status='CONFIRMED' and p_to in ('PACKED','CANCELLED')) or (v_order.status='PACKED' and p_to in ('SHIPPED','CANCELLED')) or (v_order.status='SHIPPED' and p_to='DELIVERED')) then raise exception 'Invalid order transition'; end if;
  if p_to='CANCELLED' and v_role<>'OWNER' then raise exception 'Only owner can cancel'; end if;
  if p_to='CANCELLED' and v_order.payment_status='PAID' then raise exception 'Refund paid order before cancelling'; end if;
  if p_to='SHIPPED' and (coalesce(trim(p_courier),'')='' or coalesce(trim(p_tracking),'')='') then raise exception 'Courier and tracking required'; end if;
  if p_to='CANCELLED' then
    for v_item in select * from public.order_items where order_id=p_order_id loop
      update public.product_variants set stock_on_hand=stock_on_hand+v_item.quantity where id=v_item.variant_id;
      insert into public.inventory_movements(variant_id,quantity_delta,reason,order_id,actor_id) values(v_item.variant_id,v_item.quantity,'CANCELLED_RESTOCK',p_order_id,p_actor);
    end loop;
  end if;
  update public.orders set status=p_to,courier_name=coalesce(p_courier,courier_name),tracking_number=coalesce(p_tracking,tracking_number) where id=p_order_id returning * into v_order;
  insert into public.order_status_history(order_id,from_status,to_status,actor_id,note) values(p_order_id,v_from,p_to,p_actor,p_note);
  if p_to='SHIPPED' then insert into public.notification_jobs(order_id,template,recipient,payload) values(p_order_id,'ORDER_SHIPPED',v_order.email,jsonb_build_object('orderNumber',v_order.order_number,'courier',v_order.courier_name,'trackingNumber',v_order.tracking_number)) on conflict do nothing; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(p_actor,'STATUS_CHANGE','order',p_order_id::text,jsonb_build_object('status',p_to));
  return v_order;
end $$;

create or replace function public.adjust_inventory(p_variant_id uuid,p_delta integer,p_reason text,p_actor uuid)
returns public.product_variants language plpgsql security definer set search_path='' as $$
declare v_role public.staff_role; v_variant public.product_variants%rowtype;
begin
  perform pg_advisory_xact_lock(734201);
  select role into v_role from public.profiles where id=p_actor and active;
  if v_role not in ('OWNER','CATALOG_MANAGER') then raise exception 'Permission denied'; end if;
  if p_delta=0 or length(trim(p_reason))<4 then raise exception 'Quantity change and reason required'; end if;
  if p_delta<0 and (select stock_on_hand+p_delta-coalesce((select sum(quantity) from public.inventory_reservations where variant_id=p_variant_id and status='ACTIVE' and expires_at>now()),0) from public.product_variants where id=p_variant_id)<0 then raise exception 'Stock is reserved for pending orders'; end if;
  update public.product_variants set stock_on_hand=stock_on_hand+p_delta where id=p_variant_id and stock_on_hand+p_delta>=0 returning * into v_variant;
  if not found then raise exception 'Variant missing or stock would become negative'; end if;
  insert into public.inventory_movements(variant_id,quantity_delta,reason,actor_id) values(p_variant_id,p_delta,p_reason,p_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(p_actor,'STOCK_ADJUST','variant',p_variant_id::text,jsonb_build_object('delta',p_delta,'reason',p_reason));
  return v_variant;
end $$;

create or replace function public.expire_order_reservations()
returns integer language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_count integer:=0;
begin
  for v_order in select o.* from public.orders o where o.status='PENDING_PAYMENT' and exists(select 1 from public.inventory_reservations r where r.order_id=o.id and r.status='ACTIVE' and r.expires_at<=now()) for update loop
    update public.inventory_reservations set status='EXPIRED' where order_id=v_order.id and status='ACTIVE';
    delete from public.coupon_redemptions where order_id=v_order.id;
    update public.orders set status='CANCELLED',payment_status='FAILED' where id=v_order.id;
    update public.payments set status='FAILED' where order_id=v_order.id;
    insert into public.order_status_history(order_id,from_status,to_status,note) values(v_order.id,'PENDING_PAYMENT','CANCELLED','Payment reservation expired');
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.claim_notification_jobs(p_limit integer default 10)
returns setof public.notification_jobs language plpgsql security definer set search_path='' as $$
begin
  update public.notification_jobs set status='FAILED',next_attempt_at=now() where status='PROCESSING' and next_attempt_at<now()-interval '10 minutes';
  return query update public.notification_jobs set status='PROCESSING',attempts=attempts+1,next_attempt_at=now()
  where id in (select id from public.notification_jobs where status in ('PENDING','FAILED') and next_attempt_at<=now() and attempts<5 order by created_at for update skip locked limit greatest(1,least(p_limit,20))) returning *;
end $$;

revoke execute on function public.place_checkout(jsonb,jsonb,jsonb,text,text,text,uuid) from public,anon,authenticated;
revoke execute on function public.release_order_reservation(uuid,text) from public,anon,authenticated;
revoke execute on function public.commit_online_payment(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.transition_order(uuid,public.order_status,uuid,text,text,text) from public,anon,authenticated;
revoke execute on function public.adjust_inventory(uuid,integer,text,uuid) from public,anon,authenticated;
revoke execute on function public.expire_order_reservations() from public,anon,authenticated;
revoke execute on function public.claim_notification_jobs(integer) from public,anon,authenticated;
grant execute on function public.place_checkout(jsonb,jsonb,jsonb,text,text,text,uuid) to service_role;
grant execute on function public.release_order_reservation(uuid,text) to service_role;
grant execute on function public.commit_online_payment(uuid,text,text) to service_role;
grant execute on function public.transition_order(uuid,public.order_status,uuid,text,text,text) to service_role;
grant execute on function public.adjust_inventory(uuid,integer,text,uuid) to service_role;
grant execute on function public.expire_order_reservations() to service_role;
grant execute on function public.claim_notification_jobs(integer) to service_role;
