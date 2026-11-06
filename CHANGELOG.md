# Changelog

Formato: versione, data, cosa cambia. Le versioni seguono la cache del service worker (`sw.js`, `dash-vN`): ogni rilascio che cambia i file del sito la incrementa.

## v5 · 2026-11-06 · branch `misure-addome-renpho`
- Misure: nuova misura **Addome** (`abdomen_cm`), nel gruppo Tronco.
- Carica Dati: lettore dei file **Renpho** (nessuna intestazione, celle «Etichetta(cm):valore», data italiana).
- Repository: aggiunti gli script SQL di setup (misure, piani alimentari, mini cut, Hevy), `verifica.sql`, `PIANI.md` e la funzione `supabase/functions/sync-hevy`.
- Database: colonna `abdomen_cm` in `body_measurements`; inserita la misura del 21/10/2026.

## v4 · 2026-11 · prima del 5/11
- Pagina **Misure** (circonferenze mensili, KPI vita/spalle, promemoria dopo 28 giorni).
- **Piano Alimentare** letto dal database (tabelle `foods` e `meal_plans`, collegate alle fasi di Setup).
- Piano **Mini cut** per la fase Cut dal 05/11/2026 (2200 kcal, 154 g proteine): pranzi identici per il meal prep, confezioni intere, rotazione delle fonti di grassi.
- BIA importata fino al 05/11/2026.

## Prima di v4
- Home, Fitness, Alimentazione, Allenamenti, Wellness, Carica Dati, Setup, sync Hevy, PWA.
