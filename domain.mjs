export function quoteCart(items, coupon, freeShippingThreshold, shippingFee) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discount = 0;
  if (coupon?.type === 'percent') discount = Math.min(Math.floor(subtotal * coupon.value / 100), coupon.max ?? Infinity);
  if (coupon?.type === 'fixed') discount = Math.min(subtotal, coupon.value);
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount === 0 || afterDiscount >= freeShippingThreshold ? 0 : shippingFee;
  return { subtotal, discount, shipping, total: afterDiscount + shipping };
}

export function availableStock(stockOnHand, reservations) {
  return Math.max(0, stockOnHand - reservations.filter(r => r.status === 'ACTIVE').reduce((sum, r) => sum + r.quantity, 0));
}

const transitions = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'], PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'], PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: []
};

export function canTransition(from, to, role) {
  if (!transitions[from]?.includes(to)) return false;
  if (to === 'CANCELLED') return role === 'OWNER';
  return role === 'OWNER' || role === 'FULFILLMENT_STAFF';
}
