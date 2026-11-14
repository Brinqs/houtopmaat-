// Gedeelde logica (browser + server): ontwerp valideren, onderdelen op hele platen indelen
// en de prijs berekenen volgens het model van adzaagt.nl (je betaalt per hele plaat).
import { MATERIALS, PRICING_RULES } from './materials.js';

export const MATERIAL_BY_SLUG = Object.fromEntries(MATERIALS.map(m => [m.slug, m]));
const round2 = n => Math.round(n * 100) / 100;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));

export const thicknessesOf = mat => [...new Set(mat.plates.map(p => p.t))].sort((a, b) => a - b);
export const platesOf = (mat, t) => mat.plates.filter(p => p.t === t);

/** Past een onderdeel (lengte ≥ breedte) op deze plaat? Bij nerf alleen in de lengterichting. */
const fitsOn = (plate, l, w, grain) => (l <= plate.l && w <= plate.w) || (!grain && l <= plate.w && w <= plate.l);

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
    const ts = thicknessesOf(mat);
    if (!ts.includes(thickness)) {
      warnings.push(`${label}: ${mat.name} is er niet in ${thickness} mm (wel: ${ts.join(', ')} mm).`);
    } else if (!platesOf(mat, thickness).some(pl => fitsOn(pl, lengthMm, widthMm, mat.grain))) {
      const max = platesOf(mat, thickness).map(pl => `${pl.l}×${pl.w}`).join(', ');
      warnings.push(`${label}: ${lengthMm}×${widthMm} mm past op geen enkele plaat ${mat.name} ${thickness} mm (platen: ${max} mm).`);
    }
    parts.push({ id, name: String(p.name || `Onderdeel ${i + 1}`), mat: mat.slug, x, y, z, w, h, d, thickness, lengthMm, widthMm });
  });
  return { ok: errors.length === 0, errors, warnings, parts, name: input.name || 'Mijn ontwerp', summary: input.summary || '' };
}

/**
 * Deelt stukken in op platen (strokenmethode / guillotine, zoals een paneelzaag werkt).
 * pieces: [{ id, l, w }] met l ≥ w. Geeft { sheets: [{ items: [{ id, x, y, l, w }] }] } of null als iets niet past.
 */
export function nestPieces(pieces, plate, grain, kerf = PRICING_RULES.kerfMm) {
  const items = pieces.map(p => {
    // Met nerf: lengte van het onderdeel langs de plaatlengte. Zonder nerf: draaien als dat beter past.
    if (fitsOn({ l: plate.l, w: plate.w }, p.l, p.w, true)) return { ...p, rl: p.l, rw: p.w };
    if (!grain && p.l <= plate.w && p.w <= plate.l) return { ...p, rl: p.w, rw: p.l };
    return null;
  });
  if (items.some(i => !i)) return null;
  items.sort((a, b) => b.rw - a.rw || b.rl - a.rl);
  const sheets = [];
  for (const it of items) {
    let placed = false;
    for (const sh of sheets) {
      for (const strip of sh.strips) {
        if (it.rw <= strip.h && strip.used + it.rl <= plate.l) {
          sh.items.push({ id: it.id, x: strip.used, y: strip.y, l: it.rl, w: it.rw });
          strip.used += it.rl + kerf; placed = true; break;
        }
      }
      if (placed) break;
      if (sh.usedW + it.rw <= plate.w) {
        const strip = { y: sh.usedW, h: it.rw, used: it.rl + kerf };
        sh.strips.push(strip); sh.usedW += it.rw + kerf;
        sh.items.push({ id: it.id, x: 0, y: strip.y, l: it.rl, w: it.rw });
        placed = true; break;
      }
    }
    if (!placed) {
      const sh = { strips: [{ y: 0, h: it.rw, used: it.rl + kerf }], usedW: it.rw + kerf, items: [{ id: it.id, x: 0, y: 0, l: it.rl, w: it.rw }] };
      sheets.push(sh);
    }
  }
  return { sheets: sheets.map(s => ({ items: s.items })) };
}

/** Bouwt de zaaglijst: identieke onderdelen gegroepeerd + per materiaal/dikte de goedkoopste plaatindeling. */
export function buildSawlist(parts) {
  // 1. regels: identieke onderdelen
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
    return { ...g, materialName: mat.name, color: mat.color, areaM2: (g.lengthMm * g.widthMm * g.qty) / 1e6 };
  }).sort((a, b) => a.materialName.localeCompare(b.materialName) || b.thickness - a.thickness || b.lengthMm - a.lengthMm);

  // 2. platen per materiaal + dikte
  const bySheet = new Map();
  for (const p of parts) {
    const key = `${p.mat}|${p.thickness}`;
    if (!bySheet.has(key)) bySheet.set(key, []);
    bySheet.get(key).push(p);
  }
  const sheets = [...bySheet.entries()].map(([key, ps]) => {
    const mat = MATERIAL_BY_SLUG[ps[0].mat], t = ps[0].thickness;
    const pieces = ps.map(p => ({ id: p.id, l: p.lengthMm, w: p.widthMm }));
    const areaM2 = pieces.reduce((s, p) => s + p.l * p.w, 0) / 1e6;
    let best = null;
    for (const plate of platesOf(mat, t)) {
      const nest = nestPieces(pieces, plate, mat.grain);
      if (!nest) continue;
      const cost = round2(nest.sheets.length * plate.price);
      if (!best || cost < best.cost || (cost === best.cost && plate.l * plate.w < best.plate.l * best.plate.w)) best = { plate, nest, cost };
    }
    const base = { key, mat: mat.slug, name: mat.name, color: mat.color, thickness: t, levertijd: mat.levertijd, areaM2, parts: ps.length,
      lines: lines.filter(l => l.mat === mat.slug && l.thickness === t) };
    if (!best) return { ...base, error: platesOf(mat, t).length ? 'Niet alle onderdelen passen op een plaat' : `Niet leverbaar in ${t} mm`, count: 0, cost: 0, layouts: [] };
    const plateArea = (best.plate.l * best.plate.w * best.nest.sheets.length) / 1e6;
    return { ...base, plate: best.plate, count: best.nest.sheets.length, cost: best.cost, layouts: best.nest.sheets, utilization: Math.min(1, areaM2 / plateArea) };
  }).sort((a, b) => b.cost - a.cost);

  const subtotalRaw = round2(sheets.reduce((s, x) => s + x.cost, 0));
  const subtotal = subtotalRaw > 0 ? Math.max(subtotalRaw, PRICING_RULES.minimumOrder) : 0;
  const shipping = subtotal > 0 ? PRICING_RULES.shippingNL : 0;
  return {
    lines, sheets, subtotal, shipping, total: round2(subtotal + shipping),
    partCount: parts.length, plateCount: sheets.reduce((s, x) => s + x.count, 0),
    errors: sheets.filter(s => s.error).map(s => `${s.name} ${s.thickness} mm: ${s.error}`),
  };
}

/** IKEA-achtige lettercodes: identieke onderdelen (zelfde materiaal + maat) krijgen dezelfde letter. */
export function partLetters(parts) {
  const s = buildSawlist(parts);
  const letter = i => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
  const map = {};
  const lines = s.lines.map((l, i) => { l.ids.forEach(id => (map[id] = letter(i))); return { ...l, letter: letter(i) }; });
  return { map, lines };
}

/** Klein SVG-zaagplan van één plaat. */
export function plateSvg(plate, layout, color = '#c9a87a', highlight = new Set()) {
  const W = 220, s = W / plate.l, H = Math.round(plate.w * s);
  const rects = layout.items.map(it => `<rect data-id="${it.id}" x="${(it.x * s).toFixed(1)}" y="${(it.y * s).toFixed(1)}" width="${Math.max(1, it.l * s).toFixed(1)}" height="${Math.max(1, it.w * s).toFixed(1)}" fill="${highlight.has(it.id) ? '#6CAF5A' : color}" stroke="#1f2723" stroke-opacity=".35" stroke-width=".6"/>`).join('');
  return `<svg class="plate-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Zaagplan plaat ${plate.l} × ${plate.w} mm"><rect width="${W}" height="${H}" fill="#f1efe9" stroke="#c9c3b6"/>${rects}</svg>`;
}

export const euro = n => '€ ' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
