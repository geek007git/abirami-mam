import {adminClient,assertData} from './supabase.mjs';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function message(job){const p=job.payload||{},number=escape(p.orderNumber),site=process.env.SITE_URL||(process.env.RENDER_EXTERNAL_HOSTNAME?`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`:'http://localhost:4173');
  if(job.template==='ORDER_PLACED')return {subject:`VS Organics order ${number} received`,html:`<h1>Thank you for your order</h1><p>Your order <strong>${number}</strong> has been received.</p><p>Total: ₹${(Number(p.totalPaise||0)/100).toFixed(2)}</p><p><a href="${escape(site)}/#/track">Track your order</a> using your order number and email.</p>`};
  if(job.template==='ORDER_SHIPPED')return {subject:`VS Organics order ${number} shipped`,html:`<h1>Your order is on its way</h1><p>Order <strong>${number}</strong> has shipped with ${escape(p.courier)}.</p><p>Tracking number: <strong>${escape(p.trackingNumber)}</strong></p>`};
  throw new Error('Unknown notification template');
}
export async function processNotificationJobs(){
  if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return;
  const db=adminClient(),jobs=assertData(await db.rpc('claim_notification_jobs',{p_limit:10}));
  for(const job of jobs){try{const mail=message(job);const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[job.recipient],subject:mail.subject,html:mail.html})});const result=await response.json();if(!response.ok)throw new Error(result.message||`Email provider error ${response.status}`);assertData(await db.from('notification_jobs').update({status:'SENT',provider_response:result}).eq('id',job.id));}catch(error){const retryMinutes=Math.min(60,2**job.attempts);assertData(await db.from('notification_jobs').update({status:'FAILED',provider_response:{error:error.message},next_attempt_at:new Date(Date.now()+retryMinutes*60_000).toISOString()}).eq('id',job.id));}}
}
