// Winkelwagen en (test)bestellingen in localStorage — gedeeld door alle pagina's.
import { buildSawlist } from './sawlist.js';

const CART = 'hom_cart_v1', ORDERS = 'hom_orders_v1';
const read = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const getCart = () => read(CART);
export const setCart = items => { write(CART, items); updateBadges(); };

export function addToCart(design, thumb) {
  const cart = getCart();
  cart.push({ id: 'c' + Date.now().toString(36), name: design.name, summary: design.summary || '', parts: design.parts, thumb: thumb || null, qty: 1, addedAt: new Date().toISOString() });
  if (!write(CART, cart)) { // te groot (thumbnail)? probeer zonder
    cart.at(-1).thumb = null; write(CART, cart);
  }
  updateBadges();
  return cart.length;
}

/** Totale zaaglijst over alle items (aantal sets meegerekend), zodat staffel en verzending kloppen. */
export function cartTotals(items = getCart()) {
  const all = [];
  items.forEach((it, i) => { for (let q = 0; q < it.qty; q++) it.parts.forEach(p => all.push({ ...p, id: `${i}_${q}_${p.id}` })); });
  return buildSawlist(all);
}

export const cartCount = () => getCart().reduce((n, it) => n + it.qty, 0);

export function updateBadges() {
  const n = cartCount();
  document.querySelectorAll('.badge').forEach(b => { b.textContent = n; b.classList.toggle('is-empty', n === 0); });
}

export const getOrders = () => read(ORDERS);
export const getOrder = id => getOrders().find(o => o.id === id);
export function saveOrder(order) {
  const list = getOrders().filter(o => o.id !== order.id);
  list.unshift(order);
  // thumbnails niet dubbel opslaan als het krap wordt
  if (!write(ORDERS, list)) { order.items.forEach(i => (i.thumb = null)); write(ORDERS, list); }
}
export function createOrder({ customer, delivery, payment }) {
  const items = getCart();
  const totals = cartTotals(items);
  const shipping = delivery === 'afhalen' ? 0 : totals.shipping;
  const order = {
    id: 'ADZ-T' + Math.floor(100000 + Math.random() * 900000),
    createdAt: new Date().toISOString(), test: true,
    customer, delivery, payment,
    items: items.map(({ name, summary, parts, thumb, qty }) => ({ name, summary, parts, thumb, qty })),
    totals: { subtotal: totals.subtotal, discount: totals.discount, shipping, total: Math.round((totals.subtotal - totals.discount + shipping) * 100) / 100, partCount: totals.partCount },
    plans: {},
  };
  saveOrder(order);
  setCart([]);
  return order;
}
