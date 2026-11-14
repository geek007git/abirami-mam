const pantryCategories = ['Millets', 'Natural Sweeteners', 'Rice & Grains', 'Pulses'];

export function renderProductCard(product, { money, escape, visual }) {
  const variant = product.variants?.[0];
  if (!variant) return '';
  const available = variant.stock_on_hand > 0;
  const hasPhoto = Boolean(product.images?.[0]?.url);
  return `<article class="market-card">
    <a class="market-card-image" href="#/product/${encodeURIComponent(product.id)}" aria-label="View ${escape(product.name)}">
      ${hasPhoto ? visual(product) : `<span class="market-card-placeholder"><small>VS ORGANICS</small><strong>${escape(product.name)}</strong></span>`}
    </a>
    <div class="market-card-body">
      <p class="market-card-category">${escape(product.category || 'Groceries')}</p>
      <h3><a href="#/product/${encodeURIComponent(product.id)}">${escape(product.name)}</a></h3>
      <p class="market-card-size">${escape(variant.label)}</p>
      <div class="market-card-bottom"><div class="market-card-price"><strong>${money(variant.price_paise)}</strong>${variant.mrp_paise > variant.price_paise ? `<del>${money(variant.mrp_paise)}</del>` : ''}</div>
      <button class="market-add" data-add="${escape(variant.id)}" aria-label="Add ${escape(product.name)} to bag" ${available ? '' : 'disabled'}>${available ? 'Add to bag' : 'Sold out'}</button></div>
    </div>
  </article>`;
}

export function renderHome(products, helpers) {
  const featured = products.slice(0, 4).map(product => renderProductCard(product, helpers)).join('');
  return `<div class="market-home">
    <section class="market-hero">
      <div class="market-hero-copy">
        <p class="market-eyebrow">VS ORGANICS / EVERYDAY GROCERIES</p>
        <h1>Good food starts<br>with the <em>everyday.</em></h1>
        <p>Familiar grains, millets and pantry staples for the meals you make at home.</p>
        <div class="market-hero-actions"><a href="#/shop" class="market-cta">Explore the pantry <span aria-hidden="true">→</span></a><a href="#/story" class="market-text-link">Our story</a></div>
      </div>
      <figure class="market-hero-photo"><img src="assets/hero-pantry.webp" alt="A bowl of millet and a piece of jaggery on a kitchen table" fetchpriority="high"><figcaption>Familiar ingredients, made part of the everyday.</figcaption></figure>
    </section>
    <div class="market-note"><span>GOOD FOOD, EVERY DAY</span><p>Simple ingredients. Useful pack sizes. A pantry that feels like home.</p></div>
    <section class="market-section market-categories"><div class="market-section-heading"><p class="market-eyebrow">THE PANTRY</p><h2>Find what you need.</h2><p>Browse the staples at the heart of everyday cooking.</p></div><div class="market-category-list">${pantryCategories.map((category, index) => `<a href="#/shop/${encodeURIComponent(category)}"><span>0${index + 1}</span><strong>${category}</strong><span aria-hidden="true">↗</span></a>`).join('')}</div></section>
    <section class="market-section market-featured"><div class="market-section-heading"><p class="market-eyebrow">SHOP</p><h2>From our shelves.</h2><a class="market-text-link" href="#/shop">Browse everything <span aria-hidden="true">→</span></a></div>${featured ? `<div class="market-product-grid">${featured}</div>` : '<div class="market-empty"><h3>We’re stocking the shelves.</h3><p>Our first products will appear here when the catalogue is ready.</p></div>'}</section>
    <section class="market-story"><div><p class="market-eyebrow">A NOTE FROM VS ORGANICS</p><h2>Food for real kitchens.</h2></div><div><p>We’re putting together a practical range of familiar ingredients for homes that cook every day. Clear details and straightforward shopping matter to us.</p><a href="#/story" class="market-text-link">Read our story <span aria-hidden="true">→</span></a></div></section>
  </div>`;
}

export function renderShop(products, selected, helpers) {
  const search = selected.startsWith('search:') ? selected.slice(7).trim() : '';
  const options = ['All products', ...new Set(products.map(product => product.category))];
  const filtered = search ? products.filter(product => `${product.name} ${product.category} ${product.description || ''}`.toLowerCase().includes(search.toLowerCase())) : selected === 'All products' ? products : products.filter(product => product.category === selected);
  return `<div class="market-shop"><header class="market-shop-intro"><p class="market-eyebrow">VS ORGANICS / SHOP</p><h1>${search ? 'Search results.' : 'The everyday pantry.'}</h1><p>${search ? `Showing matches for “${helpers.escape(search)}”` : 'Groceries for the meals you make every day.'}</p><form id="marketShopSearch" class="market-shop-search" role="search"><label class="sr-only" for="marketShopSearchInput">Search products</label><input id="marketShopSearchInput" type="search" placeholder="Search products" value="${helpers.escape(search)}"><button>Search</button></form></header><div class="market-shop-bar"><div class="market-shop-filters">${options.map(category => `<a class="market-filter ${selected === category ? 'active' : ''}" href="#/shop/${encodeURIComponent(category)}">${helpers.escape(category)}</a>`).join('')}</div><span>${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}</span></div><div class="market-product-grid market-shop-grid">${filtered.length ? filtered.map(product => renderProductCard(product, helpers)).join('') : '<div class="market-empty"><h2>Nothing here yet.</h2><p>Try another category or check back when our catalogue is ready.</p><a href="#/shop" class="market-text-link">See all products →</a></div>'}</div></div>`;
}
