-- Circonferenze corporee. Esegui una volta in Supabase > SQL Editor.
-- Una riga per data di misurazione, una colonna per sede (in cm); le sedi non misurate restano vuote.
create table if not exists public.body_measurements (
  id bigint generated always as identity primary key,
  measured_on date not null unique,
  neck_cm numeric(5,1),
  shoulders_cm numeric(5,1),
  chest_cm numeric(5,1),
  waist_cm numeric(5,1),
  hips_cm numeric(5,1),
  arm_r_cm numeric(5,1),
  arm_l_cm numeric(5,1),
  forearm_r_cm numeric(5,1),
  forearm_l_cm numeric(5,1),
  thigh_r_cm numeric(5,1),
  thigh_l_cm numeric(5,1),
  calf_r_cm numeric(5,1),
  calf_l_cm numeric(5,1),
  note text,
  created_at timestamptz not null default now()
);

-- Lettura pubblica (grafici) e scrittura riservata agli utenti autenticati, come per le altre tabelle.
alter table public.body_measurements enable row level security;
drop policy if exists "lettura pubblica" on public.body_measurements;
create policy "lettura pubblica" on public.body_measurements for select to anon, authenticated using (true);
drop policy if exists "scrittura autenticati" on public.body_measurements;
create policy "scrittura autenticati" on public.body_measurements for all to authenticated using (true) with check (true);
