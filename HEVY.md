# Sincronizzazione con Hevy

Il pulsante **Aggiorna da Hevy** (pagina Carica Dati) scarica da Hevy gli allenamenti nuovi o modificati e li scrive nella tabella `workouts`.
La chiave API di Hevy resta **solo su Supabase**, in un segreto della funzione: non va mai nel codice del sito, che è pubblico.

## Una tantum

**1. Colonna di appoggio** — nell'SQL Editor di Supabase esegui `setup_hevy.sql`.

**2. Crea la funzione** — Supabase → *Edge Functions* → *Deploy a new function* (editor nel browser):
- nome: `sync-hevy`
- incolla tutto il contenuto di `supabase/functions/sync-hevy/index.ts`
- nelle impostazioni della funzione **disattiva «Verify JWT»** (l'accesso è controllato dal codice: serve un utente autenticato, oppure il segreto del webhook)

In alternativa, da terminale con la CLI di Supabase: `supabase functions deploy sync-hevy --no-verify-jwt`

**3. Imposta i segreti** — Edge Functions → *Secrets* (o `supabase secrets set NOME=valore`):

| Segreto | Obbligatorio | Contenuto |
|---|---|---|
| `HEVY_API_KEY` | sì | la chiave API di Hevy (Impostazioni → Sviluppatore) |
| `ALLOWED_EMAIL` | consigliato | la tua email di accesso: solo questo utente può avviare l'aggiornamento |
| `WEBHOOK_SECRET` | solo per il webhook | una stringa lunga a caso, la stessa che metterai in Hevy |

**4. Prima sincronizzazione** — Carica Dati → accedi → **Prima sincronizzazione**. Scarica tutto lo storico da Hevy e sostituisce le righe importate da CSV (prima inserisce quelle di Hevy, poi toglie le vecchie: se qualcosa va storto, non perdi nulla). Dopo, il pulsante scarica solo le novità.

## Aggiornamento automatico (facoltativo)

In Hevy → Impostazioni → Sviluppatore → Webhook:
- URL: `https://<id-progetto>.supabase.co/functions/v1/sync-hevy`
- intestazione di autorizzazione: il valore di `WEBHOOK_SECRET`

Hevy accetta **un solo URL**: sostituirebbe quello già impostato (Google Apps Script). Con il webhook ogni allenamento salvato arriva da solo nel database; il pulsante resta per recuperare eventuali buchi.

## Sicurezza

- Se la chiave API è comparsa in uno screenshot o in una chat, **revocala e generane una nuova** (Impostazioni → Sviluppatore → «Revoca chiave API») prima di salvarla come segreto.
- Il CSV di Hevy resta come alternativa in Carica Dati. Non mescolare i due metodi sullo stesso storico: dopo la prima sincronizzazione i dati arrivano da Hevy.
