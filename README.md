# Adzaagt.nl: redesign-voorstel met AI-meubelontwerper

Vernieuwde homepage (header, home en footer) voor adzaagt.nl (logo, kleuren en bedrijfsgegevens van adzaagt.nl; moderne eigen vormgeving), met als blikvanger een
**AI-meubelontwerper**: de bezoeker typt wat hij wil maken, Claude stelt gerichte vragen, bouwt live
een 3D-model en de zaaglijst rekent direct met echte prijzen.

> Assortiment, plaatprijzen, levering (€ 69,95, eigen transportbus, afhalen in Heemskerk), betaalmethoden en claims komen van adzaagt.nl (november 2026).

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
- `js/materials.js`: 18 materialen uit het assortiment van adzaagt.nl met alle plaatformaten en prijzen per hele plaat
  (opgehaald van hun productpagina's), plus levering en minimale orderwaarde.
- `js/sawlist.js`: ontwerp valideren en onderdelen indelen op hele platen (strokenmethode zoals een paneelzaag,
  4 mm zaagsnede aangenomen, nerf in lengterichting). Per materiaal en dikte wordt het goedkoopste plaatformaat gekozen;
  prijs = aantal platen × plaatprijs, plus € 69,95 bezorgen (afhalen gratis). Toont ook het zaagplan per plaat.
- `js/viewer.js`: 3D-viewer (Three.js): onderdelen bouwen live op, maatvoering, exploded view, hover-koppeling met de zaaglijst.
- `js/designer.js`: hero-promptbar, studio (chat · 3D · zaaglijst), opslaan (localStorage) en in winkelwagen.
- `shop.html` + `js/shop.js`: winkelwagen → afrekenen (testbestelling, niets wordt afgerekend) → bedankpagina →
  stap-voor-stap 3D-bouwinstructies (IKEA-stijl, lettercodes per onderdeel) met AI-bouwassistent.
- `js/store.js`: winkelwagen en testbestellingen (localStorage).

## Hoe de AI werkt

Claude (`claude-opus-5-5`, adaptive thinking) heeft twee tools:
- `update_design`: het volledige meubel als blokken in mm (x/y/z + b/h/d, materiaal-slug). De input streamt
  (`eager_input_streaming`), zodat onderdelen al in 3D verschijnen terwijl Claude ze nog genereert.
- `suggest_replies`: klikbare antwoordopties onder een vraag.

Na elke ontwerpupdate krijgt Claude de berekende prijs en eventuele waarschuwingen terug (bijv. dikte niet leverbaar,
past niet uit één plaat), zodat het die in de volgende beurt kan oplossen.

Bouwinstructies: na een (test)bestelling schrijft Claude via `/api/instructions` een bouwplan met de tool `assembly_plan`
(stappen, gereedschap, beslag). De viewer schuift per stap de nieuwe onderdelen op hun plek. Zonder AI valt hij terug op een
standaard bouwvolgorde op basis van de geometrie. De bouwassistent (`/api/chat`, mode `assembly`) kent het ontwerp, het plan en de huidige stap.

Let op: reviewteksten op de homepage zijn placeholders. Bestellingen zijn testbestellingen en staan alleen in de browser.
