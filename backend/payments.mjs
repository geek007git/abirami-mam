import crypto from 'node:crypto';

function compare(a,b){const x=Buffer.from(a||'','hex'),y=Buffer.from(b||'','hex');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function verifyCheckoutSignature(orderId,paymentId,signature,secret){
  if(!orderId||!paymentId||!signature||!secret)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${orderId}|${paymentId}`).digest('hex');
  return compare(expected,signature);
}
export function verifyWebhookSignature(raw,signature,secret){
  if(!raw||!signature||!secret)return false;
  const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
  return compare(expected,signature);
}
export async function createRazorpayOrder(amount,receipt){
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!key||!secret)throw new Error('Online payments are not configured');
  const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'content-type':'application/json'},body:JSON.stringify({amount,currency:'INR',receipt,payment_capture:1})});
  const data=await response.json();
  if(!response.ok||!data.id)throw new Error('Payment order could not be created');
  return data;
}

export async function fetchRazorpayPayment(paymentId){
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!key||!secret)throw new Error('Online payments are not configured');
  const response=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`}});
  if(!response.ok)throw new Error('Could not verify captured payment');
  return response.json();
}
