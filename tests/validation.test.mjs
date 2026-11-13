import test from 'node:test';
import assert from 'node:assert/strict';
import {checkout,variantWrite,variantPatch} from '../backend/validation.mjs';

test('checkout rejects malformed PIN and quantity',()=>{
  const input={items:[{variantId:'123e4567-e89b-42d3-a456-426614174000',quantity:1}],customer:{name:'Test User',email:'test@example.com',phone:'9876543210'},address:{line1:'Street address',city:'Chennai',state:'Tamil Nadu',pin:'600001'},paymentMethod:'cod'};
  assert.equal(checkout.safeParse(input).success,true);
  assert.equal(checkout.safeParse({...input,address:{...input.address,pin:'000001'}}).success,false);
  assert.equal(checkout.safeParse({...input,items:[{...input.items[0],quantity:0}]}).success,false);
});

test('variant editing cannot bypass inventory ledger',()=>{
  assert.equal(variantPatch.safeParse({stock_on_hand:999}).data.stock_on_hand,undefined);
  assert.equal(variantWrite.safeParse({product_id:'123e4567-e89b-42d3-a456-426614174000',sku:'RAGI-500',label:'500 g',price_paise:12000,mrp_paise:10000,stock_on_hand:5}).success,false);
});
