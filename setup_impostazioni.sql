-- Tabelle per la pagina Setup. Esegui una volta in Supabase > SQL Editor.
-- settings: una riga per gruppo di impostazioni (chiavi usate: profile, tdee, training)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- phases: fasi nutrizionali (bulk, cut, mantenimento) con intervallo di date e target; end_date vuota = fase in corso
create table if not exists public.phases (
  id bigint generated always as identity primary key,
  phase_type text not null check (phase_type in ('bulk', 'cut', 'maintenance')),
  start_date date not null,
  end_date date,
  target_rate_kg_week numeric,
  target_kcal integer,
  target_protein_g integer,
  note text,
  created_at timestamptz not null default now(),
  constraint phases_dates_check check (end_date is null or end_date >= start_date)
);

-- events: annotazioni datate mostrate sui grafici (infortunio, viaggio, inizio integratore, cambio programma...)
create table if not exists public.events (
  id bigint generated always as identity primary key,
  event_date date not null,
  category text,
  label text not null,
  created_at timestamptz not null default now()
);

-- Lettura pubblica (grafici) e scrittura riservata agli utenti autenticati, come per le altre tabelle.
do $$
declare t text;
begin
  foreach t in array array['settings', 'phases', 'events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lettura pubblica" on public.%I', t);
    execute format('create policy "lettura pubblica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "scrittura autenticati" on public.%I', t);
    execute format('create policy "scrittura autenticati" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
