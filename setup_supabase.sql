-- Esegui una volta in Supabase > SQL Editor.
-- 1) Crea il tuo utente: Authentication > Users > Add user (email + password), poi usa quelle credenziali in "Carica Dati".
-- 2) Lettura pubblica (grafici) e scrittura riservata agli utenti autenticati.
do $$
declare t text;
begin
  foreach t in array array['bia_measurements','workouts','ringconn_weekly_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lettura pubblica" on public.%I', t);
    execute format('create policy "lettura pubblica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "scrittura autenticati" on public.%I', t);
    execute format('create policy "scrittura autenticati" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
