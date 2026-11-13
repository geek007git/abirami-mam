const categories = ['Millets', 'Natural Sweeteners', 'Rice & Grains', 'Pulses'];

export function renderProductCard(product, { money, escape, visual }) {
  const variant = product.variants?.[0];
  if (!variant) return '';
  const available = variant.stock_on_hand > 0;
  const discounted = variant.mrp_paise > variant.price_paise;
  return `<article class="market-card">
    <a class="market-card-image" href="#/product/${encodeURIComponent(product.id)}" aria-label="View ${escape(product.name)}">
      ${visual(product)}<span class="market-card-tag">${escape(product.category)}</span>
    </a>
    <div class="market-card-body">
      <p class="market-card-origin">VS ORGANICS PANTRY</p>
      <h3><a href="#/product/${encodeURIComponent(product.id)}">${escape(product.name)}</a></h3>
      <p class="market-card-size">${escape(variant.label)}${product.variants.length > 1 ? ` · ${product.variants.length} sizes` : ''}</p>
      <div class="market-card-bottom"><div class="market-card-price"><strong>${money(variant.price_paise)}</strong>${discounted ? `<del>${money(variant.mrp_paise)}</del>` : ''}</div>
      <button class="market-add" data-add="${escape(variant.id)}" aria-label="Add ${escape(product.name)} to bag" ${available ? '' : 'disabled'}>${available ? 'Add +' : 'Sold out'}</button></div>
    </div>
  </article>`;
}

const sectionTitle = (eyebrow, title, action = '') => `<div class="market-section-heading"><div><p class="market-kicker">${eyebrow}</p><h2>${title}</h2></div>${action ? `<a href="#/shop" class="market-text-link">${action} <span aria-hidden="true">↗</span></a>` : ''}</div>`;

export function renderHome(products, helpers) {
  const cards = products.slice(0, 4).map(product => renderProductCard(product, helpers)).join('');
  const sweeteners = products.filter(product => product.category === 'Natural Sweeteners').slice(0, 4);
  const secondCards = (sweeteners.length ? sweeteners : products.slice(4, 8)).map(product => renderProductCard(product, helpers)).join('');
  return `<div class="market-home">
    <section class="market-hero">
      <div class="market-hero-copy"><p class="market-kicker"><span class="market-kicker-line"></span> GOOD FOOD FOR EVERYDAY LIVING</p>
        <h1>Tradition in<br>every <em>basket.</em></h1>
        <p>Millets, natural sweeteners, grains and family staples, thoughtfully sourced for the meals that bring us together.</p>
        <div class="market-hero-actions"><a href="#/shop" class="market-cta">Shop the pantry <span aria-hidden="true">↗</span></a><a href="#/story" class="market-subtle-link">Get to know us</a></div>
        <div class="market-hero-caption"><span class="market-caption-mark">✳</span><span>Familiar ingredients.<br>Thoughtful everyday choices.</span></div>
      </div>
      <div class="market-hero-visual" aria-hidden="true"><div class="market-sun"></div><div class="market-ridge ridge-one"></div><div class="market-ridge ridge-two"></div><div class="market-hero-bowl"><div class="market-bowl-food"></div></div><div class="market-hero-bowl bowl-small"><div class="market-bowl-food food-gold"></div></div><div class="market-hero-bag"><span>VS</span><small>ORGANICS</small><i>good food,<br>every day</i></div><div class="market-hero-stamp">SOURCED<br>WITH CARE ✦</div></div>
    </section>
    <div class="market-benefits"><span>✳ &nbsp; Thoughtfully sourced</span><span>✳ &nbsp; Indian pantry essentials</span><span>✳ &nbsp; Pack sizes for every home</span><span>✳ &nbsp; Simple, secure shopping</span></div>
    <section class="market-section market-categories" id="categories">${sectionTitle('EXPLORE THE PANTRY', 'What’s on your list?', 'Shop everything')}<div class="market-category-grid">${categories.map((category, index) => `<a class="market-category market-category-${index + 1}" href="#/shop/${encodeURIComponent(category)}"><span class="market-category-top">0${index + 1} / PANTRY</span><span class="market-category-art" aria-hidden="true"><i></i><i></i><i></i></span><strong>${category}</strong><span class="market-category-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></section>
    <section class="market-section market-featured">${sectionTitle('THE EVERYDAY EDIT', 'Good things for your kitchen', 'View all products')}<div class="market-product-grid">${cards || '<p>Our first products are coming soon.</p>'}</div></section>
    <section class="market-story-banner"><div class="market-story-ornament" aria-hidden="true">VS<span>O</span></div><div><p class="market-kicker">THE VS ORGANICS WAY</p><h2>Simple food.<br><em>Meaningful choices.</em></h2><p>We’re building a pantry of traditional and everyday ingredients from suppliers we trust, with clear product information and a shopping experience made for busy homes.</p><a href="#/story" class="market-light-link">Our story <span aria-hidden="true">↗</span></a></div></section>
    <section class="market-section market-sweeteners">${sectionTitle('FROM THE PANTRY', 'A little natural sweetness', 'Explore the range')}<div class="market-product-grid">${secondCards || cards}</div></section>
    <section class="market-closing"><p class="market-kicker">MADE FOR EVERYDAY KITCHENS</p><h2>Fill your shelves with<br><em>food you feel good about.</em></h2><a href="#/shop" class="market-cta">Browse all groceries <span aria-hidden="true">↗</span></a></section>
  </div>`;
}

export function renderShop(products, selected, helpers) {
  const search = selected.startsWith('search:') ? selected.slice(7).trim() : '';
  const options = ['All products', ...new Set(products.map(product => product.category))];
  const filtered = search ? products.filter(product => `${product.name} ${product.category} ${product.description || ''}`.toLowerCase().includes(search.toLowerCase())) : selected === 'All products' ? products : products.filter(product => product.category === selected);
  return `<div class="market-shop"><div class="market-shop-intro"><p class="market-kicker">THE VS ORGANICS PANTRY</p><h1>${search ? 'Search the pantry.' : 'Everyday essentials,<br><em>chosen well.</em>'}</h1><p>${search ? `Results for “${helpers.escape(search)}”` : 'A growing collection of traditional ingredients and family groceries.'}</p><form id="marketShopSearch" class="market-shop-search" role="search"><label class="sr-only" for="marketShopSearchInput">Search products</label><input id="marketShopSearchInput" type="search" placeholder="Search products" value="${helpers.escape(search)}"><button aria-label="Search products">Search</button></form></div><div class="market-shop-bar"><div class="market-shop-filters">${options.map(category => `<a class="market-filter ${selected === category ? 'active' : ''}" href="#/shop/${encodeURIComponent(category)}">${helpers.escape(category)}</a>`).join('')}</div><span>${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}</span></div><div class="market-product-grid market-shop-grid">${filtered.length ? filtered.map(product => renderProductCard(product, helpers)).join('') : '<div class="market-no-results"><h2>Nothing on this shelf yet.</h2><p>Try another category or search term.</p><a href="#/shop" class="market-cta">See all products</a></div>'}</div></div>`;
}
