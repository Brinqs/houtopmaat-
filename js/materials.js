// Bron: https://houtopmaatgezaagd.nl/api/catalog/materials + /api/public/settings (opgehaald 2026-11-11)
// Prijzen per m² incl. btw, per dikte (mm).
export const MATERIALS = [
 {
  "slug": "multiplex-interieur",
  "name": "Multiplex interieur",
  "color": "#d9b27c",
  "grain": true,
  "use": "sterk, constructief, kasten en meubels",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "4": 16.95,
   "6": 19.95,
   "9": 21.95,
   "12": 30.95,
   "15": 35.95,
   "18": 38.95,
   "22": 48.95
  },
  "staffel": [
   {
    "minM2": 5,
    "korting": 5
   },
   {
    "minM2": 10,
    "korting": 10
   }
  ]
 },
 {
  "slug": "populieren-multiplex",
  "name": "Multiplex populier",
  "color": "#e6cfa4",
  "grain": true,
  "use": "licht van gewicht, mooi blank, kasten",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "9": 24.95,
   "12": 29.95,
   "15": 39.95,
   "18": 44.95
  },
  "staffel": []
 },
 {
  "slug": "multiplex-berken",
  "name": "Multiplex berken CP/CP",
  "color": "#ecd7b0",
  "grain": true,
  "use": "premium zichtwerk, strakke lagen-kant",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "9": 34.95,
   "12": 44.95,
   "18": 59.94
  },
  "staffel": []
 },
 {
  "slug": "mdf-blank",
  "name": "MDF",
  "color": "#b58a5e",
  "grain": false,
  "use": "glad, ideaal om te lakken, fronten en kasten",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "4": 9.95,
   "6": 12.95,
   "9": 14.95,
   "12": 16.95,
   "15": 18.95,
   "18": 19.95,
   "22": 24.95,
   "25": 29.95,
   "30": 39.95
  },
  "staffel": [
   {
    "minM2": 5,
    "korting": 3
   },
   {
    "minM2": 15,
    "korting": 8
   }
  ]
 },
 {
  "slug": "mdf-wit-gegrond",
  "name": "MDF wit gegrond",
  "color": "#f2f0eb",
  "grain": false,
  "use": "wit voorgegrond, klaar om af te lakken",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "9": 17.95,
   "12": 20.95,
   "15": 27.95,
   "18": 31.95
  },
  "staffel": []
 },
 {
  "slug": "mdf-vochtwerend",
  "name": "MDF vochtwerend",
  "color": "#8a9a6b",
  "grain": false,
  "use": "badkamer, vochtige ruimtes",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "9": 38.5,
   "12": 38.5,
   "15": 38.5,
   "18": 38.5
  },
  "staffel": []
 },
 {
  "slug": "mdf-zwart",
  "name": "MDF zwart (doorgekleurd)",
  "color": "#2b2b2b",
  "grain": false,
  "use": "zwart doorgekleurd, strak design",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "12": 40,
   "18": 52.95
  },
  "staffel": []
 },
 {
  "slug": "eiken-fineer",
  "name": "MDF gefineerd eiken",
  "color": "#c99a63",
  "grain": true,
  "use": "eikenlook voor fronten en kasten",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "12": 54,
   "18": 54,
   "25": 54
  },
  "staffel": []
 },
 {
  "slug": "spaanplaat",
  "name": "Spaanplaat",
  "color": "#c9ad84",
  "grain": false,
  "use": "voordelig, binnenwerk",
  "maxLengthCm": 250.0,
  "maxWidthCm": 125.0,
  "prices": {
   "8": 13.95,
   "12": 15.95,
   "16": 16.95,
   "18": 18.95
  },
  "staffel": []
 },
 {
  "slug": "spaanplaat-wit",
  "name": "Spaanplaat wit",
  "color": "#f4f4f2",
  "grain": false,
  "use": "witte kasten, kastplanken",
  "maxLengthCm": 250.0,
  "maxWidthCm": 125.0,
  "prices": {
   "18": 27.5
  },
  "staffel": []
 },
 {
  "slug": "meubelpaneel-wit",
  "name": "Meubelpaneel wit",
  "color": "#f7f7f5",
  "grain": false,
  "use": "witte meubels, planken tot 80 cm diep",
  "maxLengthCm": 305.0,
  "maxWidthCm": 80.0,
  "prices": {
   "18": 27.5
  },
  "staffel": []
 },
 {
  "slug": "meubelpaneel-licht-eiken",
  "name": "Meubelpaneel licht eiken",
  "color": "#d8b98d",
  "grain": true,
  "use": "eikendecor, planken en kasten tot 60 cm",
  "maxLengthCm": 250.0,
  "maxWidthCm": 60.0,
  "prices": {
   "18": 48.93
  },
  "staffel": []
 },
 {
  "slug": "meubelpaneel-donker-eiken",
  "name": "Meubelpaneel donker eiken",
  "color": "#7a5536",
  "grain": true,
  "use": "donker eikendecor tot 60 cm",
  "maxLengthCm": 250.0,
  "maxWidthCm": 60.0,
  "prices": {
   "18": 48.93
  },
  "staffel": []
 },
 {
  "slug": "meubelpaneel-walnoot",
  "name": "Meubelpaneel walnoot",
  "color": "#5e4030",
  "grain": true,
  "use": "walnootdecor tot 60 cm",
  "maxLengthCm": 250.0,
  "maxWidthCm": 60.0,
  "prices": {
   "18": 61.5
  },
  "staffel": []
 },
 {
  "slug": "meubelpaneel-zwart",
  "name": "Meubelpaneel zwart",
  "color": "#232323",
  "grain": false,
  "use": "zwart decor tot 60 cm",
  "maxLengthCm": 250.0,
  "maxWidthCm": 60.0,
  "prices": {
   "18": 37.5
  },
  "staffel": []
 },
 {
  "slug": "rubberwood",
  "name": "Rubberwood (massief)",
  "color": "#d6a874",
  "grain": true,
  "use": "massief, tafel- en werkbladen, traptreden",
  "maxLengthCm": 305.0,
  "maxWidthCm": 122.0,
  "prices": {
   "20": 89.95,
   "30": 129.95
  },
  "staffel": [
   {
    "minM2": 3,
    "korting": 5
   }
  ]
 },
 {
  "slug": "eiken-paneel-38-mm",
  "name": "Eiken paneel massief 38 mm",
  "color": "#b98a55",
  "grain": true,
  "use": "massief eiken, tafelbladen, max 65 cm breed",
  "maxLengthCm": 300.0,
  "maxWidthCm": 65.0,
  "prices": {
   "38": 199.95
  },
  "staffel": []
 },
 {
  "slug": "timmerpaneel-eiken",
  "name": "Eiken timmerpaneel FSC",
  "color": "#c1925e",
  "grain": true,
  "use": "massief eiken 18 mm, max 80 cm breed",
  "maxLengthCm": 200.0,
  "maxWidthCm": 80.0,
  "prices": {
   "18": 74.95
  },
  "staffel": []
 },
 {
  "slug": "timmerpaneel-grenen-18-mm-",
  "name": "Timmerpaneel grenen",
  "color": "#e3c48f",
  "grain": true,
  "use": "massief grenen 18 mm, max 60 cm breed",
  "maxLengthCm": 200.0,
  "maxWidthCm": 60.0,
  "prices": {
   "18": 39.95
  },
  "staffel": []
 },
 {
  "slug": "osb",
  "name": "OSB",
  "color": "#c8a46a",
  "grain": false,
  "use": "robuuste industriële look",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "12": 17.95,
   "18": 19.95
  },
  "staffel": []
 },
 {
  "slug": "hardboard",
  "name": "Hardboard wit 3 mm",
  "color": "#fafafa",
  "grain": false,
  "use": "achterwanden en ladebodems",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "3": 9.95
  },
  "staffel": []
 },
 {
  "slug": "mdf-hdf-lakboard-wit",
  "name": "HDF lakboard wit 3 mm",
  "color": "#ffffff",
  "grain": false,
  "use": "witte achterwanden",
  "maxLengthCm": 244.0,
  "maxWidthCm": 122.0,
  "prices": {
   "3": 8.95
  },
  "staffel": []
 }
];

export const PRICING_RULES = {
 "chargeFullWidthFromCm": 100.0,
 "chargeFullLengthFromCm": 200.0,
 "minimumPricePerPiece": 2.5,
 "drillHolePricePerPiece": 5.0,
 "freeShippingFromNL": 295.0,
 "shippingCostNL": 29.95
};
