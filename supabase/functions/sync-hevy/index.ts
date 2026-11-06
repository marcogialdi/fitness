// @ts-nocheck
// Edge Function «sync-hevy»: porta gli allenamenti da Hevy alla tabella workouts.
//  · dal sito (pulsante «Aggiorna da Hevy»): richiede un utente autenticato di Supabase
//  · da webhook di Hevy (nuovo allenamento salvato): richiede l'intestazione WEBHOOK_SECRET
// Segreti da impostare (mai nel codice del sito): HEVY_API_KEY, e facoltativi WEBHOOK_SECRET, ALLOWED_EMAIL.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili nelle Edge Functions.
// Distribuire con la verifica JWT DISATTIVATA (i controlli di accesso sono qui sotto).

const HEVY = "https://api.hevyapp.com", OVERLAP_MS = 5 * 60 * 1000, BUDGET_MS = 110000;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => { a = String(a || ""); b = String(b || ""); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };

// Un allenamento di Hevy -> righe della tabella workouts (una per serie), stesse colonne del CSV di esportazione
export function mapWorkout(w) {
  const rows = [];
  for (const ex of w.exercises || []) for (const s of ex.sets || []) rows.push({
    title: w.title || null, start_time: w.start_time, end_time: w.end_time, description: w.description || null,
    exercise_title: ex.title || null, superset_id: ex.supersets_id ?? null, exercise_notes: ex.notes || null,
    set_index: s.index ?? null, set_type: s.type ?? null, weight_kg: s.weight_kg ?? null, reps: s.reps ?? null,
    distance_km: s.distance_meters == null ? null : s.distance_meters / 1000, duration_seconds: s.duration_seconds ?? null, rpe: s.rpe ?? null,
    hevy_workout_id: w.id });
  return rows;
}

export function hevyClient(fetchFn, key) {
  return async function get(path, params = {}) {
    const url = new URL(HEVY + path); for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    for (let t = 0; t < 4; t++) {
      const r = await fetchFn(url.toString(), { headers: { "api-key": key, accept: "application/json" } });
      if (r.status === 429) { await sleep((+r.headers.get("retry-after") || 2) * 1000); continue; }
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error("Hevy ha rifiutato la chiave API (HEVY_API_KEY errata o scaduta)."), { code: 502 });
      if (r.status === 404) return null;
      if (!r.ok) throw Object.assign(new Error(`Hevy ha risposto ${r.status}`), { code: 502 });
      return r.json();
    }
    throw Object.assign(new Error("Hevy: troppe richieste, riprova tra qualche minuto."), { code: 429 });
  };
}

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const must = r => { if (r.error) throw Object.assign(new Error(r.error.message), { code: 500 }); return r; };

// Scrive un allenamento: prima inserisce le righe nuove, poi toglie le vecchie (se l'inserimento fallisce non si perde nulla)
export async function writeWorkout(db, w) {
  const old = (must(await db.from("workouts").select("id").eq("hevy_workout_id", w.id)).data || []).map(r => r.id), rows = mapWorkout(w);
  for (const c of chunk(rows, 500)) must(await db.from("workouts").insert(c));
  for (const c of chunk(old, 200)) must(await db.from("workouts").delete().in("id", c));
  return rows.length;
}
export async function deleteWorkouts(db, ids) { for (const c of chunk(ids, 100)) must(await db.from("workouts").delete().in("hevy_workout_id", c)); }

// Sincronizzazione dagli eventi di Hevy (aggiornati/eliminati dopo «since»); ordine dal più recente: vale il primo evento di ogni allenamento
export async function syncEvents({ db, get, since, now = () => Date.now(), budget = BUDGET_MS }) {
  const t0 = now(), seen = new Set(), out = { workouts: 0, sets: 0, deleted: 0, pages: 0, partial: false, fetched_ids: [] };
  for (let page = 1, count = 1; page <= count; page++) {
    if (now() - t0 > budget) { out.partial = true; break; }
    const r = await get("/v1/workouts/events", { page, pageSize: 10, since });
    if (!r) throw Object.assign(new Error("Hevy: risposta vuota"), { code: 502 });
    count = r.page_count || 0; out.pages++;
    const del = [];
    for (const e of r.events || []) {
      const id = e.type === "deleted" ? e.id : e.workout?.id; if (!id || seen.has(id)) continue; seen.add(id);
      if (e.type === "deleted") del.push(id); else { out.sets += await writeWorkout(db, e.workout); out.workouts++; out.fetched_ids.push(id); }
    }
    if (del.length) { await deleteWorkouts(db, del); out.deleted += del.length; }
  }
  return out;
}

export async function handle(req, env, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Metodo non consentito" }, 405);
  const { db, fetchFn } = deps;
  if (!env.HEVY_API_KEY) return json({ ok: false, error: "Manca il segreto HEVY_API_KEY nella funzione." }, 500);
  const h = req.headers.get("authorization") || "", token = h.replace(/^Bearer\s+/i, "");
  let kind = null;
  if (env.WEBHOOK_SECRET && token && same(token, env.WEBHOOK_SECRET)) kind = "webhook";
  else if (token) {
    const { data, error } = await db.auth.getUser(token);
    if (!error && data?.user && (!env.ALLOWED_EMAIL || String(data.user.email).toLowerCase() === env.ALLOWED_EMAIL.toLowerCase())) kind = "user";
  }
  if (!kind) return json({ ok: false, error: "Accesso non autorizzato: accedi dalla pagina Carica Dati." }, 401);
  let body = {}; try { body = await req.json(); } catch (_) { /* corpo vuoto */ }
  const get = hevyClient(fetchFn, env.HEVY_API_KEY), t0 = Date.now();
  try {
    if (kind === "webhook") {                                              // Hevy: {"workoutId": "..."} -> aggiorna quell'allenamento
      const id = body.workoutId; if (!id) return json({ ok: false, error: "workoutId mancante" }, 400);
      const w = await get("/v1/workouts/" + encodeURIComponent(id));
      if (!w) { await deleteWorkouts(db, [id]); return json({ ok: true, workouts: 0, deleted: 1 }); }
      return json({ ok: true, workouts: 1, sets: await writeWorkout(db, w.workout || w) });
    }
    const full = body.mode === "full", prev = (await db.from("settings").select("value").eq("key", "hevy_sync").maybeSingle()).data?.value;
    const since = full || !prev?.last_sync ? "1970-01-01T00:00:00Z" : prev.last_sync, started = new Date(t0 - OVERLAP_MS).toISOString();
    const r = await syncEvents({ db, get, since });
    let legacy = 0;
    if (!r.partial && since.startsWith("1970") && body.replaceLegacy && r.workouts > 0) {  // storico importato da CSV (senza id Hevy): sostituito dai dati di Hevy
      const n = must(await db.from("workouts").select("id", { count: "exact", head: true }).is("hevy_workout_id", null)).count || 0;
      must(await db.from("workouts").delete().is("hevy_workout_id", null)); legacy = n;
    }
    if (!r.partial) must(await db.from("settings").upsert({ key: "hevy_sync", value: { last_sync: started, at: new Date().toISOString(), mode: full || !prev ? "full" : "incremental", workouts: r.workouts, sets: r.sets, deleted: r.deleted }, updated_at: new Date().toISOString() }));
    return json({ ok: true, mode: since.startsWith("1970") ? "full" : "incremental", since, workouts: r.workouts, sets: r.sets, deleted: r.deleted, legacy_removed: legacy, partial: r.partial, pages: r.pages, ms: Date.now() - t0 });
  } catch (e) { return json({ ok: false, error: e.message || String(e) }, e.code || 500); }
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const env = { HEVY_API_KEY: Deno.env.get("HEVY_API_KEY"), WEBHOOK_SECRET: Deno.env.get("WEBHOOK_SECRET"), ALLOWED_EMAIL: Deno.env.get("ALLOWED_EMAIL") };
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  Deno.serve(req => handle(req, env, { db, fetchFn: fetch }));
}
