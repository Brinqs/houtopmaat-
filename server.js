// Dev/demo-server: serveert de site en praat met Claude voor de AI-meubelontwerper.
// De API-key blijft op de server (.env) en komt nooit in de browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { MATERIALS, PRICING_RULES } from './js/materials.js';
import { validateDesign, buildSawlist, euro, partLetters, MATERIAL_BY_SLUG } from './js/sawlist.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);

// --- .env laden (zonder extra dependency) ---
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* geen .env */ }

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const client = new Anthropic(); // leest ANTHROPIC_API_KEY

// ---------------------------------------------------------------------------
// Prompt + tools
// ---------------------------------------------------------------------------
// Per materiaal: per dikte de (max. 2) goedkoopste plaatformaten met plaatprijs.
const materialTable = MATERIALS.map(m => {
  const byT = {};
  m.plates.forEach(p => (byT[p.t] ||= []).push(p));
  const opts = Object.entries(byT).map(([t, ps]) => `${t} mm: ${ps.sort((a, b) => a.price - b.price).slice(0, 2).map(p => `${p.l}×${p.w} €${p.price.toFixed(2)}`).join(' / ')}`).join('; ');
  return `- ${m.slug}: ${m.name}${m.grain ? ' (nerf in lengterichting)' : ''} — ${m.use} — ${opts}`;
}).join('\n');

const SYSTEM = `Je bent de AI-meubelontwerper van Adzaagt.nl (\"Ad\"), een online zaagservice in Heemskerk met een modern, computergestuurd machinepark. Adzaagt zaagt plaatmateriaal tot op de millimeter nauwkeurig op maat, voor particulieren en bedrijven, en levert losse onderdelen (geen montage). Motto's: deskundig advies van Ad, maatwerk voor particulieren en bedrijven, plaatmateriaal nauwkeurig op maat. Je helpt particulieren en vakmensen om in een gesprek een meubel te ontwerpen dat zij daarna als zaaglijst bestellen.

## Hoe je werkt
- Spreek Nederlands, je-vorm, warm en deskundig. Houd berichten kort (meestal 2–5 zinnen); geen kopjes.
- Maak na het eerste bericht meteen een eerste realistisch ontwerp met redelijke standaardmaten, zodat de klant direct iets ziet. Vraag daarna gericht door om het te verbeteren.
- Stel per beurt hooguit 1–2 vragen, in een logische volgorde: gebruik en plek → afmetingen (beschikbare ruimte) → indeling (planken, deuren, vakken) → materiaal en uitstraling → details. Stop met vragen zodra het ontwerp af is en nodig de klant uit om op te slaan of te bestellen.
- Geef af en toe kort vakadvies (bijv. doorbuiging van planken, welk materiaal bij lakken of vocht past), maar dring niets op.
- Schrijf altijd eerst je bericht aan de klant, en roep daarna de tools aan.

## Tools
- Roep \`update_design\` aan bij elke wijziging aan het ontwerp, steeds met het VOLLEDIGE ontwerp (alle onderdelen). Houd \`id\`'s van ongewijzigde onderdelen stabiel.
- Roep \`suggest_replies\` aan als je een vraag stelt: 2–4 korte antwoordopties (max ~5 woorden) die de klant met één klik kan kiezen.
- Na \`update_design\` krijg je in het tool-resultaat de echte zaaglijstprijs en eventuele waarschuwingen. Noem de prijs gerust in je volgende bericht, en los waarschuwingen op.

## Geometrie (heel belangrijk)
Elk onderdeel is een rechthoekig blok, assen-uitgelijnd, in millimeters:
- x = breedte (links → rechts), y = hoogte (vloer = 0 → omhoog), z = diepte (achterkant/muur = 0 → voorkant).
- x, y, z is de hoek met de laagste waarden; w, h, d zijn de afmetingen langs x, y, z.
- De kleinste van w/h/d is de plaatdikte en MOET een leverbare dikte van het gekozen materiaal zijn. De andere twee maten moeten op een leverbaar plaatformaat passen (bij materialen met nerf loopt de lengte van het onderdeel mee met de plaatlengte).
- Onderdelen mogen elkaar raken maar niet overlappen. Denk als een meubelmaker:
  - Zijwanden over de volle hoogte; bodem, top en legplanken ertussen (breedte = binnenmaat).
  - Achterwand van 3 mm hardboard/HDF tegen de achterkant (z = 0), de kast staat dan op z = 3 en verder.
  - Deuren en ladefronten vóór de kast, 2–3 mm naden ertussen.
  - Plint of poten onder de kast als dat past. Tafelbladen overstekend op het onderstel.
- Legplanken van 18 mm niet breder dan ±800 mm zonder tussenschot; anders een tussenschot of dikkere plaat.
- Gebruik maximaal ~60 onderdelen; laat beslag (scharnieren, rails, schroeven) weg.
- Geef onderdelen duidelijke Nederlandse namen ("Zijwand links", "Legplank 2", "Deur rechts").

## Assortiment Adzaagt (slug: naam — toepassing — per dikte: plaatformaat in mm en prijs per hele plaat incl. btw)
${materialTable}

## Prijs en levering (zoals op adzaagt.nl)
- De klant koopt HELE platen; Ad zaagt daaruit tot op de millimeter nauwkeurig de onderdelen. De prijs is dus het aantal benodigde platen × plaatprijs. Het systeem deelt de onderdelen automatisch in op de goedkoopste plaatformaten.
- Kies daarom slim: onderdelen in hetzelfde materiaal en dezelfde dikte delen platen. Een ander materiaal of een andere dikte voor één klein onderdeel kost vaak een extra hele plaat; benoem dat als het scheelt. Hoge benutting = voordeliger.
- Reststukken krijgt de klant op verzoek mee; anders krijgen ze een tweede leven bij het Hout- en Meubileringscollege.
- Extra bewerkingen zoals kantenband (ABS), verstek, verjongen, afronden en CNC-boringen (bijv. Blum-scharnieren, ladegeleiders) zijn mogelijk via Ad; die staan niet in deze zaaglijst, de prijs volgt na controle.
- Bezorgen met de eigen transportbus van Adzaagt: € ${PRICING_RULES.shippingNL.toFixed(2)} per bestelling in Nederland (niet op de Waddeneilanden, niet in België). Track & trace via Routigo, levering tot achter de eerste deur. Afhalen in Heemskerk is gratis. Levertijd verschilt per product, meestal 10–15 werkdagen.
- Betalen kan met iDEAL, Bancontact, PayPal of overboeking (geen kopen op rekening).`;

const TOOLS = [
  {
    name: 'update_design',
    description: 'Toon het (bijgewerkte) volledige meubelontwerp als 3D-model met zaaglijst. Altijd het complete ontwerp meesturen.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Korte, aansprekende naam, bijv. "Boekenkast Noor"' },
        summary: { type: 'string', description: 'Eén zin: wat het is en de buitenmaten (b × h × d)' },
        parts: {
          type: 'array',
          description: 'Alle onderdelen als blokken in mm (zie geometrie-regels).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stabiele id, bijv. "side_l"' },
              name: { type: 'string' },
              mat: { type: 'string', enum: MATERIALS.map(m => m.slug) },
              x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' },
              w: { type: 'number' }, h: { type: 'number' }, d: { type: 'number' },
            },
            required: ['id', 'name', 'mat', 'x', 'y', 'z', 'w', 'h', 'd'],
          },
        },
      },
      required: ['name', 'summary', 'parts'],
    },
  },
  {
    name: 'suggest_replies',
    description: 'Toon 2–4 klikbare antwoordopties onder je vraag.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { options: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 } },
      required: ['options'],
    },
  },
];

// ---------------------------------------------------------------------------
// Sessies (in geheugen; demo)
// ---------------------------------------------------------------------------
const sessions = new Map(); // id -> { messages: [], pendingResults: null, updatedAt }
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600e3;
  for (const [id, s] of sessions) if (s.updatedAt < cutoff) sessions.delete(id);
}, 600e3).unref();

function toolResultsFor(content) {
  const results = [];
  let hadError = false;
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    if (block.name === 'update_design') {
      const v = validateDesign(block.input);
      if (!v.ok) {
        hadError = true;
        results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true,
          content: `Ontwerp niet getoond. Fouten:\n- ${v.errors.join('\n- ')}\nStuur het volledige ontwerp opnieuw, gecorrigeerd.` });
        continue;
      }
      const s = buildSawlist(v.parts);
      let text = `Getoond aan de klant: ${v.parts.length} onderdelen. Plaatindeling:\n` +
        s.sheets.map(sh => sh.error ? `- ${sh.name} ${sh.thickness} mm: ${sh.error}` :
          `- ${sh.name} ${sh.thickness} mm: ${sh.count}× plaat ${sh.plate.l}×${sh.plate.w} à ${euro(sh.plate.price)} = ${euro(sh.cost)} (${Math.round(sh.utilization * 100)}% benut)`).join('\n') +
        `\nPlaten ${euro(s.subtotal)} + bezorgen ${euro(s.shipping)} = ${euro(s.total)} incl. btw (afhalen in Heemskerk gratis).`;
      if (v.warnings.length) text += `\nWaarschuwingen (los op in je volgende update):\n- ${v.warnings.join('\n- ')}`;
      results.push({ type: 'tool_result', tool_use_id: block.id, content: text });
    } else if (block.name === 'suggest_replies') {
      results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Opties getoond.' });
    } else {
      hadError = true;
      results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Onbekende tool.' });
    }
  }
  return { results, hadError };
}

async function runTurn(session, send) {
  // Max 3 modelbeurten per klantbericht (extra beurten alleen om fouten te herstellen).
  for (let round = 0; round < 3; round++) {
    const tools = session.tools ?? TOOLS;
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system: session.system || SYSTEM,
      ...(tools.length ? { tools } : {}),
      messages: session.messages,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: session.effort || 'medium' },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    const blockTypes = {};
    let final;
    try {
      for await (const ev of stream) {
        if (ev.type === 'content_block_start') {
          const b = ev.content_block;
          blockTypes[ev.index] = b.type;
          if (b.type === 'tool_use') send({ t: 'tool_start', name: b.name, id: b.id });
          if (b.type === 'thinking') send({ t: 'thinking_start' });
          if (b.type === 'text') send({ t: 'text_start' });
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta;
          if (d.type === 'text_delta') send({ t: 'text', d: d.text });
          else if (d.type === 'thinking_delta') send({ t: 'thinking', d: d.thinking });
          else if (d.type === 'input_json_delta') send({ t: 'tool_delta', d: d.partial_json });
        } else if (ev.type === 'content_block_stop') {
          if (blockTypes[ev.index] === 'tool_use') send({ t: 'tool_stop' });
        }
      }
      final = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw err;
      // Ongeldige tool-JSON (eager streaming): beurt opnieuw proberen.
      console.warn('Tool-input niet parsebaar, opnieuw:', err.message);
      send({ t: 'retry' });
      continue;
    }

    if (final.stop_reason === 'refusal') {
      send({ t: 'notice', d: 'Dit verzoek kan ik helaas niet uitvoeren. Probeer het anders te formuleren.' });
      return { refused: true };
    }
    const hasTool = final.content.some(b => b.type === 'tool_use');
    if (final.stop_reason === 'max_tokens' && hasTool) {
      session.messages.push({ role: 'assistant', content: final.content });
      session.messages.push({ role: 'user', content: final.content.filter(b => b.type === 'tool_use').map(b => ({
        type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'Afgekapt (max_tokens). Stuur een compacter ontwerp met minder onderdelen.' })) });
      send({ t: 'retry' });
      continue;
    }

    session.messages.push({ role: 'assistant', content: final.content });
    if (!hasTool) { session.pendingResults = null; return {}; }

    const { results, hadError } = toolResultsFor(final.content);
    if (hadError) {
      session.messages.push({ role: 'user', content: results });
      send({ t: 'retry' });
      continue;
    }
    // Resultaten gaan mee met het volgende klantbericht (geen extra wachttijd nu).
    session.pendingResults = results;
    return {};
  }
  return {};
}

async function handleChat(req, res) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 2e5) return res.writeHead(413).end(); }
  let payload;
  try { payload = JSON.parse(body); } catch { return res.writeHead(400).end('Bad JSON'); }
  const text = String(payload.message || '').slice(0, 4000).trim();
  if (!text) return res.writeHead(400).end('Leeg bericht');

  const sid = /^[a-zA-Z0-9-]{8,64}$/.test(payload.sessionId || '') ? payload.sessionId : crypto.randomUUID();
  let session = sessions.get(sid);
  if (!session) {
    session = { messages: [], pendingResults: null };
    if (payload.mode === 'assembly') {
      const sys = assemblySystem(payload.context);
      if (!sys) return res.writeHead(400).end('Ongeldige context');
      Object.assign(session, { system: sys, tools: [], effort: 'low', mode: 'assembly' });
    }
    sessions.set(sid, session);
  }
  session.updatedAt = Date.now();

  // Nieuw gesprek met een opgeslagen ontwerp: geef de huidige stand mee als context.
  let userText = text;
  if (session.messages.length === 0 && payload.design?.parts?.length) {
    const v = validateDesign(payload.design);
    if (v.ok) userText = `(Context: de klant heeft dit eerder opgeslagen ontwerp geopend: ${JSON.stringify({ name: payload.design.name, parts: payload.design.parts })})\n\n${text}`;
  }
  const content = [...(session.pendingResults || []), { type: 'text', text: userText }];
  session.pendingResults = null;
  session.messages.push({ role: 'user', content });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ t: 'session', id: sid });

  if (!process.env.ANTHROPIC_API_KEY) {
    if (session.mode === 'assembly') { send({ t: 'text_start' }); send({ t: 'text', d: '*(Demo-modus)* Zonder API-key kan ik geen vragen beantwoorden. Zet ANTHROPIC_API_KEY in .env.' }); send({ t: 'done' }); return res.end(); }
    await runDemoTurn(session, send);
    send({ t: 'done' });
    return res.end();
  }

  try {
    const r = await runTurn(session, send);
    if (r.refused) session.messages.pop(); // laatste klantbericht terugnemen
    send({ t: 'done' });
  } catch (err) {
    console.error(err);
    // Klantbericht terugnemen zodat de sessie geldig blijft.
    if (session.messages.at(-1)?.role === 'user') session.messages.pop();
    let msg = 'Er ging iets mis bij de AI. Probeer het zo nog eens.';
    if (err instanceof Anthropic.AuthenticationError) msg = 'De API-key ontbreekt of is ongeldig. Zet ANTHROPIC_API_KEY in het .env-bestand en herstart de server.';
    else if (err instanceof Anthropic.RateLimitError) msg = 'Het is even druk bij de AI. Probeer het over een minuutje opnieuw.';
    else if (err instanceof Anthropic.APIConnectionError) msg = 'Geen verbinding met de AI-dienst. Controleer de internetverbinding.';
    else if (err instanceof Anthropic.APIError && /credit balance/i.test(err.message)) msg = 'Het API-tegoed van dit Anthropic-account is op. Vul tegoed aan via console.anthropic.com → Plans & Billing en probeer het opnieuw.';
    else if (err instanceof Anthropic.APIError && err.status === 400) msg = `De AI weigerde het verzoek (400): ${err.message}`;
    send({ t: 'error', d: msg });
  }
  res.end();
}

// ---------------------------------------------------------------------------
// Bouwinstructies (stap-voor-stap) + bouwassistent
// ---------------------------------------------------------------------------
function describeParts(parts) {
  const { map } = partLetters(parts);
  return parts.map(p => `- ${map[p.id]} | id=${p.id} | ${p.name} | ${MATERIAL_BY_SLUG[p.mat].name} | ${p.lengthMm}×${p.widthMm}×${p.thickness} mm | positie x=${p.x} y=${p.y} z=${p.z}, maat w=${p.w} h=${p.h} d=${p.d}`).join('\n');
}

const PLAN_SYSTEM = `Je bent een ervaren meubelmaker die heldere bouwinstructies schrijft in de stijl van een IKEA-boekje, voor klanten van Adzaagt.nl. De klant ontvangt alleen losse, op maat gezaagde platen; beslag (schroeven, deuvels, scharnieren, ophangbeslag) is NIET meegeleverd.

Maak een logische bouwvolgorde zoals een vakman het zou doen (bijv. eerst de kast liggend opbouwen: bodem en zijwanden, dan tussenschotten en legplanken, top, achterwand om haaks te zetten, plint, als laatste deuren/fronten). Coördinaten: x = breedte, y = hoogte (vloer = 0), z = diepte (achter = 0 → voor).

Regels:
- 4 tot 10 stappen. Elk onderdeel (id) komt in precies één stap voor.
- Per stap: korte titel (max 5 woorden), uitleg van 2–4 korte zinnen in je-vorm met de lettercodes (bijv. "Plaats zijwand B tegen bodem A"), concreet over verbindingen (schroeven 4×40 mm voorboren, houtlijm, deuvels), en optioneel een tip.
- Noem gereedschap en benodigd beslag met aantallen en maten in \`tools\` en \`hardware\`.
- Roep direct de tool \`assembly_plan\` aan, zonder tekst ervoor.`;

const PLAN_TOOL = {
  name: 'assembly_plan',
  description: 'Lever het stap-voor-stap bouwplan.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      intro: { type: 'string', description: 'Eén of twee zinnen: wat je gaat bouwen, hoe lang het ongeveer duurt, met hoeveel personen.' },
      tools: { type: 'array', items: { type: 'string' }, description: 'Gereedschap, bijv. "Accuboormachine", "Houtlijm"' },
      hardware: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' } }, required: ['name', 'qty'] } },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            text: { type: 'string' },
            tip: { type: 'string' },
            parts: { type: 'array', items: { type: 'string' }, description: 'ids van de onderdelen die in deze stap worden geplaatst' },
          },
          required: ['title', 'text', 'parts'],
        },
      },
    },
    required: ['intro', 'tools', 'hardware', 'steps'],
  },
};

function normalizePlan(plan, parts) {
  const ids = new Set(parts.map(p => p.id)), used = new Set();
  const steps = (Array.isArray(plan?.steps) ? plan.steps : []).map(st => ({
    title: String(st?.title || 'Stap').slice(0, 80), text: String(st?.text || '').slice(0, 900), tip: st?.tip ? String(st.tip).slice(0, 400) : '',
    parts: (Array.isArray(st?.parts) ? st.parts : []).map(String).filter(id => ids.has(id) && !used.has(id) && used.add(id)),
  })).filter(st => st.parts.length);
  const rest = parts.filter(p => !used.has(p.id)).map(p => p.id);
  if (rest.length) steps.push({ title: 'Laatste onderdelen', text: 'Plaats de overgebleven onderdelen zoals in de afbeelding.', tip: '', parts: rest });
  return {
    intro: String(plan?.intro || '').slice(0, 600),
    tools: (Array.isArray(plan?.tools) ? plan.tools : []).map(String).slice(0, 10),
    hardware: (Array.isArray(plan?.hardware) ? plan.hardware : []).filter(h => h?.name).map(h => ({ name: String(h.name).slice(0, 80), qty: Number(h.qty) || 1 })).slice(0, 12),
    steps,
  };
}

async function handleInstructions(req, res) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 4e5) return res.writeHead(413).end(); }
  let payload; try { payload = JSON.parse(body); } catch { return res.writeHead(400).end(); }
  const v = validateDesign(payload.design);
  if (!v.ok) return res.writeHead(400).end('Ongeldig ontwerp');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  if (!process.env.ANTHROPIC_API_KEY) { send({ t: 'error', d: 'no_key' }); return res.end(); }

  const messages = [{ role: 'user', content: `Meubel: ${v.name}${v.summary ? ` — ${v.summary}` : ''}\n\nOnderdelen (letter | id | naam | materiaal | L×B×D | positie):\n${describeParts(v.parts)}` }];
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = client.beta.messages.stream({
        model: MODEL, max_tokens: 32000, system: PLAN_SYSTEM, tools: [PLAN_TOOL], messages,
        thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      });
      let final;
      try {
        for await (const ev of stream) {
          if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use') send({ t: 'tool_start' });
          if (ev.type === 'content_block_delta' && ev.delta.type === 'input_json_delta') send({ t: 'tool_delta', d: ev.delta.partial_json });
        }
        final = await stream.finalMessage();
      } catch (err) { if (err instanceof Anthropic.APIError) throw err; send({ t: 'retry' }); continue; }
      const block = final.content.find(b => b.type === 'tool_use' && b.name === 'assembly_plan');
      if (final.stop_reason === 'refusal' || !block || (final.stop_reason === 'max_tokens')) { send({ t: 'retry' }); continue; }
      send({ t: 'plan', plan: normalizePlan(block.input, v.parts) });
      return res.end();
    }
    send({ t: 'error', d: 'failed' });
  } catch (err) {
    console.error(err);
    send({ t: 'error', d: err instanceof Anthropic.APIError && /credit balance/i.test(err.message) ? 'credit' : 'failed' });
  }
  res.end();
}

function assemblySystem(ctx) {
  const v = validateDesign(ctx?.design);
  if (!v.ok) return null;
  const plan = normalizePlan(ctx.plan, v.parts);
  const { map } = partLetters(v.parts);
  return `Je bent de bouwassistent van Adzaagt.nl (zagerij in Heemskerk). De klant heeft een meubel besteld als losse, op maat gezaagde platen en zet het nu zelf in elkaar met de stap-voor-stap 3D-instructies. Help met korte, praktische antwoorden (meestal 2–4 zinnen, je-vorm, Nederlands). Verwijs naar onderdelen met hun lettercode. Denk aan veiligheid (voorboren, met twee personen tillen, hoge kasten aan de muur borgen). Beslag is niet meegeleverd; adviseer gerust maten en aantallen. Bij een probleem met het zaagwerk zelf (verkeerde maat, beschadiging): verwijs naar de klantenservice: 0251 - 342 395 of klantenservice@adzaagt.nl. Elk bericht begint met de stap waar de klant op dat moment is.

Meubel: ${v.name}${v.summary ? ` — ${v.summary}` : ''}

Onderdelen (letter | id | naam | materiaal | L×B×D | positie):
${describeParts(v.parts)}

Bouwplan:
${plan.steps.map((st, i) => `Stap ${i + 1}: ${st.title} — onderdelen ${[...new Set(st.parts.map(id => map[id]))].join(', ')}. ${st.text}${st.tip ? ` Tip: ${st.tip}` : ''}`).join('\n')}
Gereedschap: ${plan.tools.join(', ') || '-'}
Beslag: ${plan.hardware.map(h => `${h.qty}× ${h.name}`).join(', ') || '-'}`;
}

// ---------------------------------------------------------------------------
// Demo-modus (alleen zonder API-key): speelt een vast scenario af om de UI te testen.
// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
function demoDesign(round) {
  const E = 'berken-multiplex', H = 'hardboard', W = round > 0 ? 'mdf-gegrond' : E;
  const width = round > 0 ? 1000 : 800, inner = width - 36, shelves = round > 0 ? [430, 790, 1140, 1480, 1800] : [430, 790, 1140, 1480];
  const height = round > 0 ? 2100 : 1800;
  const parts = [
    { id: 'back', name: 'Achterwand', mat: H, x: 0, y: 0, z: 0, w: width, h: height, d: 3 },
    { id: 'side_l', name: 'Zijwand links', mat: E, x: 0, y: 0, z: 3, w: 18, h: height, d: 327 },
    { id: 'side_r', name: 'Zijwand rechts', mat: E, x: width - 18, y: 0, z: 3, w: 18, h: height, d: 327 },
    { id: 'plinth', name: 'Plint', mat: E, x: 18, y: 0, z: 290, w: inner, h: 60, d: 18 },
    { id: 'bottom', name: 'Bodem', mat: E, x: 18, y: 60, z: 3, w: inner, h: 18, d: 327 },
    ...shelves.map((y, i) => ({ id: `shelf_${i + 1}`, name: 'Legplank', mat: E, x: 18, y, z: 3, w: inner, h: 18, d: 310 })),
    { id: 'top', name: 'Top', mat: E, x: 18, y: height - 18, z: 3, w: inner, h: 18, d: 327 },
    { id: 'door_l', name: 'Deur links', mat: W, x: 2, y: 80, z: 330, w: width / 2 - 4, h: 346, d: 18 },
    { id: 'door_r', name: 'Deur rechts', mat: W, x: width / 2 + 2, y: 80, z: 330, w: width / 2 - 4, h: 346, d: 18 },
  ];
  return { name: 'Boekenkast Noor', summary: `Boekenkast ${width} × ${height} × 348 mm met dichte onderkast`, parts };
}
async function runDemoTurn(session, send) {
  const round = session.demoRound = (session.demoRound ?? -1) + 1;
  const say = round === 0
    ? '*(Demo-modus: er is nog geen API-key gekoppeld.)* Leuk project! Ik heb alvast een eerste opzet gemaakt: een boekenkast van **80 cm breed en 1,80 m hoog** in berken multiplex, met een dichte onderkast. Hoeveel ruimte heb je in de breedte en hoogte?'
    : '*(Demo-modus)* Ik heb de kast verbreed naar **1 meter** en verhoogd naar **2,10 m**, met een extra legplank en witte deurtjes voor wat contrast. Zo goed?';
  send({ t: 'thinking_start' });
  for (const w of 'De klant wil een kast; ik begin met een standaardopzet en vraag daarna naar de maten.'.split(' ')) { send({ t: 'thinking', d: w + ' ' }); await sleep(40); }
  send({ t: 'text_start' });
  for (const w of say.split(' ')) { send({ t: 'text', d: w + ' ' }); await sleep(45); }
  const json = JSON.stringify(demoDesign(round));
  send({ t: 'tool_start', name: 'update_design' });
  for (let i = 0; i < json.length; i += 40) { send({ t: 'tool_delta', d: json.slice(i, i + 40) }); await sleep(35); }
  send({ t: 'tool_stop' });
  const opts = JSON.stringify({ options: round === 0 ? ['1 m breed, 2,10 m hoog', 'Smaller: 60 cm', 'Zonder deurtjes'] : ['Ja, perfect!', 'Doe toch zonder deurtjes', 'Andere houtsoort'] });
  send({ t: 'tool_start', name: 'suggest_replies' });
  send({ t: 'tool_delta', d: opts });
  send({ t: 'tool_stop' });
}

// ---------------------------------------------------------------------------
// Statische bestanden
// ---------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon' };
const PUBLIC = new Set(['index.html', 'shop.html', 'styles.css', 'main.js']);

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const ok = PUBLIC.has(rel) || (/^(js|img)(\/[\w-][\w.-]*)+$/.test(rel) && !rel.includes('..'));
  const file = path.join(ROOT, rel);
  if (!ok || !file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end('Niet gevonden');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'POST' && req.url === '/api/instructions') return handleInstructions(req, res);
  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ai: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL }));
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end();
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Adzaagt.nl demo: http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('Let op: ANTHROPIC_API_KEY ontbreekt (.env). De AI-ontwerper werkt pas als die is ingevuld.');
});
