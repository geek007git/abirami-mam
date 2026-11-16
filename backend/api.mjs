import crypto from 'node:crypto';
import { adminClient, publicClient, assertData, requireStaff, catalog } from './supabase.mjs';
import { checkout, productWrite, variantWrite, variantPatch, statusWrite } from './validation.mjs';

const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const fail=(res,status,message)=>json(res,status,{error:message});
const parse=async(req,limit=100_000)=>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>limit)throw new Error('Request too large');}return JSON.parse(raw||'{}');};
const originAllowed=req=>!req.headers.origin||new URL(req.headers.origin).host===req.headers.host;
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x||'');
const attempts=new Map();
let googleSettings={checkedAt:0,enabled:false};
function limited(req,key,max,windowMs){const id=`${req.socket.remoteAddress}:${key}`;const now=Date.now();const recent=(attempts.get(id)||[]).filter(t=>now-t<windowMs);recent.push(now);attempts.set(id,recent);return recent.length>max;}
async function googleEnabled(){
  if(Date.now()-googleSettings.checkedAt<60_000)return googleSettings.enabled;
  let enabled=false;
  try{
    const response=await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/auth/v1/settings`,{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(4000)});
    if(response.ok)enabled=Boolean((await response.json()).external?.google);
  }catch{}
  googleSettings={checkedAt:Date.now(),enabled};
  return enabled;
}
function siteBase(){
  try{
    const url=new URL(process.env.SITE_URL||'');
    if(url.protocol==='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return url.origin;
  }catch{}
  return process.env.RENDER_EXTERNAL_HOSTNAME?`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`:null;
}
const audit=async(actor,action,entityType,entityId,before,after)=>{assertData(await adminClient().from('audit_logs').insert({actor_id:actor.id,action,entity_type:entityType,entity_id:String(entityId),before_data:before,after_data:after}));};

export async function productionApi(req,res,url){
  const db=adminClient();
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,mode:'supabase'});
  if(req.method==='GET'&&url.pathname==='/api/health/catalog'){
    const checks={};
    for(const table of ['products','product_variants','product_images']){
      const result=await db.from(table).select('id').limit(1);
      checks[table]=result.error?.code||'ok';
    }
    const embedded=await db.from('products').select('id,category:categories(id),variants:product_variants(id),images:product_images(id)').limit(1);
    checks.relationships=embedded.error?.code||'ok';
    return json(res,200,{revision:process.env.RENDER_GIT_COMMIT?.slice(0,7)||null,checks});
  }
  if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{catalogSource:'supabase',storeLive:process.env.STORE_LIVE==='true',whatsappNumber:process.env.WHATSAPP_NUMBER||null,googleAuthEnabled:await googleEnabled()});
  if(req.method==='GET'&&url.pathname==='/api/catalog/products')return json(res,200,{items:await catalog()});
  if(req.method==='GET'&&url.pathname==='/api/catalog/categories')return json(res,200,{items:assertData(await db.from('categories').select('id,name,slug').eq('active',true).order('sort_order'))});
  if(req.method==='GET'&&url.pathname==='/api/auth/google/start'){
    if(limited(req,'google-start',30,15*60_000))return fail(res,429,'Please try again later');
    if(!await googleEnabled())return fail(res,503,'Google sign-in is not configured yet');
    const base=siteBase();
    if(!base)return fail(res,503,'Google sign-in is not configured yet');
    const {data,error}=await publicClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:base,skipBrowserRedirect:true}});
    if(error||!data.url)return fail(res,503,'Google sign-in could not be started');
    return json(res,200,{url:data.url});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/login'){
    if(limited(req,'login',10,15*60_000))return fail(res,429,'Too many sign-in attempts');
    if(!originAllowed(req))return fail(res,403,'Invalid origin');
    const input=await parse(req);const {data,error}=await publicClient().auth.signInWithPassword({email:input.email,password:input.password});
    if(error||!data.session)return fail(res,401,'Invalid email or password');
    return json(res,200,{accessToken:data.session.access_token,refreshToken:data.session.refresh_token,expiresAt:data.session.expires_at});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/recover'){
    if(limited(req,'recover',5,60*60_000))return fail(res,429,'Please try again later');
    if(!originAllowed(req))return fail(res,403,'Invalid origin');
    const input=await parse(req);
    if(!/^\S+@\S+\.\S+$/.test(input.email||''))return fail(res,400,'Enter a valid email address');
    const base=siteBase();
    if(!base)return fail(res,503,'Password recovery is not configured');
    const {error}=await publicClient().auth.resetPasswordForEmail(input.email,{redirectTo:`${base.replace(/\/$/,'')}/reset-password`});
    if(error){console.error('Password recovery:',error.message);return fail(res,503,'Password reset email could not be sent');}
    return json(res,200,{message:'If this email has an account, a password reset link is on its way.'});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/recover/complete'){
    if(limited(req,'recover-complete',10,60*60_000))return fail(res,429,'Please try again later');
    if(!originAllowed(req))return fail(res,403,'Invalid origin');
    const input=await parse(req);
    if(typeof input.password!=='string'||input.password.length<10)return fail(res,400,'Use a password of at least 10 characters');
    if(!input.accessToken||!input.refreshToken)return fail(res,400,'Reset link is incomplete');
    const client=publicClient();
    const {data,error}=await client.auth.setSession({access_token:input.accessToken,refresh_token:input.refreshToken});
    if(error||!data.user)return fail(res,401,'Reset link has expired');
    const updated=await client.auth.updateUser({password:input.password});
    if(updated.error)return fail(res,400,updated.error.message);
    return json(res,200,{message:'Password updated. Sign in with your new password.'});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/register'){
    if(limited(req,'register',5,60*60_000))return fail(res,429,'Too many registration attempts');
    if(!originAllowed(req))return fail(res,403,'Invalid origin');
    const input=await parse(req);if(!/^\S+@\S+\.\S+$/.test(input.email||'')||String(input.password||'').length<10||String(input.name||'').trim().length<2)return fail(res,400,'Name, email and a 10-character password required');
    const {data,error}=await publicClient().auth.signUp({email:input.email,password:input.password,options:{data:{full_name:input.name}}});
    if(error)throw error;return json(res,201,{confirmationRequired:!data.session});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/refresh'){
    if(!originAllowed(req))return fail(res,403,'Invalid origin');
    const input=await parse(req);const {data,error}=await publicClient().auth.refreshSession({refresh_token:input.refreshToken});
    if(error||!data.session)return fail(res,401,'Session expired');
    return json(res,200,{accessToken:data.session.access_token,refreshToken:data.session.refresh_token,expiresAt:data.session.expires_at});
  }
  if(req.method==='GET'&&url.pathname==='/api/auth/me'){
    const actor=await requireStaff(req,['OWNER','CATALOG_MANAGER','FULFILLMENT_STAFF']);
    return actor?json(res,200,{user:actor}):fail(res,401,'Sign in required');
  }
  if(req.method==='GET'&&url.pathname==='/api/account/orders'){
    const access=(req.headers.authorization||'').replace(/^Bearer /i,'');
    const {data:{user},error}=await db.auth.getUser(access);if(error||!user)return fail(res,401,'Sign in required');
    const items=assertData(await db.from('orders').select('order_number,status,payment_status,total_paise,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(100));
    return json(res,200,{items,email:user.email});
  }
  if(req.method==='GET'&&url.pathname==='/api/orders/track'){
    if(limited(req,'track',30,15*60_000))return fail(res,429,'Please try again later');
    const token=url.searchParams.get('token');const number=url.searchParams.get('orderNumber');const email=url.searchParams.get('email');
    if(!uuid(token)&&(!/^VSO-\d{4,}$/.test(number||'')||!/^\S+@\S+\.\S+$/.test(email||'')))return fail(res,400,'Order number and email required');
    let query=db.from('orders').select('order_number,status,payment_status,total_paise,created_at,courier_name,tracking_number').limit(1);
    query=uuid(token)?query.eq('tracking_token',token):query.eq('order_number',number).ilike('email',email);
    const rows=assertData(await query);
    return rows.length?json(res,200,{order:rows[0]}):fail(res,404,'Order not found');
  }
  if(req.method==='POST'&&url.pathname==='/api/checkout/quote'){
    if(limited(req,'quote',100,15*60_000))return fail(res,429,'Please try again later');
    const input=await parse(req);const items=Array.isArray(input.items)?input.items:[];
    if(!items.length||items.length>40)return fail(res,400,'Invalid cart');
    const ids=items.map(i=>i.variantId);if(!ids.every(uuid))return fail(res,400,'Invalid variant');
    const variants=assertData(await db.from('product_variants').select('id,price_paise,stock_on_hand,active,product:products(published)').in('id',ids));
    let subtotal=0;for(const item of items){const v=variants.find(x=>x.id===item.variantId);if(!v||!v.active||!v.product?.published||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20)return fail(res,400,'Invalid cart item');subtotal+=v.price_paise*item.quantity;}
    const settings=assertData(await db.from('store_settings').select('shipping_fee_paise,free_shipping_threshold_paise').eq('id',true).single());
    const shipping=subtotal>=settings.free_shipping_threshold_paise?0:settings.shipping_fee_paise;
    return json(res,200,{subtotal,discount:0,shipping,total:subtotal+shipping,notice:'Final stock and price are checked when placing the order'});
  }
  if(req.method==='POST'&&url.pathname==='/api/orders'){
    if(limited(req,'order',15,15*60_000))return fail(res,429,'Please try again later');
    if(!originAllowed(req))return fail(res,403,'Invalid origin');
    if(process.env.STORE_LIVE!=='true')return fail(res,503,'Checkout opens after store setup is approved');
    const parsed=checkout.safeParse(await parse(req));if(!parsed.success)return fail(res,400,parsed.error.issues[0]?.message||'Invalid checkout');
    const input=parsed.data;
    const access=(req.headers.authorization||'').replace(/^Bearer /i,'');let customerId=null;
    if(access){const identity=await db.auth.getUser(access);if(!identity.error&&identity.data.user)customerId=identity.data.user.id;}
    const order=assertData(await db.rpc('place_checkout',{p_items:input.items,p_customer:input.customer,p_address:input.address,p_payment_method:input.paymentMethod,p_coupon:input.coupon||null,p_notes:input.notes||null,p_customer_id:customerId}));
    return json(res,201,{orderNumber:order.order_number,trackingToken:order.tracking_token,total:order.total_paise,status:order.status});
  }
  if(url.pathname.startsWith('/api/admin/')){
    const read=req.method==='GET';if(!read&&!originAllowed(req))return fail(res,403,'Invalid origin');
    const catalogRoles=['OWNER','CATALOG_MANAGER'];const orderRoles=['OWNER','FULFILLMENT_STAFF'];
    const allowed=read?['OWNER','CATALOG_MANAGER','FULFILLMENT_STAFF']:url.pathname.includes('/products')||url.pathname.includes('/variants')||url.pathname.includes('/categories')||url.pathname.includes('/coupons')||url.pathname.includes('/inventory')?catalogRoles:url.pathname.includes('/settings')||url.pathname.includes('/staff')?['OWNER']:orderRoles;
    const actor=await requireStaff(req,allowed);
    if(!actor)return fail(res,403,'Permission denied');
    if(read&&url.pathname==='/api/admin/overview'){
      const orders=assertData(await db.from('orders').select('id,order_number,email,total_paise,status,payment_status,created_at').order('created_at',{ascending:false}).limit(100));
      const variants=assertData(await db.from('product_variants').select('id,sku,label,stock_on_hand,low_stock_threshold,product:products(name)'));
      return json(res,200,{orders,lowStock:variants.filter(v=>v.stock_on_hand<=v.low_stock_threshold),revenuePaise:orders.filter(o=>o.payment_status==='PAID'||o.payment_status==='NOT_REQUIRED').reduce((n,o)=>n+o.total_paise,0)});
    }
    if(read&&url.pathname==='/api/admin/products')return json(res,200,{items:assertData(await db.from('products').select('*,variants:product_variants(*)').order('created_at',{ascending:false}))});
    if(read&&url.pathname==='/api/admin/categories')return json(res,200,{items:assertData(await db.from('categories').select('*').order('sort_order'))});
    if(read&&url.pathname==='/api/admin/coupons')return json(res,200,{items:assertData(await db.from('coupons').select('*').order('created_at',{ascending:false}))});
    if(read&&url.pathname==='/api/admin/settings')return json(res,200,{settings:assertData(await db.from('store_settings').select('*').eq('id',true).single())});
    if(read&&url.pathname==='/api/admin/orders')return json(res,200,{items:assertData(await db.from('orders').select('*,items:order_items(*)').order('created_at',{ascending:false}).limit(100))});
    if(req.method==='POST'&&url.pathname==='/api/admin/products'){
      const input=productWrite.safeParse(await parse(req));if(!input.success)return fail(res,400,input.error.issues[0].message);
      const item=assertData(await db.from('products').insert(input.data).select().single());await audit(actor,'CREATE','product',item.id,null,item);return json(res,201,{item});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/variants'){
      const input=variantWrite.safeParse(await parse(req));if(!input.success)return fail(res,400,input.error.issues[0].message);
      const item=assertData(await db.from('product_variants').insert(input.data).select().single());await audit(actor,'CREATE','variant',item.id,null,item);return json(res,201,{item});
    }
    if(req.method==='PATCH'&&/^\/api\/admin\/products\/[0-9a-f-]+$/.test(url.pathname)){
      const id=url.pathname.split('/').at(-1);if(!uuid(id))return fail(res,400,'Invalid product');
      const input=productWrite.partial().safeParse(await parse(req));if(!input.success)return fail(res,400,input.error.issues[0].message);
      if(input.data.published===true){const variants=assertData(await db.from('product_variants').select('id').eq('product_id',id).eq('active',true).limit(1));if(!variants.length)return fail(res,400,'Add an active variant before publishing');}
      const before=assertData(await db.from('products').select('*').eq('id',id).single());const item=assertData(await db.from('products').update(input.data).eq('id',id).select().single());await audit(actor,'UPDATE','product',id,before,item);return json(res,200,{item});
    }
    if(req.method==='PATCH'&&/^\/api\/admin\/variants\/[0-9a-f-]+$/.test(url.pathname)){
      const id=url.pathname.split('/').at(-1);if(!uuid(id))return fail(res,400,'Invalid variant');
      const input=variantPatch.safeParse(await parse(req));if(!input.success)return fail(res,400,input.error.issues[0].message);
      const before=assertData(await db.from('product_variants').select('*').eq('id',id).single());if((input.data.mrp_paise??before.mrp_paise)<(input.data.price_paise??before.price_paise))return fail(res,400,'MRP must be at least the selling price');
      const item=assertData(await db.from('product_variants').update(input.data).eq('id',id).select().single());await audit(actor,'UPDATE','variant',id,before,item);return json(res,200,{item});
    }
    const imageMatch=url.pathname.match(/^\/api\/admin\/products\/([0-9a-f-]+)\/images$/);
    if(req.method==='POST'&&imageMatch&&uuid(imageMatch[1])){
      const type=String(req.headers['content-type']||'').split(';')[0],extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
      if(!extensions[type])return fail(res,415,'Use JPEG, PNG or WebP');
      let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>5_000_000)return fail(res,413,'Image exceeds 5 MB');chunks.push(chunk)}
      if(size<100)return fail(res,400,'Image is empty');
      const productId=imageMatch[1],path=`${productId}/${crypto.randomUUID()}.${extensions[type]}`;
      const upload=await db.storage.from('product-images').upload(path,Buffer.concat(chunks),{contentType:type,upsert:false});if(upload.error)throw upload.error;
      const item=assertData(await db.from('product_images').insert({product_id:productId,storage_path:path,alt_text:'Product image',sort_order:0}).select().single());await audit(actor,'UPLOAD_IMAGE','product',productId,null,{path});return json(res,201,{item});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/inventory/adjust'){
      const input=await parse(req);if(!uuid(input.variantId)||!Number.isInteger(input.delta)||!String(input.reason||'').trim())return fail(res,400,'Variant, quantity change and reason required');
      const item=assertData(await db.rpc('adjust_inventory',{p_variant_id:input.variantId,p_delta:input.delta,p_reason:input.reason,p_actor:actor.id}));return json(res,200,{item});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/categories'){
      const input=await parse(req);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug||'')||!String(input.name||'').trim())return fail(res,400,'Name and slug required');
      const item=assertData(await db.from('categories').insert({name:input.name,slug:input.slug,active:true}).select().single());await audit(actor,'CREATE','category',item.id,null,item);return json(res,201,{item});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/coupons'){
      const input=await parse(req);const code=String(input.code||'').trim().toUpperCase(),type=input.discount_type,value=Number(input.value);
      if(!/^[A-Z0-9_-]{3,30}$/.test(code)||!['PERCENT','FIXED'].includes(type)||!Number.isInteger(value)||value<1||(type==='PERCENT'&&value>100))return fail(res,400,'Invalid coupon');
      const item=assertData(await db.from('coupons').insert({code,discount_type:type,value,minimum_subtotal_paise:Math.max(0,Number(input.minimum_subtotal_paise)||0),usage_limit:input.usage_limit?Number(input.usage_limit):null,active:true}).select().single());await audit(actor,'CREATE','coupon',item.id,null,item);return json(res,201,{item});
    }
    const couponMatch=url.pathname.match(/^\/api\/admin\/coupons\/([0-9a-f-]+)$/);
    if(req.method==='PATCH'&&couponMatch&&uuid(couponMatch[1])){
      const input=await parse(req);const changes={};if(typeof input.active==='boolean')changes.active=input.active;if(input.ends_at)changes.ends_at=input.ends_at;
      const before=assertData(await db.from('coupons').select('*').eq('id',couponMatch[1]).single());const item=assertData(await db.from('coupons').update(changes).eq('id',couponMatch[1]).select().single());await audit(actor,'UPDATE','coupon',item.id,before,item);return json(res,200,{item});
    }
    if(req.method==='PATCH'&&url.pathname==='/api/admin/settings'){
      const input=await parse(req);const allowedSettings=['store_name','announcement','contact','social_links','branding','shipping_fee_paise','free_shipping_threshold_paise','serviceable_pin_codes','cod_enabled','cod_minimum_paise','cod_maximum_paise','low_stock_threshold','seo'];const changes=Object.fromEntries(Object.entries(input).filter(([key])=>allowedSettings.includes(key)));
      const before=assertData(await db.from('store_settings').select('*').eq('id',true).single());const item=assertData(await db.from('store_settings').update(changes).eq('id',true).select().single());await audit(actor,'UPDATE','settings','store',before,item);return json(res,200,{item});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/staff/invite'){
      if(actor.role!=='OWNER')return fail(res,403,'Owner only');const input=await parse(req);if(!/^\S+@\S+\.\S+$/.test(input.email||'')||!['OWNER','CATALOG_MANAGER','FULFILLMENT_STAFF'].includes(input.role))return fail(res,400,'Valid email and role required');
      const base=siteBase();
      if(!base)return fail(res,503,'Staff invitations are not configured');
      const {data,error}=await db.auth.admin.inviteUserByEmail(input.email,{redirectTo:`${base.replace(/\/$/,'')}/reset-password`});if(error)throw error;assertData(await db.from('profiles').update({role:input.role}).eq('id',data.user.id));await audit(actor,'INVITE','staff',data.user.id,null,{email:input.email,role:input.role});return json(res,201,{userId:data.user.id});
    }
    const orderMatch=url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]+)\/status$/);
    if(req.method==='PATCH'&&orderMatch&&uuid(orderMatch[1])){
      const input=statusWrite.safeParse(await parse(req));if(!input.success)return fail(res,400,input.error.issues[0].message);
      const item=assertData(await db.rpc('transition_order',{p_order_id:orderMatch[1],p_to:input.data.status,p_actor:actor.id,p_note:input.data.note||null,p_courier:input.data.courier_name||null,p_tracking:input.data.tracking_number||null}));return json(res,200,{item});
    }
  }
  return fail(res,404,'Not found');
}

export function productionError(res,error){const message=error?.message||'Unexpected error';console.error(message);const publicMessages=['Invalid checkout','Invalid contact details','Invalid address','PIN code not serviceable','COD unavailable','Invalid quantity','Quantity limit exceeded','Variant unavailable','Product unavailable','Insufficient stock','Coupon unavailable','Coupon minimum not reached','Coupon limit reached','Coupon already used','COD order value unavailable','Duplicate variants in cart','Invalid order transition','Courier and tracking required','Permission denied'];const safe=publicMessages.find(m=>message.startsWith(m));return fail(res,safe?400:500,safe?message:'Something went wrong. Please try again.');}
