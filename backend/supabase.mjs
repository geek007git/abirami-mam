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
  const products=assertData(await db.from('products').select('id,name,slug,description,ingredients,nutrition,label_info,category_id').eq('published',true).order('name'));
  if(!products.length)return [];
  const ids=products.map(p=>p.id);
  const [categories,variants,images]=await Promise.all([
    db.from('categories').select('id,name,slug').in('id',products.map(p=>p.category_id).filter(Boolean)),
    db.from('product_variants').select('id,product_id,sku,label,price_paise,mrp_paise,stock_on_hand,active').in('product_id',ids).eq('active',true),
    db.from('product_images').select('product_id,storage_path,alt_text,sort_order').in('product_id',ids),
  ]);
  const categoryRows=assertData(categories),variantRows=assertData(variants),imageRows=assertData(images);
  return products.map(p=>({
    ...p,
    category:categoryRows.find(c=>c.id===p.category_id)||null,
    variants:variantRows.filter(v=>v.product_id===p.id).sort((a,b)=>a.price_paise-b.price_paise),
    images:imageRows.filter(i=>i.product_id===p.id).sort((a,b)=>a.sort_order-b.sort_order).map(i=>({...i,url:db.storage.from('product-images').getPublicUrl(i.storage_path).data.publicUrl})),
  })).filter(p=>p.variants.length);
}
