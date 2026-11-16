import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {parseGoogleCallback} from '../oauth.mjs';

test('Google callback keeps customer and admin destinations distinct',()=>{
  const hash='#access_token=access&refresh_token=refresh&token_type=bearer';
  assert.deepEqual(parseGoogleCallback('/',hash,'account'),{intent:'account',accessToken:'access',refreshToken:'refresh'});
  assert.deepEqual(parseGoogleCallback('/',hash,'admin'),{intent:'admin',accessToken:'access',refreshToken:'refresh'});
});

test('Google callback rejects missing intent and leaves recovery links alone',()=>{
  const hash='#access_token=access&refresh_token=refresh';
  assert.match(parseGoogleCallback('/',hash,null).error,/could not be completed/);
  assert.equal(parseGoogleCallback('/reset-password',hash,'admin'),null);
  assert.equal(parseGoogleCallback('/','#/shop','admin'),null);
});

test('Google callback reports provider errors without accepting a session',()=>{
  assert.deepEqual(parseGoogleCallback('/','#error=access_denied','admin'),{
    intent:'admin',error:'Google sign-in was cancelled or could not be completed.'
  });
});

test('Supabase builds an implicit Google authorize URL for the live site',async()=>{
  const client=createClient('https://project.supabase.co','sb_publishable_test',{auth:{flowType:'implicit',autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://vs-organics-store.onrender.com',skipBrowserRedirect:true}});
  assert.equal(error,null);
  const url=new URL(data.url);
  assert.equal(url.pathname,'/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'),'google');
  assert.equal(url.searchParams.get('redirect_to'),'https://vs-organics-store.onrender.com');
});
