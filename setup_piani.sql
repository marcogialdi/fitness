-- Piani alimentari collegati alle fasi del Setup. Esegui una volta in Supabase > SQL Editor (dopo setup_impostazioni.sql).
--
-- foods:      alimenti con valori per 100 g (crudo o secco, ceci cotti). unit_g = grammi di un pezzo (uovo, fetta di Wasa, frutto);
--             se è vuoto le quantità dei piani sono in grammi. unit_label = "singolare|plurale". estimate = quantità solo stimata.
-- meal_plans: un piano per riga. phase_id lo lega a una fase del Setup (phases), phase_type è bulk, cut o maintenance.
--             days contiene i 7 giorni con i pasti e le quantità; replaces_id punta alla versione precedente (serve al confronto).
--             status: active = piano in uso, draft = bozza, archived = vecchia versione.
create table if not exists public.foods (
  id text primary key,
  name text not null,
  kcal numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  unit_g numeric,
  unit_label text,
  estimate boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id bigint generated always as identity primary key,
  phase_id bigint references public.phases(id) on delete set null,
  phase_type text not null check (phase_type in ('bulk', 'cut', 'maintenance')),
  name text not null,
  version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  replaces_id bigint references public.meal_plans(id) on delete set null,
  targets jsonb not null default '{}'::jsonb,
  meals jsonb not null default '[]'::jsonb,
  days jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meal_plans_phase_idx on public.meal_plans (phase_id);

-- Lettura pubblica e scrittura riservata agli utenti autenticati, come per le altre tabelle.
do $$
declare t text;
begin
  foreach t in array array['foods', 'meal_plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lettura pubblica" on public.%I', t);
    execute format('create policy "lettura pubblica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "scrittura autenticati" on public.%I', t);
    execute format('create policy "scrittura autenticati" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Dati iniziali: gli alimenti e il piano BULK (versione 1 = file Excel, versione 2 = ricalibrato, quella attiva).
-- Il piano viene collegato alla fase di bulk più recente del Setup (se non ce n'è nessuna resta scollegato: lo colleghi dopo con l'UPDATE in fondo).
insert into public.foods (id, name, kcal, protein_g, carbs_g, fat_g, unit_g, unit_label, estimate) values
  ('dattero', 'Dattero', 277, 1.8, 75, 0.2, 25, null, false),
  ('avena', 'Fiocchi d''avena', 389, 16.9, 66.3, 6.9, null, null, false),
  ('yogurt', 'Yogurt greco 0%', 59, 10.2, 3.6, 0.4, null, null, false),
  ('soia', 'Latte di soia', 39, 3.3, 2.5, 1.8, null, null, false),
  ('chia', 'Semi di chia', 486, 16.5, 42, 30.7, null, null, false),
  ('burro', 'Burro d''arachidi', 588, 25, 20, 50, null, null, false),
  ('whey', 'Whey', 400, 80, 6, 5, null, null, false),
  ('cacao', 'Cacao amaro', 228, 19.6, 57.9, 13.7, null, null, false),
  ('frutto', 'Frutto (banana o mela)', 70, 0.7, 17, 0.3, 150, null, false),
  ('banana', 'Banana', 89, 1.1, 22.8, 0.3, 120, null, false),
  ('mela', 'Mela', 52, 0.3, 13.8, 0.2, 150, null, false),
  ('wasa', 'Wasa', 330, 10, 58, 2, 10, 'fetta|fette', false),
  ('avocado', 'Avocado', 160, 2, 8.5, 14.7, null, null, false),
  ('pasta_int', 'Pasta integrale (cruda)', 335, 13.5, 64, 2.5, null, null, false),
  ('pasta_farro', 'Pasta di farro (cruda)', 340, 14, 66, 2.5, null, null, false),
  ('riso', 'Riso basmati (crudo)', 350, 8.5, 77, 0.6, null, null, false),
  ('ceci', 'Ceci (cotti)', 164, 8.9, 27.4, 2.6, null, null, false),
  ('salmone', 'Salmone', 208, 20.4, 0, 13.4, null, null, false),
  ('sgombro', 'Sgombro', 205, 18.6, 0, 13.9, null, null, false),
  ('segale', 'Pane di segale', 259, 8.5, 48, 3.3, null, null, false),
  ('olio', 'Olio EVO', 884, 0, 0, 100, null, null, false),
  ('uovo', 'Uova', 143, 12.6, 0.7, 9.5, 55, 'uovo|uova', false),
  ('albume', 'Albume', 52, 10.9, 0.7, 0.2, null, null, false),
  ('verdura', 'Verdura mista', 20, 1.5, 3, 0.2, null, null, true),
  ('caffe', 'Caffè', 2, 0.1, 0, 0, 0, null, false)
on conflict (id) do nothing;

do $$
declare ph bigint; v1 bigint;
begin
  if exists (select 1 from public.meal_plans) then return; end if;
  select id into ph from public.phases where phase_type = 'bulk' order by start_date desc limit 1;
    insert into public.meal_plans (phase_id, phase_type, name, version, status, replaces_id, targets, meals, days, notes)
    values (ph, 'bulk', 'Piano originale (Excel)', 1, 'archived', null, $j${"kg":79,"protein_per_kg":2,"fat_per_kg":0.8}$j$::jsonb, $j$[["pre","Pre-allenamento","03:30"],["col","Colazione / post-allenamento","05:40"],["sm","Spuntino mattina","09:30"],["pra","Pranzo","13:00"],["sp","Spuntino pomeriggio","16:30"],["cena","Cena","20:00"]]$j$::jsonb, $j$[{"nome":"Lunedì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":30},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":170},{"f":"wasa","n":4},{"f":"frutto","n":1}],"pra":[{"f":"pasta_int","n":90},{"f":"ceci","n":200},{"f":"verdura","n":200},{"f":"olio","n":5}],"cena":[{"f":"salmone","n":180},{"f":"segale","n":80},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Martedì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":30},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":170},{"f":"wasa","n":4},{"f":"frutto","n":1}],"pra":[{"f":"riso","n":90},{"f":"ceci","n":200},{"f":"verdura","n":200},{"f":"olio","n":5}],"cena":[{"f":"uovo","n":3},{"f":"albume","n":100},{"f":"segale","n":80},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Mercoledì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":30},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":170},{"f":"wasa","n":4},{"f":"frutto","n":1}],"pra":[{"f":"pasta_farro","n":90},{"f":"ceci","n":200},{"f":"verdura","n":200},{"f":"olio","n":5}],"cena":[{"f":"sgombro","n":180},{"f":"wasa","n":6},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Giovedì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":30},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":170},{"f":"wasa","n":4},{"f":"frutto","n":1}],"pra":[{"f":"riso","n":90},{"f":"ceci","n":200},{"f":"verdura","n":200},{"f":"olio","n":5}],"cena":[{"f":"salmone","n":180},{"f":"segale","n":80},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Venerdì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":30},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":170},{"f":"wasa","n":4},{"f":"frutto","n":1}],"pra":[{"f":"pasta_int","n":90},{"f":"ceci","n":200},{"f":"verdura","n":200},{"f":"olio","n":5}],"cena":[{"f":"uovo","n":2},{"f":"albume","n":150},{"f":"wasa","n":6},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Sabato","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":30},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":170},{"f":"wasa","n":4},{"f":"frutto","n":1}],"pra":[{"f":"segale","n":100},{"f":"ceci","n":250},{"f":"verdura","n":200},{"f":"olio","n":5}],"cena":[{"f":"sgombro","n":180},{"f":"segale","n":80},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Domenica","tgt":{"kcal":2300,"tipo":"Corsa (cardio)"},"pre":"Pre-corsa","meals":{"pre":[{"f":"banana","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":50},{"f":"yogurt","n":150},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":10},{"f":"cacao","n":5},{"f":"whey","n":30},{"f":"mela","n":1}],"sm":[{"f":"yogurt","n":170},{"f":"mela","n":1}],"pra":[{"f":"ceci","n":250},{"f":"segale","n":70},{"f":"verdura","n":200},{"f":"olio","n":5}],"sp":[{"f":"whey","n":30},{"f":"wasa","n":3}],"cena":[{"f":"salmone","n":180},{"f":"wasa","n":5},{"f":"avocado","n":70},{"f":"verdura","n":200}]}}]$j$::jsonb, 'Piano di partenza dal file Excel, prima della ricalibrazione.')
    returning id into v1;
    insert into public.meal_plans (phase_id, phase_type, name, version, status, replaces_id, targets, meals, days, notes)
    values (ph, 'bulk', 'Ricalibrato', 2, 'active', v1, $j${"kg":79,"protein_per_kg":2,"fat_per_kg":0.8}$j$::jsonb, $j$[["pre","Pre-allenamento","03:30"],["col","Colazione / post-allenamento","05:40"],["sm","Spuntino mattina","09:30"],["pra","Pranzo","13:00"],["sp","Spuntino pomeriggio","16:30"],["cena","Cena","20:00"]]$j$::jsonb, $j$[{"nome":"Lunedì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":40},{"f":"yogurt","n":100},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":25},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":140},{"f":"wasa","n":3},{"f":"frutto","n":1}],"pra":[{"f":"pasta_int","n":90},{"f":"ceci","n":180},{"f":"verdura","n":200},{"f":"olio","n":7}],"cena":[{"f":"salmone","n":160},{"f":"segale","n":80},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Martedì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":40},{"f":"yogurt","n":100},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":25},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":140},{"f":"wasa","n":3},{"f":"frutto","n":1}],"pra":[{"f":"riso","n":90},{"f":"ceci","n":210},{"f":"verdura","n":200},{"f":"olio","n":9}],"cena":[{"f":"uovo","n":3},{"f":"albume","n":110},{"f":"segale","n":55},{"f":"avocado","n":80},{"f":"verdura","n":200}]}},{"nome":"Mercoledì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":40},{"f":"yogurt","n":100},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":25},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":140},{"f":"wasa","n":3},{"f":"frutto","n":1}],"pra":[{"f":"pasta_farro","n":90},{"f":"ceci","n":200},{"f":"verdura","n":200},{"f":"olio","n":6}],"cena":[{"f":"sgombro","n":170},{"f":"wasa","n":5},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Giovedì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":40},{"f":"yogurt","n":100},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":25},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":140},{"f":"wasa","n":3},{"f":"frutto","n":1}],"pra":[{"f":"riso","n":85},{"f":"ceci","n":180},{"f":"verdura","n":200},{"f":"olio","n":7}],"cena":[{"f":"salmone","n":170},{"f":"segale","n":75},{"f":"avocado","n":60},{"f":"verdura","n":200}]}},{"nome":"Venerdì","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":40},{"f":"yogurt","n":100},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":25},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":140},{"f":"wasa","n":3},{"f":"frutto","n":1}],"pra":[{"f":"pasta_int","n":90},{"f":"ceci","n":220},{"f":"verdura","n":200},{"f":"olio","n":11}],"cena":[{"f":"uovo","n":2},{"f":"albume","n":120},{"f":"wasa","n":6},{"f":"avocado","n":80},{"f":"verdura","n":200}]}},{"nome":"Sabato","tgt":{"kcal":2500,"tipo":"Pesi"},"meals":{"pre":[{"f":"dattero","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":40},{"f":"yogurt","n":100},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"frutto","n":1}],"sm":[{"f":"whey","n":25},{"f":"frutto","n":1}],"sp":[{"f":"yogurt","n":140},{"f":"wasa","n":3},{"f":"frutto","n":1}],"pra":[{"f":"segale","n":100},{"f":"ceci","n":230},{"f":"verdura","n":200},{"f":"olio","n":4}],"cena":[{"f":"sgombro","n":170},{"f":"segale","n":75},{"f":"avocado","n":55},{"f":"verdura","n":200}]}},{"nome":"Domenica","tgt":{"kcal":2300,"tipo":"Corsa (cardio)"},"pre":"Pre-corsa","meals":{"pre":[{"f":"banana","n":1},{"f":"caffe","n":1}],"col":[{"head":"Porridge"},{"f":"avena","n":45},{"f":"yogurt","n":130},{"f":"soia","n":120},{"f":"chia","n":10},{"f":"burro","n":5},{"f":"cacao","n":5},{"f":"whey","n":25},{"f":"mela","n":1}],"sm":[{"f":"yogurt","n":160},{"f":"mela","n":1}],"pra":[{"f":"ceci","n":240},{"f":"segale","n":70},{"f":"verdura","n":200},{"f":"olio","n":4}],"sp":[{"f":"whey","n":20},{"f":"wasa","n":3}],"cena":[{"f":"salmone","n":160},{"f":"wasa","n":4},{"f":"avocado","n":75},{"f":"verdura","n":200}]}}]$j$::jsonb, 'Quantità ricalibrate per rispettare 2500 kcal (pesi) e 2300 kcal (corsa) con proteine 2 g/kg e grassi 0,8 g/kg.');
end $$;

-- Per collegare un piano a una fase (id della fase dalla pagina Setup):
--   update public.meal_plans set phase_id = 1 where id = 2;
