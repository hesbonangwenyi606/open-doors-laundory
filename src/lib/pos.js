/**
 * POS cart helpers (pure functions — fully unit-testable, no network).
 * Money is integer KES throughout; quantities are integers 1–25.
 */
import { priceLine } from './catalog.js';

export const MAX_QTY = 25;
export const MIN_QTY = 1;

export function clampQty(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n)) return MIN_QTY;
  return Math.max(MIN_QTY, Math.min(MAX_QTY, n));
}

/** Add a catalog service to the cart (merges with existing line). */
export function addToCart(cart, catalogItem, qty = 1) {
  const q = clampQty(qty);
  const key = catalogItem.serviceName;
  const existing = cart.find((l) => l.key === key);
  if (existing) {
    return cart.map((l) =>
      l.key === key ? { ...l, ...priceLine(l.unitPrice, l.qty + q) } : l
    );
  }
  return [
    ...cart,
    {
      key,
      service: catalogItem.serviceName,
      unitPrice: Number(catalogItem.unitPrice),
      category: catalogItem.category || '',
      ...priceLine(catalogItem.unitPrice, q),
    },
  ];
}

/** Set a line's quantity (clamped). */
export function setLineQty(cart, key, qty) {
  const q = clampQty(qty);
  return cart.map((l) => (l.key === key ? { ...l, ...priceLine(l.unitPrice, q) } : l));
}

/** Remove a line from the cart. */
export function removeFromCart(cart, key) {
  return cart.filter((l) => l.key !== key);
}

/** Cart subtotal (= total; no discounts/taxes in this business). */
export function cartTotal(cart) {
  return cart.reduce((sum, l) => sum + (Number(l.subtotal) || 0), 0);
}

export function cartCount(cart) {
  return cart.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
}

/** Build the offline order record from cart + customer + payment. */
export function buildOfflineOrder({ cart, customerName, paymentMethod = 'Cash', notes = '' }) {
  const total = cartTotal(cart);
  return {
    customerName: (customerName || 'Walk-in').trim() || 'Walk-in',
    service: cart.map((l) => `${l.service} x${l.qty}`).join(', ') || 'Wash & Fold',
    totalAmount: total,
    quantity: cartCount(cart),
    status: 'pending',
    paymentStatus: paymentMethod === 'Cash' ? 'paid' : 'pending',
    paymentMethod,
    items: cart.map((l) => ({
      name: l.service,
      service: l.service,
      price: l.unitPrice,
      unitPrice: l.unitPrice,
      quantity: l.qty,
      kg: l.qty,
      subtotal: l.subtotal,
    })),
    notes,
    createdAt: new Date().toISOString(),
  };
}
