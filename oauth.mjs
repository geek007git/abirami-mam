export function parseGoogleCallback(pathname, hash, pendingIntent){
  if(pathname!=='/')return null;
  const params=new URLSearchParams(hash.replace(/^#/,''));
  if(!params.has('access_token')&&!params.has('error'))return null;
  const intent=['admin','account'].includes(pendingIntent)?pendingIntent:null;
  if(params.has('error'))return {intent,error:'Google sign-in was cancelled or could not be completed.'};
  const accessToken=params.get('access_token'),refreshToken=params.get('refresh_token');
  if(!intent||!accessToken||!refreshToken)return {intent,error:'Google sign-in could not be completed. Please try again.'};
  return {intent,accessToken,refreshToken};
}
