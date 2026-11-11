// AI-meubelontwerper: hero-promptbar, studio (chat + 3D + zaaglijst), opslaan en bestellen.
import { Viewer } from './viewer.js';
import { validateDesign, buildSawlist, euro, MATERIAL_BY_SLUG } from './sawlist.js';
import { addToCart as storeAdd, updateBadges } from './store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE_KEY = 'hom_designs_v1';

// ---------------------------------------------------------------------------
// Demo-ontwerp voor de hero (boekenkast, licht eiken + witte deurtjes)
// ---------------------------------------------------------------------------
const E = 'meubelpaneel-licht-eiken', W = 'mdf-wit-gegrond', HB = 'hardboard';
const DEMO = [
  { id: 'back', name: 'Achterwand', mat: HB, x: 0, y: 0, z: 0, w: 800, h: 1800, d: 3 },
  { id: 'side_l', name: 'Zijwand links', mat: E, x: 0, y: 0, z: 3, w: 18, h: 1800, d: 327 },
  { id: 'side_r', name: 'Zijwand rechts', mat: E, x: 782, y: 0, z: 3, w: 18, h: 1800, d: 327 },
  { id: 'plinth', name: 'Plint', mat: E, x: 18, y: 0, z: 290, w: 764, h: 60, d: 18 },
  { id: 'bottom', name: 'Bodem', mat: E, x: 18, y: 60, z: 3, w: 764, h: 18, d: 327 },
  { id: 'shelf_1', name: 'Legplank', mat: E, x: 18, y: 430, z: 3, w: 764, h: 18, d: 310 },
  { id: 'shelf_2', name: 'Legplank', mat: E, x: 18, y: 790, z: 3, w: 764, h: 18, d: 310 },
  { id: 'shelf_3', name: 'Legplank', mat: E, x: 18, y: 1140, z: 3, w: 764, h: 18, d: 310 },
  { id: 'shelf_4', name: 'Legplank', mat: E, x: 18, y: 1470, z: 3, w: 764, h: 18, d: 310 },
  { id: 'top', name: 'Top', mat: E, x: 18, y: 1782, z: 3, w: 764, h: 18, d: 327 },
  { id: 'door_l', name: 'Deur links', mat: W, x: 2, y: 80, z: 330, w: 396, h: 346, d: 18 },
  { id: 'door_r', name: 'Deur rechts', mat: W, x: 402, y: 80, z: 330, w: 396, h: 346, d: 18 },
];

function initHeroDemo() {
  const el = $('#demoViewer');
  if (!el) return;
  const v = new Viewer(el, { interactive: false, autoRotate: true });
  v.setDims(false);
  const parts = validateDesign({ parts: DEMO }).parts;
  $('#demoPrice').textContent = euro(buildSawlist(parts).total);
  $('#demoCount').textContent = `${parts.length} onderdelen`;
  const build = () => {
    v.clear();
    parts.forEach((p, i) => setTimeout(() => v.upsertPart(p), 250 + i * 260));
    setTimeout(() => v.fit(v.bounds(), false), 0);
  };
  v.fit(validateBox(parts), false);
  build();
  setInterval(() => { if (!document.hidden && !$('#hero').hidden) build(); }, 11000);
}
function validateBox(parts) { // camera direct goed zetten voor de demo
  const tmp = { isEmpty: () => false };
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const p of parts) { [[p.x, p.y, p.z], [p.x + p.w, p.y + p.h, p.z + p.d]].forEach(pt => pt.forEach((v, i) => { min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v); })); }
  return Object.assign(tmp, {
    getSize: v => v.set((max[0] - min[0]) / 1000, (max[1] - min[1]) / 1000, (max[2] - min[2]) / 1000),
    getCenter: v => v.set((max[0] + min[0]) / 2000, (max[1] + min[1]) / 2000, (max[2] + min[2]) / 2000),
  });
}

// ---------------------------------------------------------------------------
// Typemachine-placeholder voor de promptbar
// ---------------------------------------------------------------------------
const IDEAS = ['een boekenkast van 2 meter hoog voor de woonkamer', 'een zwevend tv-meubel van 180 cm in eiken', 'een bureau voor mijn thuiswerkplek', 'een schoenenkast voor in de smalle gang', 'wandplanken in de nis naast de schoorsteen', 'een speelgoedkast met open vakken voor de kinderkamer'];
function typewriter(input) {
  let i = 0, j = 0, del = false;
  const step = () => {
    if (document.activeElement === input || input.value) { input.placeholder = 'Bijv. ' + IDEAS[0]; return setTimeout(step, 1200); }
    const s = IDEAS[i];
    j += del ? -1 : 1;
    input.placeholder = 'Bijv. ' + s.slice(0, j);
    if (!del && j >= s.length) { del = true; return setTimeout(step, 1800); }
    if (del && j <= 0) { del = false; i = (i + 1) % IDEAS.length; }
    setTimeout(step, del ? 18 : 38);
  };
  step();
}

function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------
const state = {
  sessionId: null,
  design: null,        // { name, summary, parts }
  sawlist: null,
  busy: false,
  transcript: [],      // { role, text } voor opslaan/herladen
  savedId: null,
  restoredDesign: null // meesturen bij eerste bericht na herladen
};
let viewer;

function openStudio(firstPrompt) {
  $('#hero').hidden = true;
  $('#studio').hidden = false;
  document.body.classList.add('studio-open');
  if (!viewer) {
    viewer = new Viewer($('#studioViewer'));
    viewer.onHover = onPartHover;
  }
  // full screen: alleen header + studio; hoogte exact op de header afstemmen
  const header = document.getElementById('header');
  document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  window.scrollTo({ top: 0, behavior: 'instant' });
  setPane('chat');
  if (firstPrompt) sendMessage(firstPrompt);
  else $('#chatInput').focus();
}

function closeStudio() {
  $('#studio').hidden = true;
  $('#hero').hidden = false;
  document.body.classList.remove('studio-open');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---------- chat rendering ----------
function md(text) {
  let h = esc(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/(^|\n)[-•] (.+)/g, '$1<li>$2</li>').replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  return h.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>').replace(/<\/li><br>/g, '</li>');
}
const log = () => $('#chatLog');
function scrollChat() { const l = log(); l.scrollTop = l.scrollHeight; }

function addUserMsg(text) {
  const d = document.createElement('div');
  d.className = 'msg msg--user'; d.innerHTML = `<div class="bubble">${esc(text)}</div>`;
  log().appendChild(d); scrollChat();
}

function newAssistantTurn() {
  const d = document.createElement('div');
  d.className = 'msg msg--ai';
  d.innerHTML = `<img class="msg__avatar" src="img/favicon.svg" alt=""><div class="msg__body">
    <div class="typing"><span></span><span></span><span></span></div></div>`;
  log().appendChild(d); scrollChat();
  return { el: d, body: d.querySelector('.msg__body'), text: null, textRaw: '', thinking: null, tool: null };
}

function ensureThinking(turn) {
  if (turn.thinking) return turn.thinking;
  turn.body.querySelector('.typing')?.remove();
  const det = document.createElement('details');
  det.className = 'think';
  det.innerHTML = `<summary><span class="spinner"></span><span class="think__label">Denkt na…</span></summary><div class="think__text"></div>`;
  turn.body.appendChild(det);
  turn.thinking = { el: det, text: det.querySelector('.think__text'), raw: '' };
  return turn.thinking;
}
function finishThinking(turn) {
  if (!turn.thinking) return;
  turn.thinking.el.classList.add('is-done');
  turn.thinking.el.querySelector('.think__label').textContent = 'Nagedacht';
}

function ensureText(turn) {
  finishThinking(turn);
  turn.body.querySelector('.typing')?.remove();
  if (!turn.text || turn.textClosed) {
    const b = document.createElement('div'); b.className = 'bubble';
    turn.body.appendChild(b); turn.text = b; turn.textRaw = ''; turn.textClosed = false;
  }
  return turn.text;
}

function buildCard(turn) {
  finishThinking(turn);
  turn.body.querySelector('.typing')?.remove();
  if (turn.text) turn.textClosed = true;
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'build-card is-building';
  c.innerHTML = `<span class="build-card__icon"><svg viewBox="0 0 24 24"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg></span>
    <span class="build-card__txt"><strong>3D-model bouwen…</strong><small>0 onderdelen</small></span><span class="spinner"></span>`;
  c.addEventListener('click', () => setPane('model'));
  turn.body.appendChild(c); scrollChat();
  return c;
}

function showSuggestions(turn, options) {
  const wrap = document.createElement('div'); wrap.className = 'suggest';
  options.slice(0, 4).forEach(o => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip chip--suggest'; b.textContent = o;
    b.addEventListener('click', () => { if (!state.busy) sendMessage(o); });
    wrap.appendChild(b);
  });
  turn.body.appendChild(wrap); scrollChat();
}

function clearSuggestions() { document.querySelectorAll('#chatLog .suggest').forEach(s => s.remove()); }

// ---------- streaming tool-input: onderdelen live uit de JSON vissen ----------
function extractParts(json) {
  const k = json.indexOf('"parts"'); if (k < 0) return [];
  const start = json.indexOf('[', k); if (start < 0) return [];
  const out = []; let depth = 0, inStr = false, escp = false, objStart = -1;
  for (let i = start + 1; i < json.length; i++) {
    const c = json[i];
    if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) objStart = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && objStart >= 0) { try { out.push(JSON.parse(json.slice(objStart, i + 1))); } catch { } objStart = -1; } }
    else if (c === ']' && depth === 0) break;
  }
  return out;
}
function extractName(json) {
  const m = json.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m || json.indexOf('"parts"') >= 0 && json.indexOf('"parts"') < m.index) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

// ---------- versturen + SSE ----------
async function sendMessage(text) {
  text = text.trim();
  if (!text || state.busy) return;
  clearSuggestions();
  addUserMsg(text);
  state.transcript.push({ role: 'user', text });
  setBusy(true);

  const turn = newAssistantTurn();
  let tool = null; // { name, json, card, count }

  const body = { sessionId: state.sessionId, message: text };
  if (!state.sessionId && state.restoredDesign) body.design = state.restoredDesign;

  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        switch (ev.t) {
          case 'session': state.sessionId = ev.id; state.restoredDesign = null; break;
          case 'thinking_start': ensureThinking(turn); break;
          case 'thinking': { const th = ensureThinking(turn); th.raw += ev.d; th.text.innerHTML = md(th.raw); break; }
          case 'text_start': break;
          case 'text': { const b = ensureText(turn); turn.textRaw += ev.d; b.innerHTML = md(turn.textRaw); scrollChat(); break; }
          case 'tool_start':
            tool = { name: ev.name, json: '', count: 0 };
            if (ev.name === 'update_design') { tool.card = buildCard(turn); setBuilding(true, 0); }
            break;
          case 'tool_delta':
            if (!tool) break;
            tool.json += ev.d;
            if (tool.name === 'update_design') onDesignStreaming(tool);
            break;
          case 'tool_stop':
            if (tool) onToolDone(turn, tool);
            tool = null;
            break;
          case 'retry':
            setStatus('Model verbeteren…');
            break;
          case 'notice': ensureText(turn).innerHTML = md(ev.d); break;
          case 'error': showError(turn, ev.d); break;
          case 'done': break;
        }
      }
    }
  } catch (err) {
    console.error(err);
    showError(turn, 'Kan de AI-ontwerper niet bereiken. Draait de server (npm run dev)?');
  } finally {
    finishThinking(turn);
    turn.body.querySelector('.typing')?.remove();
    if (!turn.body.children.length) turn.el.remove();
    if (turn.textRaw) state.transcript.push({ role: 'ai', text: turn.textRaw });
    setBuilding(false);
    setBusy(false);
  }
}

function showError(turn, msg) {
  finishThinking(turn);
  turn.body.querySelector('.typing')?.remove();
  const b = document.createElement('div'); b.className = 'bubble bubble--error'; b.textContent = msg;
  turn.body.appendChild(b); scrollChat();
}

function onDesignStreaming(tool) {
  const name = extractName(tool.json);
  if (name) $('#designName').textContent = name;
  const raw = extractParts(tool.json);
  if (raw.length === tool.count) return;
  tool.count = raw.length;
  const v = validateDesign({ parts: raw });
  // tussentijds: alle tot nu toe bekende onderdelen zetten (zonder te verwijderen)
  v.parts.forEach(p => viewer.upsertPart(p));
  tool.card.querySelector('small').textContent = `${raw.length} onderdelen`;
  setBuilding(true, raw.length);
  $('#stageEmpty').hidden = true;
  if (raw.length === 3) viewer.fit(viewer.bounds());
  renderSawlist(buildSawlist(v.parts), true);
}

function onToolDone(turn, tool) {
  let input;
  try { input = JSON.parse(tool.json || '{}'); } catch { input = null; }
  if (tool.name === 'suggest_replies') {
    if (input?.options?.length) showSuggestions(turn, input.options);
    return;
  }
  if (tool.name !== 'update_design') return;
  const v = validateDesign(input);
  const card = tool.card;
  card.classList.remove('is-building');
  card.querySelector('.spinner')?.remove();
  if (!v.ok) {
    card.querySelector('strong').textContent = 'Model wordt gecorrigeerd…';
    return;
  }
  state.design = { name: v.name, summary: v.summary, parts: v.parts };
  state.sawlist = buildSawlist(v.parts);
  viewer.setDesign(v.parts, { fit: 'auto' });
  $('#designName').textContent = v.name;
  card.querySelector('strong').textContent = `${v.name} bijgewerkt`;
  card.querySelector('small').textContent = `${v.parts.length} onderdelen · ${euro(state.sawlist.total)}`;
  card.classList.add('is-done');
  renderSawlist(state.sawlist);
  renderLegend(v.parts);
  if (v.warnings.length) console.info('Ontwerpwaarschuwingen:', v.warnings);
  setBuilding(false);
}

// ---------- status ----------
function setBusy(b) {
  state.busy = b;
  $('#chatSend').disabled = b;
  $('#studio').classList.toggle('is-busy', b);
  setStatus(b ? 'AI is aan het ontwerpen…' : (state.design ? 'Klaar · stel een wijziging voor' : 'Wacht op je input'));
}
function setStatus(t) { $('#designStatus').textContent = t; }
function setBuilding(on, n = 0) {
  const el = $('#stageBuilding');
  el.hidden = !on;
  if (on) $('#buildCount').textContent = n;
}

// ---------- zaaglijst ----------
function renderSawlist(s, live = false) {
  const body = $('#sawlistBody');
  $('#barTotal').textContent = euro(s.total);
  $('#mobileTotal').textContent = euro(s.total);
  $('#sawCount').textContent = `${s.partCount} onderdelen · ${s.lines.length} regels`;
  if (!s.lines.length) { body.innerHTML = `<p class="saw-empty">De zaaglijst vult zich automatisch terwijl de AI je meubel ontwerpt.</p>`; return; }
  const byMat = {};
  s.lines.forEach(l => (byMat[l.mat] ||= []).push(l));
  body.innerHTML = s.materials.map(m => `
    <div class="saw-group">
      <div class="saw-group__head"><span class="swatch" style="--c:${m.color}"></span><strong>${esc(m.name)}</strong><span>${m.areaM2.toFixed(2).replace('.', ',')} m²</span></div>
      ${byMat[m.mat].map(l => `
        <div class="saw-line${l.available ? '' : ' is-warn'}" data-ids="${l.ids.join(',')}">
          <div class="saw-line__main">
            <span class="saw-line__qty">${l.qty}×</span>
            <span class="saw-line__name">${esc(l.names.join(', '))}</span>
            <span class="saw-line__price">${euro(l.total)}</span>
          </div>
          <div class="saw-line__dims">${l.lengthMm} × ${l.widthMm} × ${l.thickness} mm${l.notes.length ? ` · <em>${esc(l.notes.join(', '))}</em>` : ''}</div>
        </div>`).join('')}
      ${m.discount ? `<div class="saw-group__disc">Staffelkorting ${m.discountPct}% <span>− ${euro(m.discount)}</span></div>` : ''}
    </div>`).join('');
  $('#sawTotals').innerHTML = `
    <div><span>Materiaal &amp; zagen</span><span>${euro(s.subtotal)}</span></div>
    ${s.discount ? `<div class="is-disc"><span>Staffelkorting</span><span>− ${euro(s.discount)}</span></div>` : ''}
    <div><span>Verzending NL</span><span>${s.shipping ? euro(s.shipping) : 'Gratis'}</span></div>
    ${s.toFreeShipping ? `<div class="saw-hint">Nog ${euro(s.toFreeShipping)} tot gratis verzending</div>` : ''}
    <div class="saw-total"><span>Totaal incl. btw</span><strong>${euro(s.total)}</strong></div>`;
  body.classList.toggle('is-live', live);
  body.querySelectorAll('.saw-line').forEach(row => {
    row.addEventListener('mouseenter', () => viewer?.highlight(row.dataset.ids.split(',')));
    row.addEventListener('mouseleave', () => viewer?.highlight([]));
  });
}

function renderLegend(parts) {
  const mats = [...new Set(parts.map(p => p.mat))];
  $('#legend').innerHTML = mats.map(m => `<span><i class="swatch" style="--c:${MATERIAL_BY_SLUG[m].color}"></i>${esc(MATERIAL_BY_SLUG[m].name)}</span>`).join('');
}

function onPartHover(part, e) {
  const tip = $('#partTip');
  document.querySelectorAll('.saw-line.is-hover').forEach(r => r.classList.remove('is-hover'));
  if (!part) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML = `<strong>${esc(part.name)}</strong><span>${part.lengthMm} × ${part.widthMm} × ${part.thickness} mm</span><span>${esc(MATERIAL_BY_SLUG[part.mat].name)}</span>`;
  const r = $('#studioViewer').getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + 'px';
  tip.style.top = (e.clientY - r.top + 14) + 'px';
  const row = [...document.querySelectorAll('.saw-line')].find(rw => rw.dataset.ids.split(',').includes(part.id));
  row?.classList.add('is-hover');
}

// ---------- panes (mobiel/tablet) ----------
function setPane(p) {
  $('#studio').dataset.pane = p;
  document.querySelectorAll('.studio__tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.pane === p));
}

// ---------- opslaan / laden ----------
function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } }
function saveStore(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch { return false; } }

function saveDesign() {
  if (!state.design) return toast('Begin eerst met een ontwerp: beschrijf in de chat wat je wilt maken.');
  const list = loadStore();
  const id = state.savedId || 'd' + Date.now().toString(36);
  const entry = { id, name: state.design.name, summary: state.design.summary, parts: state.design.parts, transcript: state.transcript.slice(-30), total: state.sawlist.total, savedAt: new Date().toISOString() };
  const i = list.findIndex(d => d.id === id);
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  state.savedId = id;
  toast(saveStore(list) ? `“${state.design.name}” is opgeslagen in Mijn ontwerpen.` : 'Opslaan lukte niet in deze browser.');
  renderMyDesigns();
}

function renderMyDesigns() {
  const list = loadStore();
  $('#myDesignsList').innerHTML = list.length ? list.map(d => `
    <button class="mydesign" data-id="${d.id}">
      <strong>${esc(d.name)}</strong><span>${d.parts.length} onderdelen · ${euro(d.total)}</span>
      <small>${new Date(d.savedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
    </button>`).join('') : '<p class="muted">Nog geen opgeslagen ontwerpen.</p>';
  $('#myDesignsList').querySelectorAll('.mydesign').forEach(b => b.addEventListener('click', () => openSaved(b.dataset.id)));
}

function openSaved(id) {
  const d = loadStore().find(x => x.id === id);
  if (!d) return;
  $('#myDesigns').hidden = true;
  openStudio();
  const v = validateDesign(d);
  state.sessionId = null; state.savedId = d.id; state.transcript = d.transcript || [];
  state.design = { name: d.name, summary: d.summary, parts: v.parts };
  state.sawlist = buildSawlist(v.parts);
  state.restoredDesign = { name: d.name, parts: d.parts };
  log().innerHTML = '';
  state.transcript.forEach(m => {
    if (m.role === 'user') addUserMsg(m.text);
    else { const t = newAssistantTurn(); ensureText(t).innerHTML = md(m.text); }
  });
  const t = newAssistantTurn(); ensureText(t).innerHTML = md(`Welkom terug! Ik heb **${d.name}** weer geopend. Wat wil je nog aanpassen?`);
  viewer.clear(); viewer.setDesign(v.parts, { fit: true });
  $('#stageEmpty').hidden = true;
  $('#designName').textContent = d.name;
  renderSawlist(state.sawlist); renderLegend(v.parts); setBusy(false);
}

// ---------- bestellen ----------
function openOrder() {
  if (!state.design) return toast('Ontwerp eerst je meubel, dan kun je direct bestellen.');
  const s = state.sawlist;
  $('#orderTitle').textContent = state.design.name;
  $('#orderSummary').textContent = state.design.summary || '';
  $('#orderLines').innerHTML = s.lines.map(l => `<tr><td>${l.qty}×</td><td>${esc(l.names.join(', '))}<small>${esc(l.materialName)}</small></td><td>${l.lengthMm} × ${l.widthMm} × ${l.thickness}</td><td>${euro(l.total)}</td></tr>`).join('');
  $('#orderTotals').innerHTML = $('#sawTotals').innerHTML;
  $('#orderModal').hidden = false;
}

function addToCart() {
  viewer.fit(viewer.bounds(), false);
  const thumb = viewer.snapshot();
  storeAdd(state.design, thumb);
  $('#orderModal').hidden = true;
  toast(`“${state.design.name}” staat in je winkelwagen.`, { href: 'shop.html#winkelwagen', label: 'Naar winkelwagen →' });
}

// ---------- toast ----------
let toastTimer;
function toast(msg, action) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  if (action) { const a = document.createElement('a'); a.href = action.href; a.textContent = action.label; a.className = 'toast__link'; t.append(' ', a); }
  requestAnimationFrame(() => t.classList.add('is-on'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => (t.hidden = true), 250); }, action ? 6000 : 3200);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  addEventListener('resize', () => document.documentElement.style.setProperty('--header-h', document.getElementById('header').offsetHeight + 'px'));
  initHeroDemo();
  const hi = $('#heroInput');
  typewriter(hi);
  hi.addEventListener('input', () => autoGrow(hi));
  hi.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#heroPrompt').requestSubmit(); } });
  $('#heroPrompt').addEventListener('submit', e => {
    e.preventDefault();
    const v = hi.value.trim();
    if (!v) { hi.focus(); hi.classList.add('shake'); setTimeout(() => hi.classList.remove('shake'), 400); return; }
    openStudio(v); hi.value = '';
  });
  document.querySelectorAll('[data-prompt]').forEach(b => b.addEventListener('click', () => openStudio(b.dataset.prompt)));
  document.querySelectorAll('[data-open-designer]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); closeStudio(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => hi.focus(), 400); }));

  const ci = $('#chatInput');
  ci.addEventListener('input', () => autoGrow(ci));
  ci.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const v = ci.value; ci.value = ''; autoGrow(ci); sendMessage(v); });

  $('#studioBack').addEventListener('click', closeStudio);
  document.querySelectorAll('.studio__tabs button').forEach(b => b.addEventListener('click', () => setPane(b.dataset.pane)));
  $('#btnFit').addEventListener('click', () => viewer?.fit());
  $('#btnExplode').addEventListener('click', e => { const on = e.currentTarget.classList.toggle('is-active'); viewer?.setExplode(on); });
  $('#btnDims').addEventListener('click', e => { const on = e.currentTarget.classList.toggle('is-active'); viewer?.setDims(on); });

  document.querySelectorAll('[data-action="save"]').forEach(b => b.addEventListener('click', saveDesign));
  document.querySelectorAll('[data-action="order"]').forEach(b => b.addEventListener('click', openOrder));
  $('#orderClose').addEventListener('click', () => ($('#orderModal').hidden = true));
  $('#orderModal').addEventListener('click', e => { if (e.target.id === 'orderModal') e.currentTarget.hidden = true; });
  $('#orderAdd').addEventListener('click', addToCart);

  const myd = $('#myDesigns');
  document.querySelectorAll('[data-action="mydesigns"]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); renderMyDesigns(); myd.hidden = !myd.hidden; }));
  document.addEventListener('click', e => { if (!myd.hidden && !myd.contains(e.target)) myd.hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { $('#orderModal').hidden = true; myd.hidden = true; } });

  fetch('/api/status').then(r => r.json()).then(s => { if (!s.ai) $('#aiNotice').hidden = false; }).catch(() => { $('#aiNotice').hidden = false; });
  renderSawlist(buildSawlist([]));
  updateBadges();
  if (location.hash === '#ontwerp') setTimeout(() => { hi.focus(); }, 300);
}
init();
