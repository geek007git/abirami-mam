import { createClient } from '@supabase/supabase-js';

export function configured(){return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);}

export function adminClient(){
  if(!configured()) throw new Error('Supabase is not configured');
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}

export function publicClient(){
  if(!configured()) throw new Error('Supabase is not configured');
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}

export function assertData(result){if(result.error)throw new Error(result.error.message);return result.data;}

export async function requireStaff(request,allowed){
  const token=(request.headers.authorization||'').replace(/^Bearer /i,'');
  if(!token) return null;
  const client=adminClient();
  const {data:{user},error}=await client.auth.getUser(token);
  if(error||!user)return null;
  const profile=assertData(await client.from('profiles').select('id,role,active,full_name').eq('id',user.id).single());
  return profile.active&&allowed.includes(profile.role)?{...profile,email:user.email}:null;
}

export async function catalog(){
  const db=adminClient();
  const rows=assertData(await db.from('products').select('id,name,slug,description,ingredients,nutrition,label_info,category:categories(name,slug),variants:product_variants(id,sku,label,price_paise,mrp_paise,stock_on_hand,active),images:product_images(storage_path,alt_text,sort_order)').eq('published',true).order('name'));
  return rows.map(p=>({...p,variants:p.variants.filter(v=>v.active).sort((a,b)=>a.price_paise-b.price_paise),images:p.images.sort((a,b)=>a.sort_order-b.sort_order).map(i=>({...i,url:db.storage.from('product-images').getPublicUrl(i.storage_path).data.publicUrl}))})).filter(p=>p.variants.length);
}
