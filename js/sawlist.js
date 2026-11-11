// Gedeelde logica (browser + server): ontwerp valideren en zaaglijst + prijs berekenen
// volgens de prijsregels van houtopmaatgezaagd.nl.
import { MATERIALS, PRICING_RULES } from './materials.js';

export const MATERIAL_BY_SLUG = Object.fromEntries(MATERIALS.map(m => [m.slug, m]));
const round2 = n => Math.round(n * 100) / 100;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));

/**
 * Valideert een `update_design` tool-input.
 * Onderdelen zijn assen-uitgelijnde blokken in mm: x = breedte (links→rechts),
 * y = hoogte (vloer→boven), z = diepte (achter→voor). x/y/z = hoek met laagste waarden.
 */
export function validateDesign(input) {
  const errors = [], warnings = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Geen ontwerp ontvangen.'], warnings, parts: [] };
  if (!Array.isArray(input.parts) || input.parts.length === 0) errors.push('`parts` moet een niet-lege lijst zijn.');
  const parts = [];
  const seen = new Set();
  (input.parts || []).forEach((p, i) => {
    const label = p?.name || `onderdeel ${i + 1}`;
    const vals = ['x', 'y', 'z', 'w', 'h', 'd'].map(k => num(p?.[k]));
    if (vals.some(v => !Number.isFinite(v))) { errors.push(`${label}: x, y, z, w, h en d moeten getallen zijn.`); return; }
    const [x, y, z, w, h, d] = vals;
    if (w <= 0 || h <= 0 || d <= 0) { errors.push(`${label}: afmetingen moeten groter dan 0 zijn.`); return; }
    const mat = MATERIAL_BY_SLUG[p.mat];
    if (!mat) { errors.push(`${label}: onbekend materiaal "${p.mat}".`); return; }
    let id = String(p.id || `p${i + 1}`);
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const dims = [w, h, d].sort((a, b) => a - b);
    const thickness = Math.round(dims[0]);
    const lengthMm = Math.round(dims[2]), widthMm = Math.round(dims[1]);
    const thicknesses = Object.keys(mat.prices).map(Number);
    if (!thicknesses.includes(thickness)) {
      warnings.push(`${label}: ${mat.name} is er niet in ${thickness} mm (wel: ${thicknesses.join(', ')} mm).`);
    }
    if (lengthMm > mat.maxLengthCm * 10 || widthMm > mat.maxWidthCm * 10) {
      warnings.push(`${label}: ${lengthMm}×${widthMm} mm past niet uit één plaat ${mat.name} (max ${mat.maxLengthCm * 10}×${mat.maxWidthCm * 10} mm).`);
    }
    parts.push({ id, name: String(p.name || `Onderdeel ${i + 1}`), mat: mat.slug, x, y, z, w, h, d, thickness, lengthMm, widthMm });
  });
  return { ok: errors.length === 0, errors, warnings, parts, name: input.name || 'Mijn ontwerp', summary: input.summary || '' };
}

function priceForThickness(mat, t) {
  if (mat.prices[t] != null) return { price: mat.prices[t], thickness: t, exact: true };
  // dichtstbijzijnde beschikbare dikte (ter indicatie)
  const best = Object.keys(mat.prices).map(Number).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
  return { price: mat.prices[best], thickness: best, exact: false };
}

/** Prijs van één zaaglijstregel, conform de regels van de configurator. */
export function linePrice(mat, lengthMm, widthMm, qty, pricePerM2) {
  const R = PRICING_RULES;
  const L = lengthMm / 10, W = widthMm / 10;
  const chargedL = L > R.chargeFullLengthFromCm ? mat.maxLengthCm : L;
  const chargedW = W > R.chargeFullWidthFromCm ? mat.maxWidthCm : W;
  const material = round2(pricePerM2 * qty * (chargedL * chargedW) / 1e4);
  const minimum = round2(R.minimumPricePerPiece * qty);
  const notes = [];
  if (chargedL !== L) notes.push(`volle plaatlengte (${chargedL} cm) gerekend`);
  if (chargedW !== W) notes.push(`volle plaatbreedte (${chargedW} cm) gerekend`);
  if (material > 0 && material < minimum) notes.push(`minimum € ${R.minimumPricePerPiece.toFixed(2).replace('.', ',')} per stuk`);
  return { total: material > 0 && material < minimum ? minimum : material, notes };
}

/** Bouwt de gegroepeerde zaaglijst + totalen uit gevalideerde onderdelen. */
export function buildSawlist(parts) {
  const groups = new Map();
  for (const p of parts) {
    const key = `${p.mat}|${p.thickness}|${p.lengthMm}|${p.widthMm}`;
    if (!groups.has(key)) groups.set(key, { key, mat: p.mat, thickness: p.thickness, lengthMm: p.lengthMm, widthMm: p.widthMm, qty: 0, names: [], ids: [] });
    const g = groups.get(key);
    g.qty++; g.ids.push(p.id);
    if (!g.names.includes(p.name)) g.names.push(p.name);
  }
  const lines = [...groups.values()].map(g => {
    const mat = MATERIAL_BY_SLUG[g.mat];
    const pr = priceForThickness(mat, g.thickness);
    const lp = linePrice(mat, g.lengthMm, g.widthMm, g.qty, pr.price);
    if (!pr.exact) lp.notes.push(`prijs van ${pr.thickness} mm (dikte niet leverbaar)`);
    return { ...g, materialName: mat.name, color: mat.color, pricePerM2: pr.price, areaM2: (g.lengthMm * g.widthMm * g.qty) / 1e6, total: lp.total, notes: lp.notes, available: pr.exact };
  }).sort((a, b) => a.materialName.localeCompare(b.materialName) || b.thickness - a.thickness || b.lengthMm - a.lengthMm);

  // Staffelkorting per materiaal op basis van totaal m²
  const perMaterial = {};
  for (const l of lines) {
    const m = (perMaterial[l.mat] ||= { mat: l.mat, name: l.materialName, color: l.color, areaM2: 0, subtotal: 0, discountPct: 0, discount: 0, parts: 0 });
    m.areaM2 += l.areaM2; m.subtotal += l.total; m.parts += l.qty;
  }
  for (const m of Object.values(perMaterial)) {
    const tiers = MATERIAL_BY_SLUG[m.mat].staffel || [];
    for (const t of tiers) if (m.areaM2 >= t.minM2) m.discountPct = Math.max(m.discountPct, t.korting);
    m.discount = round2(m.subtotal * m.discountPct / 100);
    m.subtotal = round2(m.subtotal);
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const discount = round2(Object.values(perMaterial).reduce((s, m) => s + m.discount, 0));
  const afterDiscount = round2(subtotal - discount);
  const shipping = afterDiscount > 0 && afterDiscount < PRICING_RULES.freeShippingFromNL ? PRICING_RULES.shippingCostNL : 0;
  return {
    lines, materials: Object.values(perMaterial), subtotal, discount, shipping,
    total: round2(afterDiscount + shipping),
    partCount: parts.length,
    toFreeShipping: shipping ? round2(PRICING_RULES.freeShippingFromNL - afterDiscount) : 0,
  };
}

export const euro = n => '€ ' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** IKEA-achtige lettercodes: identieke onderdelen (zelfde materiaal + maat) krijgen dezelfde letter. */
export function partLetters(parts) {
  const s = buildSawlist(parts);
  const letter = i => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
  const map = {};
  const lines = s.lines.map((l, i) => { l.ids.forEach(id => (map[id] = letter(i))); return { ...l, letter: letter(i) }; });
  return { map, lines };
}
