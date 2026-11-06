# Piani alimentari nel database

1. In Supabase > SQL Editor esegui `setup_piani.sql` (dopo `setup_impostazioni.sql`). Crea le tabelle `foods` e `meal_plans` e inserisce il piano BULK: versione 1 = file Excel (archiviata), versione 2 = ricalibrato (attiva). Il piano viene collegato alla fase di bulk più recente del Setup. Puoi eseguirlo più volte senza duplicare nulla.
2. Carica sul sito `piano.html`, `sw.js`, `assets/piano.js`, `assets/piano_seed.js` e `assets/app.js`.
3. Nella pagina Piano Alimentare la fase in corso sceglie il piano da mostrare; gli altri piani sono nei pulsanti in alto.

Se il piano non risulta collegato alla fase giusta: `update public.meal_plans set phase_id = <id fase> where id = <id piano>;`

## La primavera: piano CUT
Quando crei la fase Cut nel Setup, scrivimi "crea il piano CUT": ti preparo lo script SQL (nuova riga in `meal_plans` con phase_type = 'cut') e il piano compare in automatico quando la fase è in corso. Stessa cosa per qualsiasi modifica ai grammi o ai valori degli alimenti: dimmi cosa cambiare e ti do l'UPDATE.
