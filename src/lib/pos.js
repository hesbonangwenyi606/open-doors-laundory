/**
 * POS cart helpers (pure functions — fully unit-testable, no network).
 * Money is integer KES throughout; quantities are integers 1–25.
 */
export const MAX_QTY = 25;
export const MIN_QTY = 1;

export function clampQty(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n)) return MIN_QTY;
  return Math.max(MIN_QTY, Math.min(MAX_QTY, n));
}

function clampDiscountPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

function priceCartLine(line, qty, discountAllowed = line.discountAllowed, discountPercent = line.discountPercent) {
  const quantity = clampQty(qty);
  const originalSubtotal = Number(line.unitPrice) * quantity;
  const allowed = Boolean(discountAllowed);
  const percent = allowed ? clampDiscountPercent(discountPercent) : 0;
  const discountAmount = Math.round(originalSubtotal * percent / 100);
  return {
    ...line,
    qty: quantity,
    originalSubtotal,
    discountAllowed: allowed,
    discountPercent: percent,
    discountAmount,
    subtotal: originalSubtotal - discountAmount,
  };
}

/** Add a catalog service to the cart (merges with existing line). */
export function addToCart(cart, catalogItem, qty = 1) {
  const q = clampQty(qty);
  const key = catalogItem.serviceName;
  const existing = cart.find((l) => l.key === key);
  if (existing) {
    return cart.map((l) =>
      l.key === key ? priceCartLine(l, l.qty + q) : l
    );
  }
  return [...cart, priceCartLine({
    key,
    service: catalogItem.serviceName,
    unitPrice: Number(catalogItem.unitPrice),
    category: catalogItem.category || '',
    discountAllowed: false,
    discountPercent: 0,
  }, q, false, 0)];
}

/** Set a line's quantity (clamped). */
export function setLineQty(cart, key, qty) {
  return cart.map((line) => (line.key === key ? priceCartLine(line, qty) : line));
}

/** Set whether a cart line may be discounted and its percentage. */
export function setLineDiscount(cart, key, discountAllowed, discountPercent = 0) {
  return cart.map((line) => (
    line.key === key
      ? priceCartLine(line, line.qty, discountAllowed, discountPercent)
      : line
  ));
}

/** Remove a line from the cart. */
export function removeFromCart(cart, key) {
  return cart.filter((l) => l.key !== key);
}

/** Sum each line's final price after any allowed discount. */
export function cartTotal(cart) {
  return cart.reduce((sum, l) => sum + (Number(l.subtotal) || 0), 0);
}

export function cartCount(cart) {
  return cart.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
}

/** Build the offline order record from cart + customer + payment. */
export function buildOfflineOrder({ cart, customerName, customerPhone = '', servedBy = '', paymentMethod = 'Cash', notes = '' }) {
  const total = cartTotal(cart);
  return {
    customerName: (customerName || 'Walk-in').trim() || 'Walk-in',
    customerPhone: customerPhone.trim(),
    servedBy: servedBy.trim(),
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
      originalSubtotal: l.originalSubtotal,
      discountAllowed: l.discountAllowed,
      discountPercent: l.discountPercent,
      discountAmount: l.discountAmount,
      subtotal: l.subtotal,
    })),
    notes,
    createdAt: new Date().toISOString(),
  };
}
