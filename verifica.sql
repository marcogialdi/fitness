-- ============================================================================
-- verifica.sql  ·  controllo puntuale dei numeri della dashboard
-- Incolla nell'SQL Editor di Supabase ed esegui UNA query per volta (l'editor mostra solo l'ultimo risultato).
-- Confronta la colonna "valore" con il KPI corrispondente della dashboard.
-- Tutte le date sono calcolate nel fuso Europe/Rome, come fa il sito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- QUERY 1 · Conteggi e intervalli (devono coincidere con i CSV caricati)
-- ---------------------------------------------------------------------------
select 'BIA · misurazioni' as controllo, count(*)::text as valore, min(measurement_time)::date || ' → ' || max(measurement_time)::date as nota from bia_measurements
union all select 'Allenamenti · righe (serie)', count(*)::text, min(start_time)::date || ' → ' || max(start_time)::date from workouts
union all select 'Allenamenti · sessioni', count(distinct start_time)::text, ''  from workouts
union all select 'Alimentazione · giorni con riga Total', count(*)::text, min(log_date) || ' → ' || max(log_date) from nutrition_daily where meal_group = 'Total'
union all select 'RingConn · report settimanali', count(*)::text, min(week_end) || ' → ' || max(week_end) from ringconn_weekly_reports;

-- ---------------------------------------------------------------------------
-- QUERY 2 · KPI di composizione corporea (pagina Fitness)
-- ---------------------------------------------------------------------------
with ult as (
  select
    (select weight              from bia_measurements where weight is not null              order by measurement_time desc limit 1) as peso,
    (select body_fat_percentage from bia_measurements where body_fat_percentage is not null order by measurement_time desc limit 1) as grasso,
    (select lean_body_mass      from bia_measurements where lean_body_mass is not null      order by measurement_time desc limit 1) as lbm,
    (select muscle_mass         from bia_measurements where muscle_mass is not null         order by measurement_time desc limit 1) as muscolo,
    (select visceral_fat        from bia_measurements where visceral_fat is not null        order by measurement_time desc limit 1) as visc,
    (select (measurement_time at time zone 'Europe/Rome')::date from bia_measurements where body_fat_percentage is not null order by measurement_time desc limit 1) as giorno_grasso
), p_grasso as (  -- peso del giorno della misura del grasso (o precedente), come il sito
  select weight from bia_measurements
  where weight is not null and (measurement_time at time zone 'Europe/Rome')::date <= (select giorno_grasso from ult)
  order by measurement_time desc limit 1
)
select 'Peso attuale (kg)' as kpi, peso::text as valore from ult
union all select 'Massa grassa (%)', grasso::text from ult
union all select 'Massa magra (kg)', lbm::text from ult
union all select 'Massa muscolare (kg)', muscolo::text from ult
union all select 'Grasso viscerale', visc::text from ult
union all select 'Rapporto muscolo/grasso', round((muscolo / ((select weight from p_grasso) * grasso / 100))::numeric, 3)::text from ult
-- altezza: cambia 1.80 con la tua (metri) se diversa
union all select 'FFMI (altezza 1.80 m)', round((lbm / (1.80 ^ 2) + 6.1 * (1.8 - 1.80))::numeric, 3)::text from ult;

-- ---------------------------------------------------------------------------
-- QUERY 3 · KPI allenamenti (pagina Allenamenti)
-- Finestre: "ultimi N giorni" = giorni dopo (oggi − N) fino a oggi compreso.
-- Riscaldamento (set_type = warmup) ed esercizio «Warm Up» esclusi da serie e volume.
-- ---------------------------------------------------------------------------
with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
lavoro as (
  select * from workouts
  where coalesce(set_type, '') <> 'warmup' and coalesce(exercise_title, '') !~* '^warm ?up$'
),
sess as (
  select w.start_time, (w.start_time at time zone 'Europe/Rome')::date as giorno,
         extract(epoch from (min(w.end_time) - w.start_time)) / 60 as durata_min,
         coalesce((select sum(coalesce(l.weight_kg, 0) * coalesce(l.reps, 0)) from lavoro l where l.start_time = w.start_time), 0) as volume
  from workouts w group by w.start_time
)
select 'Sessioni a settimana (28 gg / 4)' as kpi, round((count(*) filter (where giorno > (select d from oggi) - 28) / 4.0)::numeric, 2)::text as valore from sess
union all select 'Volume settimanale kg (28 gg / 4)', round((sum(volume) filter (where giorno > (select d from oggi) - 28) / 4)::numeric, 1)::text from sess
union all select 'Giorni dall''ultimo allenamento', ((select d from oggi) - max(giorno))::text from sess
union all select 'Densità kg/min (28 gg)', round((sum(volume) filter (where giorno > (select d from oggi) - 28) / nullif(sum(durata_min) filter (where giorno > (select d from oggi) - 28), 0))::numeric, 2)::text from sess
union all select 'ACWR (7 gg / media sett. 28 gg)', round((coalesce(sum(volume) filter (where giorno > (select d from oggi) - 7), 0) / nullif(sum(volume) filter (where giorno > (select d from oggi) - 28) / 4, 0))::numeric, 3)::text from sess;

-- ---------------------------------------------------------------------------
-- QUERY 4 · 1RM stimato (Epley) e record negli ultimi 30 giorni
-- Se hai cambiato gli esercizi chiave in Setup, aggiorna le espressioni qui sotto.
-- ---------------------------------------------------------------------------
with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
lift(chiave, re) as (values ('panca', '^bench press|panca piana'), ('squat', '^squat'), ('stacco', '^deadlift|^stacco'), ('military', '^overhead press|^military press|lento avanti')),
per_sessione as (
  select l.chiave, (w.start_time at time zone 'Europe/Rome')::date as giorno, max(w.weight_kg * (1 + w.reps / 30.0)) as e1rm
  from workouts w join lift l on w.exercise_title ~* l.re
  where coalesce(w.set_type, '') <> 'warmup' and w.weight_kg > 0 and w.reps > 0
  group by l.chiave, w.start_time
)
select chiave as esercizio,
       count(*) as sessioni,
       round(max(e1rm)::numeric, 1) as "1RM massimo (kg)",
       round(max(e1rm) filter (where giorno > (select d from oggi) - 30)::numeric, 1) as "max ultimi 30 gg",
       round(max(e1rm) filter (where giorno <= (select d from oggi) - 30)::numeric, 1) as "max precedente",
       case when max(e1rm) filter (where giorno > (select d from oggi) - 30) > coalesce(max(e1rm) filter (where giorno <= (select d from oggi) - 30), 1e9) then 'nuovo PR' else '' end as record
from per_sessione group by chiave order by chiave;

-- ---------------------------------------------------------------------------
-- QUERY 5 · KPI alimentazione (pagina Alimentazione)
-- Giorni COMPLETI: il giorno in corso è escluso, quindi "7 gg" = da 7 giorni fa a ieri.
-- Le percentuali dei macro usano 4·P + 4·C + 9·G (non le kcal di Cronometer).
-- ---------------------------------------------------------------------------
with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
t as (select * from nutrition_daily where meal_group = 'Total' and log_date < (select d from oggi)),
s7 as (select avg(energy_kcal) kcal, avg(protein_g) p, avg(carbs_g) c, avg(fat_g) g, count(*) n from t where log_date >= (select d from oggi) - 7)
select 'Calorie medie 7 gg' as kpi, round(kcal::numeric, 0)::text as valore, n || ' giorni' as nota from s7
union all select 'Proteine medie 7 gg (g)', round(p::numeric, 0)::text, '' from s7
union all select 'Macro % (P / C / G)', round((100 * 4 * p / (4 * p + 4 * c + 9 * g))::numeric, 0) || ' / ' || round((100 * 4 * c / (4 * p + 4 * c + 9 * g))::numeric, 0) || ' / ' || round((100 * 9 * g / (4 * p + 4 * c + 9 * g))::numeric, 0), '' from s7
union all select 'Proteine per kg', round((p / (select weight from bia_measurements where weight is not null order by measurement_time desc limit 1))::numeric, 2)::text, 'sull''ultimo peso' from s7;

-- ---------------------------------------------------------------------------
-- QUERY 6 · Qualità dei dati: anomalie da guardare
-- ---------------------------------------------------------------------------
select 'BIA · salti di peso > 2 kg tra misure consecutive' as controllo, count(*)::text as valore from (
  select weight - lag(weight) over (order by measurement_time) as dw from bia_measurements where weight is not null) x where abs(dw) > 2
union all select 'BIA · misure con peso fuori 40–150 kg', count(*)::text from bia_measurements where weight < 40 or weight > 150
union all select 'Allenamenti · sessioni con durata < 10 min o > 240 min', count(*)::text from (
  select start_time, extract(epoch from (min(end_time) - start_time)) / 60 as m from workouts group by start_time) x where m < 10 or m > 240
union all select 'Allenamenti · sessioni nel futuro', count(distinct start_time)::text from workouts where start_time > now()
union all select 'Allenamenti · serie con reps > 50 o peso > 400 kg', count(*)::text from workouts where reps > 50 or weight_kg > 400
union all select 'Alimentazione · giorni con kcal < 800 o > 6000', count(*)::text from nutrition_daily where meal_group = 'Total' and (energy_kcal < 800 or energy_kcal > 6000)
union all select 'Alimentazione · giorni senza riga Total (ultimi 60 gg)', count(*)::text from (
  select generate_series((now() at time zone 'Europe/Rome')::date - 60, (now() at time zone 'Europe/Rome')::date - 1, '1 day')::date as d) g
  where not exists (select 1 from nutrition_daily n where n.log_date = g.d and n.meal_group = 'Total');
