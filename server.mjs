import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { quoteCart, canTransition } from './domain.mjs';
import { configured, adminClient, assertData } from './backend/supabase.mjs';
import { productionApi, productionError } from './backend/api.mjs';
import { processNotificationJobs } from './backend/email.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'dist');
const dataDir = path.join(root, '.data');
const dataFile = process.env.LOCAL_STORE_FILE || path.join(dataDir, 'store.json');
const port = Number(process.env.PORT || 4173);
const productSeed = [
  { id:'palm-jaggery', name:'Palm Jaggery Powder', price:22000, mrp:25000, stock:24, active:true },
  { id:'ragi', name:'Whole Ragi', price:9500, mrp:11000, stock:38, active:true },
  { id:'little-millet', name:'Little Millet', price:14500, mrp:16500, stock:18, active:true },
  { id:'kodo-millet', name:'Kodo Millet', price:15500, mrp:17500, stock:15, active:true },
  { id:'red-rice', name:'Traditional Red Rice', price:13500, mrp:15500, stock:26, active:true },
  { id:'country-sugar', name:'Country Sugar', price:12000, mrp:14000, stock:32, active:true },
  { id:'foxtail-millet', name:'Foxtail Millet', price:15000, mrp:17000, stock:20, active:true },
  { id:'toor-dal', name:'Unpolished Toor Dal', price:17500, mrp:19500, stock:28, active:true }
];

async function loadStore(){
  await mkdir(path.dirname(dataFile),{recursive:true});
  if(!existsSync(dataFile)) await writeFile(dataFile,JSON.stringify({products:productSeed,orders:[],settings:{shippingFee:6000,freeShippingThreshold:49900,codEnabled:true}},null,2));
  const store=JSON.parse(await readFile(dataFile,'utf8'));
  if(store.orders.length===0&&store.products.some(p=>p.id==='classic')){
    store.products=productSeed;
    await saveStore(store);
  }
  return store;
}
async function saveStore(store){await writeFile(dataFile,JSON.stringify(store,null,2));}
function send(res,status,body,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(body));}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw new Error('Payload too large');}return raw?JSON.parse(raw):{};}
function safeEqual(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}

export async function api(req,res,url){
  if(configured())return productionApi(req,res,url);
  if(process.env.NODE_ENV==='production')return send(res,503,{error:'Database connection is not configured'});
  const store=await loadStore();
  if(req.method==='GET'&&url.pathname==='/api/health') return send(res,200,{ok:true,mode:process.env.SUPABASE_URL?'supabase-ready':'local-development'});
  if(req.method==='GET'&&url.pathname==='/api/config') return send(res,200,{catalogSource:'preview',storeLive:false,whatsappNumber:null});
  if(req.method==='GET'&&url.pathname==='/api/catalog/products') return send(res,200,{items:store.products.filter(p=>p.active)});
  if(req.method==='POST'&&url.pathname==='/api/checkout/quote'){
    const input=await body(req);const lines=[];
    if(!Array.isArray(input.items)||!input.items.length||input.items.length>40)return send(res,400,{error:'Invalid cart'});
    const quantities=new Map();for(const item of input.items){const product=store.products.find(p=>p.id===(item.variantId||item.id)&&p.active);if(!product) return send(res,400,{error:'Product unavailable'});const quantity=item.quantity;if(!Number.isInteger(quantity)||quantity<1||quantity>20)return send(res,400,{error:'Invalid quantity'});quantities.set(product.id,(quantities.get(product.id)||0)+quantity);if(quantities.get(product.id)>product.stock)return send(res,409,{error:`Only ${product.stock} ${product.name} available`});lines.push({price:product.price,quantity});}
    return send(res,200,quoteCart(lines,null,store.settings.freeShippingThreshold,store.settings.shippingFee));
  }
  if(req.method==='POST'&&url.pathname==='/api/orders'){
    const input=await body(req);if(!Array.isArray(input.items)||!input.items.length||input.items.length>40)return send(res,400,{error:'Your bag is empty'});
    if(input.paymentMethod!=='cod')return send(res,400,{error:'Cash on delivery is the available payment method'});
    if(!String(input.customer?.name||'').trim()||!/^\S+@\S+\.\S+$/.test(input.customer?.email||'')||!/^[1-9][0-9]{5}$/.test(input.address?.pin||''))return send(res,400,{error:'Please complete your contact and delivery details'});
    const lines=[];const quantities=new Map();for(const item of input.items){const p=store.products.find(x=>x.id===(item.variantId||item.id)&&x.active);const qty=item.quantity;if(!Number.isInteger(qty)||qty<1||qty>20)return send(res,400,{error:'Invalid quantity'});if(!p)return send(res,409,{error:'Item is no longer available'});quantities.set(p.id,(quantities.get(p.id)||0)+qty);if(quantities.get(p.id)>p.stock)return send(res,409,{error:`${p.name} is no longer available`});lines.push({product:p,quantity:qty,variant:item.variant});}
    const totals=quoteCart(lines.map(x=>({price:x.product.price,quantity:x.quantity})),null,store.settings.freeShippingThreshold,store.settings.shippingFee);
    const cod=true;const orderNumber=`VSO-${String(1043+store.orders.length).padStart(4,'0')}`;const trackingToken=crypto.randomUUID();
    const order={id:crypto.randomUUID(),orderNumber,trackingToken,customer:input.customer,address:input.address,items:lines.map(x=>({productId:x.product.id,name:x.product.name,variant:x.variant,quantity:x.quantity,unitPrice:x.product.price})),...totals,status:cod?'PLACED':'PENDING_PAYMENT',paymentStatus:cod?'NOT_REQUIRED':'PENDING',createdAt:new Date().toISOString(),history:[{status:cod?'PLACED':'PENDING_PAYMENT',at:new Date().toISOString()}]};
    if(cod)for(const line of lines)line.product.stock-=line.quantity;
    store.orders.push(order);await saveStore(store);
    return send(res,201,{orderNumber,trackingToken,total:totals.total,status:order.status});
  }
  if(req.method==='GET'&&url.pathname==='/api/orders/track'){
    const number=url.searchParams.get('orderNumber')?.toUpperCase();const email=url.searchParams.get('email')?.toLowerCase();const token=url.searchParams.get('token');const order=store.orders.find(o=>(token&&safeEqual(o.trackingToken,token))||(o.orderNumber===number&&o.customer.email.toLowerCase()===email));
    if(!order)return send(res,404,{error:'Order not found'});return send(res,200,{orderNumber:order.orderNumber,status:order.status,createdAt:order.createdAt,history:order.history,total:order.total});
  }
  if(url.pathname.startsWith('/api/admin/')){
    if(req.headers['x-admin-key']!==(process.env.ADMIN_API_KEY||'local-admin'))return send(res,401,{error:'Unauthorized'});
    if(req.method==='GET'&&url.pathname==='/api/admin/orders')return send(res,200,{items:store.orders});
    const match=url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
    if(req.method==='PATCH'&&match){const input=await body(req);const order=store.orders.find(o=>o.id===match[1]||o.orderNumber===match[1]);if(!order)return send(res,404,{error:'Order not found'});if(!canTransition(order.status,input.status,input.role||'FULFILLMENT_STAFF'))return send(res,409,{error:'Transition not permitted'});order.status=input.status;order.history.push({status:input.status,at:new Date().toISOString(),note:input.note||null});await saveStore(store);return send(res,200,order);}
  }
  return send(res,404,{error:'Not found'});
}

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return await api(req,res,url);let rel=decodeURIComponent(url.pathname);if(rel==='/'||rel==='')rel='/index.html';const target=path.resolve(publicDir,'.'+rel);if(target!==publicDir&&!target.startsWith(publicDir+path.sep))return send(res,403,{error:'Forbidden'});try{const file=await readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream'});res.end(file);}catch{const file=await readFile(path.join(publicDir,'index.html'));res.writeHead(200,{'content-type':types['.html']});res.end(file);}}catch(error){if(configured())return productionError(res,error);send(res,error.message==='Payload too large'?413:500,{error:error.message});}});
if(process.env.NODE_ENV!=='test'){
  server.listen(port,process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1',()=>console.log(`VS Organics: http://localhost:${port}`));
  if(configured())setInterval(async()=>{try{assertData(await adminClient().rpc('expire_order_reservations'));await processNotificationJobs();}catch(error){console.error('Background job failed:',error.message)}},60_000).unref();
}
