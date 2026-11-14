// Winkelwagen → afrekenen (test) → bedankt → 3D-bouwinstructies met AI-bouwassistent.
import * as THREE from 'three';
import { Viewer } from './viewer.js';
import { validateDesign, buildSawlist, partLetters, euro, MATERIAL_BY_SLUG } from './sawlist.js';
import { getCart, setCart, cartTotals, updateBadges, createOrder, getOrder, saveOrder } from './store.js';
import { PRICING_RULES } from './materials.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => t.classList.add('is-on'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => (t.hidden = true), 250); }, 3000);
}

// ===========================================================================
// Router
// ===========================================================================
function route() {
  const [view = 'winkelwagen', id, item] = location.hash.replace(/^#/, '').split('/');
  document.querySelectorAll('.view').forEach(v => (v.hidden = v.dataset.view !== view));
  document.body.classList.toggle('manual-open', view === 'instructies');
  window.scrollTo({ top: 0, behavior: 'instant' });
  const titles = { winkelwagen: 'Winkelwagen', afrekenen: 'Afrekenen', bedankt: 'Bedankt voor je bestelling', instructies: 'Bouwinstructies' };
  document.title = `${titles[view] || 'Winkelwagen'} | Adzaagt.nl`;
  if (view === 'winkelwagen') renderCart();
  else if (view === 'afrekenen') renderCheckout();
  else if (view === 'bedankt') renderThanks(id);
  else if (view === 'instructies') openManual(id, Number(item) || 0);
  else { location.hash = '#winkelwagen'; }
}

// ===========================================================================
// Winkelwagen
// ===========================================================================
function summaryHtml(t, { delivery = 'bezorgen', cta = '' } = {}) {
  const shipping = delivery === 'afhalen' ? 0 : t.shipping;
  const total = Math.round((t.subtotal - t.discount + shipping) * 100) / 100;
  return `
    <h3>Overzicht</h3>
    <div class="saw-totals">
      <div><span>Materiaal &amp; zagen (${t.partCount} onderdelen)</span><span>${euro(t.subtotal)}</span></div>
      ${t.discount ? `<div class="is-disc"><span>Staffelkorting</span><span>− ${euro(t.discount)}</span></div>` : ''}
      <div><span>${delivery === 'afhalen' ? 'Afhalen Heemskerk' : 'Verzending NL'}</span><span>${shipping ? euro(shipping) : 'Gratis'}</span></div>
      ${delivery !== 'afhalen' && t.toFreeShipping ? `<div class="saw-hint">Nog ${euro(t.toFreeShipping)} tot gratis verzending</div>` : ''}
      <div class="saw-total"><span>Totaal incl. btw</span><strong>${euro(total)}</strong></div>
    </div>
    ${cta}
    <ul class="summary__usps">
      <li>${ICON_CHECK}Tot op 1 mm nauwkeurig gezaagd</li>
      <li>${ICON_CHECK}Levering binnen 3-8 werkdagen</li>
      <li>${ICON_CHECK}Gratis stap-voor-stap 3D-bouwinstructies</li>
    </ul>`;
}

function renderCart() {
  const items = getCart();
  const box = $('#cartItems');
  if (!items.length) {
    box.innerHTML = `<div class="empty-cart"><svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>
      <h2>Je winkelwagen is nog leeg</h2><p>Ontwerp je meubel met de AI-ontwerper. Je zaaglijst staat dan direct klaar om te bestellen.</p>
      <a href="index.html#ontwerp" class="btn btn--primary">Start met ontwerpen</a></div>`;
    $('#cartSummary').hidden = true;
    return;
  }
  $('#cartSummary').hidden = false;
  box.innerHTML = items.map((it, i) => {
    const s = buildSawlist(validateDesign(it).parts);
    return `<article class="cart-item" data-i="${i}">
      <div class="cart-item__thumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : '<svg viewBox="0 0 24 24"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/></svg>'}</div>
      <div class="cart-item__info">
        <h3>${esc(it.name)}</h3>
        <p>${esc(it.summary)}</p>
        <p class="muted">${s.partCount} gezaagde onderdelen · ${s.lines.length} zaaglijstregels</p>
        <details class="cart-item__saw"><summary>Bekijk zaaglijst</summary>
          <table>${s.lines.map(l => `<tr><td>${l.qty}×</td><td>${esc(l.names.join(', '))}<small>${esc(l.materialName)}</small></td><td>${l.lengthMm}×${l.widthMm}×${l.thickness}</td><td>${euro(l.total)}</td></tr>`).join('')}</table>
        </details>
      </div>
      <div class="cart-item__side">
        <strong class="cart-item__price">${euro(s.subtotal * it.qty)}</strong>
        <div class="stepper" aria-label="Aantal sets">
          <button data-act="dec" aria-label="Minder">−</button><span>${it.qty}</span><button data-act="inc" aria-label="Meer">+</button>
        </div>
        <button class="link-btn" data-act="del">Verwijderen</button>
      </div>
    </article>`;
  }).join('') + `<a href="index.html#ontwerp" class="cart-more">+ Nog een meubel ontwerpen</a>`;
  box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.closest('.cart-item').dataset.i), cart = getCart();
    if (b.dataset.act === 'inc') cart[i].qty = Math.min(20, cart[i].qty + 1);
    if (b.dataset.act === 'dec') cart[i].qty = Math.max(1, cart[i].qty - 1);
    if (b.dataset.act === 'del') cart.splice(i, 1);
    setCart(cart); renderCart();
  }));
  $('#cartSummary').innerHTML = summaryHtml(cartTotals(items), { cta: '<a href="#afrekenen" class="btn btn--primary btn--lg btn--block">Verder naar afrekenen</a>' });
}

// ===========================================================================
// Afrekenen (test)
// ===========================================================================
function renderCheckout() {
  const items = getCart();
  if (!items.length) { location.hash = '#winkelwagen'; return; }
  const form = $('#checkoutForm');
  const update = () => {
    const delivery = form.delivery.value;
    $('#addressFields').hidden = delivery === 'afhalen';
    const t = cartTotals(items);
    $('#shipPrice').textContent = t.shipping ? euro(t.shipping) : 'Gratis';
    $('#checkoutSummary').innerHTML = `<div class="mini-items">${items.map(it => `<div class="mini-item">${it.thumb ? `<img src="${it.thumb}" alt="">` : ''}<span><strong>${esc(it.name)}</strong><small>${it.qty} set${it.qty > 1 ? 's' : ''}</small></span></div>`).join('')}</div>` + summaryHtml(t, { delivery });
  };
  form.onchange = update;
  update();
}

function initCheckout() {
  const form = $('#checkoutForm');
  $('#fillTest').addEventListener('click', () => {
    const v = { firstName: 'Test', lastName: 'Klant', email: 'test@voorbeeld.nl', phone: '', zip: '1967 DA', number: '1050', addition: '', street: 'De Trompet', city: 'Heemskerk' };
    Object.entries(v).forEach(([k, val]) => (form[k].value = val));
    form.terms.checked = true;
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#formError');
    const need = ['firstName', 'lastName', 'email'];
    if (form.delivery.value === 'bezorgen') need.push('zip', 'number', 'street', 'city');
    const missing = need.filter(k => !form[k].value.trim());
    form.querySelectorAll('input').forEach(i => i.classList.toggle('is-invalid', missing.includes(i.name)));
    if (missing.length) { err.textContent = 'Vul de gemarkeerde velden in.'; err.hidden = false; return; }
    if (!/^\S+@\S+\.\S+$/.test(form.email.value)) { err.textContent = 'Vul een geldig e-mailadres in.'; err.hidden = false; form.email.classList.add('is-invalid'); return; }
    if (!form.terms.checked) { err.textContent = 'Ga akkoord met de voorwaarden om te bestellen.'; err.hidden = false; return; }
    err.hidden = true;
    const btn = $('#placeOrder');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Testbetaling verwerken…';
    await new Promise(r => setTimeout(r, 1400));
    const f = k => form[k].value.trim();
    const order = createOrder({
      customer: { firstName: f('firstName'), lastName: f('lastName'), email: f('email'), phone: f('phone'), street: f('street'), number: f('number'), addition: f('addition'), zip: f('zip'), city: f('city') },
      delivery: form.delivery.value, payment: form.payment.value,
    });
    btn.disabled = false; btn.textContent = 'Plaats testbestelling';
    form.reset();
    location.hash = `#bedankt/${order.id}`;
  });
}

// ===========================================================================
// Bedankt
// ===========================================================================
function renderThanks(id) {
  const o = getOrder(id);
  if (!o) { $('#thanks').innerHTML = '<h1>Bestelling niet gevonden</h1><a href="index.html" class="btn btn--primary">Naar de homepage</a>'; return; }
  const c = o.customer;
  $('#thanks').innerHTML = `
    <div class="thanks__badge">${ICON_CHECK}</div>
    <span class="eyebrow">Bestelling ${esc(o.id)} · testbestelling</span>
    <h1>Gefeliciteerd, ${esc(c.firstName)}!</h1>
    <p class="thanks__lead">Je meubel is besteld. We zagen al je onderdelen tot op de millimeter op ons machinepark in Heemskerk. In de tussentijd kun je de bouwinstructies alvast bekijken.</p>

    <div class="thanks__items">
      ${o.items.map((it, i) => `<div class="thanks__item">
        <div class="thanks__thumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : ''}</div>
        <div><strong>${esc(it.name)}</strong><small>${it.parts.length} onderdelen${it.qty > 1 ? ` · ${it.qty} sets` : ''}</small></div>
        <a href="#instructies/${o.id}/${i}" class="btn btn--primary">Bekijk bouwinstructies →</a>
      </div>`).join('')}
    </div>

    <ol class="timeline">
      <li class="is-done"><span>${ICON_CHECK}</span><div><strong>Bestelling ontvangen</strong><small>Bevestiging naar ${esc(c.email)} (test, niet verstuurd)</small></div></li>
      <li><span>2</span><div><strong>Op maat zagen</strong><small>Tot op 1 mm nauwkeurig, elk onderdeel gelabeld met zijn letter</small></div></li>
      <li><span>3</span><div><strong>${o.delivery === 'afhalen' ? 'Klaar om af te halen' : 'Bezorging'}</strong><small>${o.delivery === 'afhalen' ? 'De Trompet 1050, Heemskerk · we mailen je' : `Binnen 3-8 werkdagen naar ${esc(c.street)} ${esc(c.number)}, ${esc(c.city)}`}</small></div></li>
      <li><span>4</span><div><strong>In elkaar zetten</strong><small>Met de 3D-instructies en de AI-bouwassistent</small></div></li>
    </ol>

    <div class="thanks__meta">
      <div><small>Totaal betaald (test)</small><strong>${euro(o.totals.total)}</strong></div>
      <div><small>Betaalmethode</small><strong>${esc(o.payment)}</strong></div>
      <div><small>Levering</small><strong>${o.delivery === 'afhalen' ? 'Afhalen' : 'Bezorgen'}</strong></div>
    </div>
    <p class="fineprint-sm">Dit was een testbestelling: er is niets afgeschreven en er wordt niets gezaagd.</p>`;
  confetti();
}

function confetti() {
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const colors = ['#6CAF5A', '#66452F', '#a6d98f', '#8b6a50', '#1f2723', '#cccccc'];
  const ps = Array.from({ length: 160 }, () => ({ x: W / 2 + (Math.random() - .5) * 200, y: H * .3, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: colors[Math.random() * colors.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
    if (t - t0 < 3500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

// ===========================================================================
// Bouwinstructies (3D)
// ===========================================================================
const M = { order: null, idx: 0, parts: [], byId: {}, letters: {}, lines: [], plan: null, step: -1, viewer: null, center: null, size: null, assist: { sessionId: null, busy: false } };

/** Fallback-bouwplan als de AI niet beschikbaar is: classificeert onderdelen op geometrie. */
function heuristicPlan(parts) {
  const maxY = Math.max(...parts.map(p => p.y + p.h)), minX = Math.min(...parts.map(p => p.x)), maxX = Math.max(...parts.map(p => p.x + p.w)), maxZ = Math.max(...parts.map(p => p.z + p.d));
  const thin = p => (p.w <= p.h && p.w <= p.d ? 'x' : p.h <= p.d ? 'y' : 'z');
  const g = { bottom: [], sides: [], dividers: [], shelves: [], top: [], back: [], plinth: [], fronts: [], other: [] };
  const horizontals = parts.filter(p => thin(p) === 'y').sort((a, b) => a.y - b.y);
  parts.forEach(p => {
    const t = thin(p);
    if (t === 'x') (p.x <= minX + 5 || p.x + p.w >= maxX - 5 ? g.sides : g.dividers).push(p);
    else if (t === 'y') (p === horizontals[0] ? g.bottom : p.y + p.h >= maxY - 5 ? g.top : g.shelves).push(p);
    else if (p.z <= 20 && p.d <= 10) g.back.push(p);
    else if (p.y < 150 && p.h <= 160 && p.z + p.d < maxZ - 5) g.plinth.push(p);
    else if (p.z + p.d >= maxZ - 30) g.fronts.push(p);
    else g.other.push(p);
  });
  const S = (title, list, text, tip = '') => list.length ? { title, parts: list.map(p => p.id), text, tip } : null;
  const steps = [
    S('Bodem en zijwanden', [...g.bottom, ...g.sides], 'Leg de bodem op een schone, vlakke ondergrond. Zet de zijwanden er rechtop tegenaan en schroef ze vast: boor eerst voor en gebruik per verbinding 3 schroeven 4×40 mm.', 'Werk met z’n tweeën, zo blijft alles haaks.'),
    S('Tussenschotten', g.dividers, 'Zet de tussenschotten op hun plek en schroef ze vanuit de bodem vast. Meet aan beide kanten na of ze evenwijdig staan.'),
    S('Legplanken', g.shelves, 'Plaats de legplanken op de juiste hoogte en schroef ze vanuit de zijwanden vast, of gebruik plankdragers als je ze verstelbaar wilt houden.'),
    S('Bovenkant', g.top, 'Leg de bovenkant op de zijwanden en schroef hem van bovenaf vast.'),
    S('Achterwand', g.back, 'Leg de kast voorover en controleer of hij haaks is (meet de diagonalen). Spijker of niet de achterwand rondom vast; zo blijft de kast stevig en haaks.', 'Gelijke diagonalen = haaks.'),
    S('Plint', g.plinth, 'Zet de kast rechtop en bevestig de plint aan de onderkant met lijm en een paar schroeven van binnenuit.'),
    S('Deuren en fronten', g.fronts, 'Monteer de scharnieren of greepjes en hang de deuren en fronten op. Stel ze af zodat de naden overal gelijk zijn.'),
    S('Overige onderdelen', g.other, 'Plaats de overige onderdelen zoals in de afbeelding.'),
  ].filter(Boolean);
  return { intro: 'Volg de stappen hieronder. Reken op ongeveer een uur, bij voorkeur met twee personen.', tools: ['Accuboormachine', 'Houtboortje 3 mm', 'Kruiskop-bit', 'Rolmaat', 'Waterpas'], hardware: [{ name: 'Spaanplaatschroeven 4×40 mm', qty: 30 }], steps, fallback: true };
}

function extractArray(json, key) {
  const k = json.indexOf(`"${key}"`); if (k < 0) return 0;
  const start = json.indexOf('[', k); if (start < 0) return 0;
  let depth = 0, inStr = false, esc2 = false, n = 0;
  for (let i = start + 1; i < json.length; i++) {
    const c = json[i];
    if (inStr) { if (esc2) esc2 = false; else if (c === '\\') esc2 = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) n++; } else if (c === ']' && depth === 0) break;
  }
  return n;
}

async function fetchPlan(design) {
  const res = await fetch('/api/instructions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design }) });
  if (!res.ok || !res.body) throw new Error('http');
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', json = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).split('\n').find(l => l.startsWith('data: ')); buf = buf.slice(i + 2);
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.t === 'tool_delta') { json += ev.d; const n = extractArray(json, 'steps'); $('#loadingInfo').textContent = n ? `Stap ${n} geschreven…` : 'Bouwvolgorde bepalen…'; }
      if (ev.t === 'retry') { json = ''; $('#loadingInfo').textContent = 'Nog even verbeteren…'; }
      if (ev.t === 'plan') return ev.plan;
      if (ev.t === 'error') throw new Error(ev.d);
    }
  }
  throw new Error('geen plan');
}

async function openManual(orderId, idx) {
  const o = getOrder(orderId);
  if (!o || !o.items[idx]) { location.hash = '#winkelwagen'; return; }
  const item = o.items[idx];
  Object.assign(M, { order: o, idx, step: -1, assist: { sessionId: null, busy: false } });
  const v = validateDesign(item);
  M.parts = v.parts; M.byId = Object.fromEntries(v.parts.map(p => [p.id, p]));
  const pl = partLetters(v.parts); M.letters = pl.map; M.lines = pl.lines;
  $('#manualTitle').textContent = `Bouwinstructies · ${item.name}`;
  $('#manualBack').href = `#bedankt/${o.id}`;
  $('#assistLog').innerHTML = ''; closeAssist();

  if (!M.viewer) M.viewer = new Viewer($('#manualViewer'), { dimOpacity: 0.5 });
  const vw = M.viewer;
  vw.setDims(false); vw.setExplode(false); vw.setLabels([]); vw.clear();
  vw.setDesign(M.parts, { fit: false });
  const box = vw.bounds(); vw.fit(box, false);
  M.center = box.getCenter(new THREE.Vector3()); M.size = box.getSize(new THREE.Vector3());
  vw.removeExcept(new Set());

  $('#manualLoading').hidden = false; $('#stepContent').innerHTML = ''; $('#stepDots').innerHTML = '';
  $('#manualSub').textContent = 'Instructies worden gemaakt…';
  let plan = o.plans?.[idx];
  if (!plan) {
    try { plan = await fetchPlan({ name: item.name, summary: item.summary, parts: item.parts }); }
    catch (e) {
      plan = heuristicPlan(M.parts);
      toast(e.message === 'credit' ? 'AI-tegoed op: standaardinstructies getoond.' : e.message === 'no_key' ? 'Demo-modus: standaardinstructies getoond.' : 'AI niet bereikbaar: standaardinstructies getoond.');
    }
    if (!plan.fallback) { o.plans = { ...(o.plans || {}), [idx]: plan }; saveOrder(o); }
  }
  if (M.order !== o) return; // inmiddels weggenavigeerd
  M.plan = plan;
  $('#manualLoading').hidden = true;
  $('#manualSub').textContent = `${plan.steps.length} stappen · ${M.parts.length} onderdelen`;
  $('#stepDots').innerHTML = [-1, ...plan.steps.map((_, i) => i), plan.steps.length].map(i => `<button data-i="${i}" aria-label="${i < 0 ? 'Onderdelen' : i >= plan.steps.length ? 'Klaar' : `Stap ${i + 1}`}"></button>`).join('');
  $('#stepDots').querySelectorAll('button').forEach(b => b.addEventListener('click', () => showStep(Number(b.dataset.i))));
  showStep(-1);
}

function slideOffset(p) {
  const c = M.center, D = Math.max(M.size.x, M.size.y, M.size.z) * 0.35 + 0.15;
  const cx = (p.x + p.w / 2) / 1000, cy = (p.y + p.h / 2) / 1000;
  const t = p.w <= p.h && p.w <= p.d ? 'x' : p.h <= p.d ? 'y' : 'z';
  if (t === 'x') {
    if (Math.abs(cx - c.x) < M.size.x * 0.3) return new THREE.Vector3(0, D, 0);
    return new THREE.Vector3(Math.sign(cx - c.x) * D, 0, 0);
  }
  if (t === 'y') return (p.y + p.h) / 1000 >= M.center.y + M.size.y / 2 - 0.01 ? new THREE.Vector3(0, D, 0) : new THREE.Vector3(0, 0, D * 1.2);
  return p.z < 20 ? new THREE.Vector3(0, 0, -D) : new THREE.Vector3(0, 0, D);
}

const letterify = text => md(text).replace(/(^|[\s(,])([A-Z]{1,2})(?=[\s),.:;]|$)/g, (m, pre, l) => (Object.values(M.letters).includes(l) ? `${pre}<span class="lt">${l}</span>` : m));

function letterChips(ids) {
  const count = {};
  ids.forEach(id => (count[M.letters[id]] = (count[M.letters[id]] || 0) + 1));
  return Object.entries(count).sort().map(([l, n]) => {
    const line = M.lines.find(x => x.letter === l);
    const names = [...new Set(ids.filter(id => M.letters[id] === l).map(id => M.byId[id].name))].join(', ');
    return `<div class="part-chip"><span class="lt lt--lg">${l}</span><div><strong>${n}× ${esc(names)}</strong><small>${line.lengthMm} × ${line.widthMm} × ${line.thickness} mm · ${esc(line.materialName)}</small></div></div>`;
  }).join('');
}

function showStep(i, replay = false) {
  const plan = M.plan, n = plan.steps.length, vw = M.viewer;
  i = Math.max(-1, Math.min(n, i));
  const prev = M.step; M.step = i;
  vw.controls.autoRotate = false;
  vw.setExplode(false);

  if (i === -1) {
    // onderdelenoverzicht: alles uit elkaar met letters
    M.parts.forEach(p => { if (!vw.parts.has(p.id)) vw.upsertPart(p, { slideFrom: new THREE.Vector3() }); });
    vw.highlight([]); vw.setExplode(true);
    vw.setLabels(M.parts.map(p => ({ id: p.id, text: M.letters[p.id] })));
  } else {
    const upto = i >= n ? n - 1 : i;
    const visible = new Set(plan.steps.slice(0, upto + 1).flatMap(s => s.parts));
    const fresh = i < n ? plan.steps[i].parts : [];
    vw.removeExcept(visible);
    let d = 0;
    M.parts.forEach(p => {
      if (!visible.has(p.id)) return;
      const isNew = fresh.includes(p.id);
      if (!vw.parts.has(p.id)) vw.upsertPart(p, { slideFrom: isNew ? slideOffset(p) : new THREE.Vector3(), delay: isNew ? 250 + (d++) * 280 : 0 });
      else if (isNew && (replay || prev !== i)) vw.slideIn(p.id, slideOffset(p), 250 + (d++) * 280);
    });
    vw.highlight(fresh);
    vw.setLabels(fresh.map(id => ({ id, text: M.letters[id] })));
    if (i >= n) { vw.controls.autoRotate = true; vw.highlight([]); }
  }

  // tekstpaneel
  const c = $('#stepContent');
  if (i === -1) {
    c.innerHTML = `<span class="eyebrow">Voor je begint</span><h2>Onderdelen &amp; benodigdheden</h2>
      <p>${md(plan.intro)}</p>
      <h4>Gereedschap</h4><div class="tool-chips">${plan.tools.map(t => `<span>${esc(t)}</span>`).join('') || '<span>Accuboormachine</span>'}</div>
      ${plan.hardware.length ? `<h4>Beslag <small>(niet meegeleverd)</small></h4><ul class="hardware">${plan.hardware.map(h => `<li><strong>${h.qty}×</strong> ${esc(h.name)}</li>`).join('')}</ul>` : ''}
      <h4>Onderdelen in je pakket</h4><div class="part-chips">${letterChips(M.parts.map(p => p.id))}</div>`;
  } else if (i >= n) {
    c.innerHTML = `<span class="eyebrow">Klaar!</span><h2>Je ${esc(M.order.items[M.idx].name)} staat</h2>
      <p>Mooi gedaan! Controleer nog even of alles stevig vastzit en of hoge kasten aan de muur geborgd zijn. Wil je het hout afwerken? Schuur licht op met korrel 180 en lak of olie naar keuze.</p>
      <div class="manual__done"><a href="index.html#ontwerp" class="btn btn--outline">Nog een meubel ontwerpen</a><button class="btn btn--primary" id="doneAsk">Vraag een afwerktip</button></div>`;
    $('#doneAsk').addEventListener('click', () => { openAssist(); sendAssist('Hoe kan ik dit meubel het beste afwerken?'); });
  } else {
    const s = plan.steps[i];
    c.innerHTML = `<span class="eyebrow">Stap ${i + 1} van ${n}</span><h2>${esc(s.title)}</h2>
      <p class="step-text">${letterify(s.text)}</p>
      ${s.tip ? `<div class="tip"><strong>Tip</strong>${letterify(s.tip)}</div>` : ''}
      <h4>In deze stap</h4><div class="part-chips">${letterChips(s.parts)}</div>`;
  }
  $('#stepNum').innerHTML = i === -1 ? '<span>Onderdelen</span>' : i >= n ? '<span>Klaar</span>' : `<strong>${i + 1}</strong><span>/ ${n}</span>`;
  $('#prevStep').disabled = i === -1;
  $('#nextStep').textContent = i === -1 ? 'Start met bouwen →' : i === n - 1 ? 'Afronden →' : i >= n ? 'Opnieuw bekijken' : 'Volgende →';
  document.querySelectorAll('#stepDots button').forEach(b => b.classList.toggle('is-active', Number(b.dataset.i) === i));
  $('#assistStep').textContent = i === -1 ? 'Bij het onderdelenoverzicht' : i >= n ? 'Meubel is klaar' : `Bij stap ${i + 1}: ${plan.steps[i].title}`;
  renderQuick();
}

// ---------- bouwassistent ----------
function openAssist() { $('#assist').hidden = false; $('#manual').classList.add('has-assist'); setTimeout(() => $('#assistInput').focus(), 50); if (!$('#assistLog').children.length) greet(); }
function closeAssist() { $('#assist').hidden = true; $('#manual').classList.remove('has-assist'); }
function greet() { addAssistMsg('ai', `Hoi! Ik ben je bouwassistent voor de **${M.order.items[M.idx].name}**. Ik weet bij welke stap je bent. Vraag gerust iets over schroeven, volgorde of afwerking.`); }

function renderQuick() {
  const i = M.step, n = M.plan?.steps.length || 0;
  const q = i === -1 ? ['Welk beslag moet ik kopen?', 'Hoe lang duurt het bouwen?', 'Kan ik dit alleen?']
    : i >= n ? ['Hoe werk ik het hout af?', 'Moet ik de kast aan de muur vastzetten?']
      : ['Hoe doe ik deze stap precies?', 'Welke schroeven gebruik ik hier?', 'Hoe houd ik het haaks?'];
  $('#assistQuick').innerHTML = q.map(t => `<button class="chip chip--suggest" type="button">${esc(t)}</button>`).join('');
  $('#assistQuick').querySelectorAll('button').forEach(b => b.addEventListener('click', () => sendAssist(b.textContent)));
}

function addAssistMsg(role, text) {
  const d = document.createElement('div');
  d.className = `msg msg--${role === 'user' ? 'user' : 'ai'}`;
  d.innerHTML = role === 'user' ? `<div class="bubble">${esc(text)}</div>` : `<img class="msg__avatar" src="img/favicon.svg" alt=""><div class="msg__body"><div class="bubble">${md(text)}</div></div>`;
  $('#assistLog').appendChild(d); $('#assistLog').scrollTop = 1e9;
  return d.querySelector('.bubble');
}

async function sendAssist(text) {
  text = text.trim();
  if (!text || M.assist.busy) return;
  M.assist.busy = true; $('#assistSend').disabled = true;
  addAssistMsg('user', text);
  const bubble = addAssistMsg('ai', ''); bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  const i = M.step, n = M.plan.steps.length;
  const where = i === -1 ? 'het onderdelenoverzicht (nog niet begonnen)' : i >= n ? 'het einde (meubel staat)' : `stap ${i + 1}: "${M.plan.steps[i].title}"`;
  const body = { sessionId: M.assist.sessionId, mode: 'assembly', message: `(Ik ben bij ${where}.)\n\n${text}` };
  if (!M.assist.sessionId) { const it = M.order.items[M.idx]; body.context = { design: { name: it.name, summary: it.summary, parts: it.parts }, plan: M.plan }; }
  let raw = '';
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) throw new Error();
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k).split('\n').find(l => l.startsWith('data: ')); buf = buf.slice(k + 2);
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.t === 'session') M.assist.sessionId = ev.id;
        if (ev.t === 'text') { raw += ev.d; bubble.innerHTML = letterify(raw); $('#assistLog').scrollTop = 1e9; }
        if (ev.t === 'error') { bubble.classList.add('bubble--error'); bubble.textContent = ev.d; }
      }
    }
    if (!raw && !bubble.classList.contains('bubble--error')) bubble.textContent = 'Sorry, ik kreeg geen antwoord. Probeer het nog eens.';
  } catch {
    bubble.classList.add('bubble--error'); bubble.textContent = 'De bouwassistent is niet bereikbaar. Draait de server?';
  } finally { M.assist.busy = false; $('#assistSend').disabled = false; }
}

function initManual() {
  $('#prevStep').addEventListener('click', () => showStep(M.step - 1));
  $('#nextStep').addEventListener('click', () => showStep(M.step >= M.plan.steps.length ? -1 : M.step + 1));
  $('#mReplay').addEventListener('click', () => showStep(M.step, true));
  $('#mFit').addEventListener('click', () => M.viewer?.fit());
  $('#askToggle').addEventListener('click', () => ($('#assist').hidden ? openAssist() : closeAssist()));
  $('#assistClose').addEventListener('click', closeAssist);
  const ai = $('#assistInput');
  ai.addEventListener('input', () => { ai.style.height = 'auto'; ai.style.height = Math.min(ai.scrollHeight, 140) + 'px'; });
  ai.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#assistForm').requestSubmit(); } });
  $('#assistForm').addEventListener('submit', e => { e.preventDefault(); const v = ai.value; ai.value = ''; sendAssist(v); });
  addEventListener('keydown', e => {
    if ($('[data-view="instructies"]').hidden || !M.plan || e.target.closest('textarea,input')) return;
    if (e.key === 'ArrowRight') showStep(M.step + 1);
    if (e.key === 'ArrowLeft') showStep(M.step - 1);
  });
}

// ===========================================================================
const setHeaderH = () => document.documentElement.style.setProperty('--header-h', document.getElementById('header').offsetHeight + 'px');
setHeaderH(); addEventListener('resize', setHeaderH);
initCheckout();
initManual();
updateBadges();
addEventListener('hashchange', route);
route();
void PRICING_RULES; void MATERIAL_BY_SLUG;
