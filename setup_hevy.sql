-- Sincronizzazione con Hevy: colonna con l'id dell'allenamento di Hevy, così ogni allenamento
-- può essere aggiornato o eliminato senza creare duplicati. Esegui una volta nell'SQL Editor.
alter table workouts add column if not exists hevy_workout_id text;
create index if not exists workouts_hevy_workout_id_idx on workouts (hevy_workout_id);
