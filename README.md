# HoutOpMaatGezaagd: redesign-voorstel met AI-meubelontwerper

Vernieuwde homepage (header, home en footer) voor houtopmaatgezaagd.nl, met als blikvanger een
**AI-meubelontwerper**: de bezoeker typt wat hij wil maken, Claude stelt gerichte vragen, bouwt live
een 3D-model en de zaaglijst rekent direct met de echte prijzen van de site.

## Starten

```bash
npm install
cp .env.example .env      # zet hier je ANTHROPIC_API_KEY
npm run dev               # http://localhost:5173
```

Zonder API-key draait de ontwerper in **demo-modus**: een vast voorbeeldscenario om de UI te laten zien.

## Opbouw

- `server.js`: Node-server; serveert de site en `/api/chat` (Claude via `@anthropic-ai/sdk`, streaming).
  De API-key blijft op de server. Gesprekken worden in het geheugen bewaard (demo).
- `js/materials.js`: materialen, prijzen per dikte en prijsregels, opgehaald uit de publieke catalogus-API
  van houtopmaatgezaagd.nl (`/api/catalog/materials`, `/api/public/settings`).
- `js/sawlist.js`: ontwerp valideren en zaaglijst + prijs berekenen (gedeeld door server en browser):
  m²-prijs per dikte, minimaal € 2,50 per onderdeel, volle plaatlengte boven 200 cm, volle plaatbreedte boven 100 cm,
  staffelkorting per materiaal, verzending € 29,95 onder € 295.
- `js/viewer.js`: 3D-viewer (Three.js): onderdelen bouwen live op, maatvoering, exploded view, hover-koppeling met de zaaglijst.
- `js/designer.js`: hero-promptbar, studio (chat · 3D · zaaglijst), opslaan (localStorage) en bestellen.

## Hoe de AI werkt

Claude (`claude-opus-5-5`, adaptive thinking) heeft twee tools:
- `update_design`: het volledige meubel als blokken in mm (x/y/z + b/h/d, materiaal-slug). De input streamt
  (`eager_input_streaming`), zodat onderdelen al in 3D verschijnen terwijl Claude ze nog genereert.
- `suggest_replies`: klikbare antwoordopties onder een vraag.

Na elke ontwerpupdate krijgt Claude de berekende prijs en eventuele waarschuwingen terug (bijv. dikte niet leverbaar,
past niet uit één plaat), zodat het die in de volgende beurt kan oplossen.

Let op: reviewteksten op de homepage zijn placeholders. "In winkelwagen" is in deze demo niet gekoppeld aan de echte webshop.
