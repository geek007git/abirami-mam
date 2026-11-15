import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderShop } from '../merchandising.mjs';

const products = [
  { id: 'ragi', name: 'Whole Ragi', category: 'Millets', description: 'Traditional millet', variants: [{ id: 'ragi-500', label: '500 g', price_paise: 9500, mrp_paise: 11000, stock_on_hand: 4 }] },
  { id: 'sugar', name: 'Country Sugar', category: 'Natural Sweeteners', description: 'Natural sweetener', variants: [{ id: 'sugar-500', label: '500 g', price_paise: 12000, mrp_paise: 12000, stock_on_hand: 0 }] },
];
const helpers = { money: value => `₹${value / 100}`, escape: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'), visual: () => '<span>Product visual</span>' };

test('storefront surfaces shopping categories and stock-aware actions', () => {
  const html = renderHome(products, helpers);
  assert.match(html, /shop\/Millets/);
  assert.match(html, /data-add="ragi-500"/);
  assert.match(html, /Sold out/);
});

test('empty catalogue shows an honest opening state', () => {
  const html = renderHome([], helpers);
  assert.match(html, /hero-pantry\.webp/);
  assert.match(html, /stocking the shelves/);
  assert.doesNotMatch(html, /data-add=/);
});

test('catalogue search filters products and escapes the search term', () => {
  const html = renderShop(products, 'search:<ragi>', helpers);
  assert.doesNotMatch(html, /<ragi>/);
  assert.match(html, /&lt;ragi&gt;/);
  assert.doesNotMatch(html, /data-add="sugar-500"/);
  const matching = renderShop(products, 'search:ragi', helpers);
  assert.match(matching, /Whole Ragi/);
  assert.doesNotMatch(matching, /Country Sugar/);
});

test('catalogue cards use accessible product imagery when supplied', () => {
  const pictured = [{
    ...products[0],
    images: [{ url: 'assets/products/ragi-preview.jpg', alt_text: 'Provisional pack photograph of millet grains' }],
  }];
  const visual = product => `<img src="${product.images[0].url}" alt="${product.images[0].alt_text}">`;
  const html = renderShop(pictured, 'All products', { ...helpers, visual });
  assert.match(html, /assets\/products\/ragi-preview\.jpg/);
  assert.match(html, /alt="Provisional pack photograph of millet grains"/);
});
