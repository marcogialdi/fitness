// Carica Dati: import CSV per BIA, Allenamenti e Alimentazione (Cronometer) + inserimento manuale report RingConn.
(() => {
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = s => String(s).toLowerCase().replace(/µ|μ/g, "u").trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const EN = "jan feb mar apr may jun jul aug sep oct nov dec".split(" "), IT = "gen feb mar apr mag giu lug ago set ott nov dic".split(" ");

function parseCSV(t){ // gestisce virgolette, a capo nei campi, separatore , o ;
  t = t.replace(/^\uFEFF/, ""); const first = t.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const out = []; let row = [], f = "", q = false;
  const end = () => { row.push(f); f = ""; if (row.some(x => x !== "")) out.push(row); row = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; end(); }
    else f += c;
  }
  end(); return out;
}
function pdate(v){ // ISO, "14 Oct 2026, 18:30" (anche in italiano), "14/10/2026 18:30"
  let d, m;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) { d = new Date(v.replace(" ", "T")); return isNaN(d) ? null : d.toISOString(); }
  m = v.match(/^(\d{1,2}):(\d{2})\s+([A-Za-zàù]{3})\w*\.?\s+(\d{1,2}),?\s+(\d{4})/); // "04:08 Oct 04  2026"
  if (m) { const k = m[3].toLowerCase(), mi = EN.includes(k) ? EN.indexOf(k) : IT.indexOf(k);
    if (mi >= 0) return new Date(+m[5], mi, +m[4], +m[1], +m[2]).toISOString(); }
  m = v.match(/(\d{1,2})\s+([A-Za-zàù]{3})\w*\.?,?\s+(\d{4})(?:[, ]+(\d{1,2}):(\d{2}))?/);
  if (m) { const k = m[2].toLowerCase(), mi = EN.includes(k) ? EN.indexOf(k) : IT.indexOf(k);
    if (mi >= 0) return new Date(+m[3], mi, +m[1], +(m[4] || 0), +(m[5] || 0)).toISOString(); }
  m = v.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).toISOString();
  d = new Date(v); return isNaN(d) ? null : d.toISOString();
}
function cast(v, ty){
  if (v == null) return null; v = String(v).trim(); if (v === "") return null;
  if (ty === "text") return v; if (ty === "ts") return pdate(v);
  if (ty === "date") { let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; }
  if (ty === "bool") return /^(true|vero|si|sì|yes|1)$/i.test(v) ? true : /^(false|falso|no|0)$/i.test(v) ? false : null;
  let n = +(v.includes(",") && !v.includes(".") ? v.replace(",", ".") : v.replace(/,/g, ""));
  if (isNaN(n)) { const m = v.match(/-?\d+(?:[.,]\d+)?/); n = m ? +m[0].replace(",", ".") : NaN; }
  return isNaN(n) ? null : ty === "int" ? Math.round(n) : n;
}

// Associazione automatica colonne CSV -> colonne del database (alias, nome normalizzato, mappa salvata)
function autoMap(T, head, saved = {}){
  const map = {};
  head.forEach(h => { const n = norm(h);
    map[h] = has(T.cols, saved[h]) ? saved[h] : (T.alias?.[n] || (has(T.cols, n) ? n : "") || (n === "time" ? T.req : "")); });
  return map;
}
// Righe del CSV -> record da inserire (scarta le righe senza chiave valida, unisce i duplicati sulla chiave univoca)
function buildRecs(T, head, rows, map){
  const idx = head.map((h, i) => [i, map[h]]).filter(x => x[1]); let skip = 0, dup = 0, recs = [];
  for (const r of rows) { const o = Object.fromEntries(idx.map(([i, c]) => [c, cast(r[i], T.cols[c])])); if (o[T.req] == null) skip++; else recs.push(o); }
  if (T.uniq) { const m = new Map(); recs.forEach(r => m.set(T.uniq.map(k => r[k]).join("|"), r)); dup = recs.length - m.size; recs = [...m.values()]; }
  return { recs, skip, dup };
}
// Giorni senza la riga di totale (non comparirebbero nei grafici)
function needsWarn(T, recs){
  if (!T.needs) return 0; const n = T.needs;
  const have = new Set(recs.filter(r => r[n.col] === n.val).map(r => r[n.by])), all = new Set(recs.map(r => r[n.by]));
  return [...all].filter(d => !have.has(d)).length;
}
const scopeOf = (T, recs) => { const k = T.merge.col, v = recs.map(r => r[k]).sort(); return { col: k, from: v[0], to: v[v.length - 1] }; };

// Sostituzione con backup in memoria: rimozione -> inserimento; se l'inserimento fallisce ripristina il backup.
// scope = {col, from, to} limita backup e rimozione a un intervallo (aggiornamento per periodo); null = tutta la tabella.
function makeReplace(sb){
  const chunks = (a, n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const rng = (q, sc) => sc ? q.gte(sc.col, sc.from).lte(sc.col, sc.to) : q;
  const download = (t, data) => { if (typeof document === "undefined") return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })); a.download = `backup-${t}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
  async function backupAll(t, st, sc){
    let out = [], from = 0;
    for (;;) {
      const { data, error } = await rng(sb.from(t).select("*"), sc).order("id").range(from, from + 999); if (error) throw error;
      out = out.concat(data); st(`1/4 Backup dei dati attuali: ${out.length} righe`, 0); if (data.length < 1000) break; from += 1000;
    }
    return out;
  }
  async function replaceAll(t, recs, st, sc = null){
    const { data: mx, error: e0 } = await sb.from(t).select("id").order("id", { ascending: false }).limit(1); if (e0) throw e0;
    const maxId = mx?.[0]?.id ?? 0;            // le righe inserite da qui in poi hanno id > maxId
    const old = await backupAll(t, st, sc);
    st("2/4 Rimozione dei dati attuali…", 0);
    if (old.length) { const { error } = await rng(sb.from(t).delete().lte("id", maxId), sc); if (error) throw Object.assign(error, { note: "La rimozione non è riuscita: i dati attuali sono ancora al loro posto." }); }
    try {
      let n = 0;
      for (const c of chunks(recs)) { const { error } = await sb.from(t).insert(c); if (error) throw error; n += c.length; st(`3/4 Inserimento nuovi dati: ${n} di ${recs.length}`, n / recs.length); }
    } catch (e) {
      st("Errore: ripristino dei dati precedenti…", 0);
      try {
        const d = await sb.from(t).delete().gt("id", maxId); if (d.error) throw d.error;
        for (const c of chunks(old.map(({ id, ...r }) => r))) { const { error } = await sb.from(t).insert(c); if (error) throw error; }
        e.note = "I dati precedenti sono stati ripristinati.";
      } catch (e2) { download(t, old); e.note = "Anche il ripristino è fallito (" + (e2.message || e2) + "). Ho scaricato un file di backup con i dati precedenti. Il CSV scelto contiene comunque i dati completi: riprova con lo stesso file."; }
      throw e;
    }
  }
  return { replaceAll };
}
if (typeof Page === "undefined") { module.exports = { parseCSV, pdate, cast, norm, autoMap, buildRecs, needsWarn, scopeOf, makeReplace }; return; }

const C = Page.C, w = Page.shell({ title: "Carica Dati", sub: "Aggiorna gli allenamenti da Hevy, importa i CSV di BIA e Alimentazione (Cronometer) e inserisci a mano i report settimanali RingConn." });
const $ = h => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
if (!C.SUPABASE_URL) { w.append($(`<p class="msg">Configura SUPABASE_URL e SUPABASE_ANON_KEY in assets/config.js.</p>`)); return; }
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const stack = $(`<div class="stack"></div>`); w.append(stack);
const card = h => { const e = $(`<section class="card">${h}</section>`); stack.append(e); return e; };
const hint = e => /row-level security|permission|policy/i.test(e.message || "") ? " — mancano le policy di scrittura per l'utente autenticato (vedi istruzioni SQL)" : "";
let user = null; const hooks = [];

/* ---- accesso ---- */
const au = card(`<h3>🔐 Accesso</h3><div class="row" id="au"></div>`);
function setUser(u){
  user = u; const b = au.querySelector("#au");
  b.innerHTML = u ? `<span>Connesso come <b>${esc(u.email)}</b></span><button class="pill" id="out">Esci</button>`
    : `<input type="email" id="em" placeholder="email" autocomplete="username"><input type="password" id="pw" placeholder="password" autocomplete="current-password"><button class="pill on" id="in">Accedi</button><span class="msg" id="am"></span>`;
  if (u) b.querySelector("#out").onclick = () => sb.auth.signOut();
  else b.querySelector("#in").onclick = async () => {
    const { error } = await sb.auth.signInWithPassword({ email: b.querySelector("#em").value, password: b.querySelector("#pw").value });
    if (error) b.querySelector("#am").textContent = error.message;
  };
  hooks.forEach(h => h());
}
sb.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
sb.auth.onAuthStateChange((_, s) => { if ((s?.user?.id || null) !== (user?.id || null)) setUser(s?.user || null); });

/* ---- import CSV ---- */
const { replaceAll } = makeReplace(sb);
function importer(t, alt){
  const T = C.TABLES[t], saved = JSON.parse(localStorage.getItem("map:" + t) || "{}");
  const intro = T.merge ? "Per ogni giorno presente nel CSV i dati vengono sostituiti; i giorni fuori dal periodo del file restano invariati." : "Ogni caricamento <b>sostituisce tutti i dati</b> della tabella con il contenuto del CSV.";
  const modes = T.merge ? `<p><label><input type="radio" name="m-${t}" value="merge" checked> Aggiorna solo il periodo del file <small class="msg">(consigliato)</small></label><br><label><input type="radio" name="m-${t}" value="all"> Sostituisci tutta la tabella</label></p>` : "";
  const el = card(`<h3>${T.label}${alt ? " " + alt : ""} <small class="msg">· tabella ${t}</small></h3><p class="msg">${intro}</p>${modes}<input type="file" accept=".csv,text/csv"><div class="map"></div><p><button class="pill on" disabled>Carica dati</button> <span class="st msg"></span></p><progress max="1" value="0" hidden></progress><div class="res" role="status" aria-live="polite"></div>`);
  const pb = el.querySelector("progress"), res = el.querySelector(".res"), file = el.querySelector("input[type=file]"), mp = el.querySelector(".map"), go = el.querySelector("button"), st = el.querySelector(".st");
  const mode = () => T.merge ? el.querySelector(`input[name="m-${t}"]:checked`).value : "all";
  let head = [], rows = [], map = {};
  const missing = () => !Object.values(map).includes(T.req);
  const ref = () => { go.disabled = !(user && rows.length && !missing()); if (rows.length && missing()) st.textContent = `Associa una colonna a "${T.req}" (obbligatoria).`; else if (rows.length && !user) st.textContent = "Accedi per poter caricare."; else if (!go.disabled) st.textContent = ""; };
  hooks.push(ref);
  file.onchange = async () => {
    res.className = "res"; res.textContent = "";
    const all = parseCSV(await file.files[0].text()); head = all.shift() || []; rows = all;
    map = autoMap(T, head, saved);
    const un = head.filter(h => h && !map[h]).length;
    mp.innerHTML = `<p>${rows.length} righe, ${head.length} colonne.</p><details ${un || missing() ? "open" : ""}><summary>${head.filter(h => map[h]).length} colonne associate, ${un} ignorate: clicca per vedere o modificare</summary><table><tr><th>Colonna CSV</th><th>Esempio</th><th>Colonna database</th></tr>${head.map((h, i) => `<tr><td>${esc(h)}</td><td class="msg">${esc((rows[0]?.[i] || "").slice(0, 40))}</td><td><select data-h="${esc(h)}"><option value="">— ignora —</option>${Object.keys(T.cols).map(c => `<option ${map[h] === c ? "selected" : ""}>${c}</option>`).join("")}</select></td></tr>`).join("")}</table></details>`;
    mp.querySelectorAll("select").forEach(s => s.onchange = () => { map[s.dataset.h] = s.value; ref(); });
    ref();
  };
  go.onclick = async () => {
    const { recs, skip, dup } = buildRecs(T, head, rows, map);
    if (!recs.length) { res.className = "res err"; res.textContent = `✖ Nessuna riga valida: il campo "${T.req}" non è interpretabile.`; return; }
    const sc = mode() === "merge" ? scopeOf(T, recs) : null;
    const count = () => { let q = sb.from(t).select("*", { count: "exact", head: true }); if (sc) q = q.gte(sc.col, sc.from).lte(sc.col, sc.to); return q; };
    const { count: before, error: e0 } = await count();
    if (e0) { res.className = "res err"; res.textContent = "✖ Impossibile leggere la tabella: " + e0.message + hint(e0); return; }
    const miss = needsWarn(T, recs);
    const q = (sc ? `Aggiornare "${T.label}" dal ${sc.from} al ${sc.to}?\n\nRighe attuali nel periodo: ${before ?? "?"}` : `Sostituire TUTTI i dati di "${T.label}"?\n\nRighe attuali: ${before ?? "?"}`)
      + `\nRighe nuove: ${recs.length}${skip ? ` (${skip} scartate: chiave non valida)` : ""}${dup ? ` (${dup} duplicate unite)` : ""}`
      + (miss ? `\n\n⚠ ${miss} giorni non hanno la riga "${T.needs.val}" e non compariranno nei grafici.` : "")
      + `\n\n${sc ? "Le righe del periodo verranno sostituite, il resto non viene toccato.\n" : ""}L'operazione non è annullabile.`;
    if (!confirm(q)) return;
    go.disabled = true; file.disabled = true; st.className = "st msg"; res.className = "res"; res.textContent = ""; pb.hidden = false; pb.value = 0;
    const t0 = Date.now();
    try {
      await replaceAll(t, recs, (m, f) => { st.textContent = m; if (f != null) pb.value = f; }, sc);
      st.textContent = "4/4 Verifica dei dati salvati…";
      const { count: n, error: ec } = await count(); if (ec) throw ec;
      const { data: lt } = await sb.from(t).select(T.req).order(T.req, { ascending: false }).limit(1);
      const lv = lt?.[0]?.[T.req], isDate = T.cols[T.req] === "date";
      const ult = lv ? (isDate ? new Date(lv + "T12:00:00").toLocaleDateString("it-IT") : new Date(lv).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })) : "n/d";
      localStorage.setItem("map:" + t, JSON.stringify(map));
      const ok = n === recs.length;
      res.className = "res " + (ok ? "ok" : "warn");
      res.innerHTML = `<b>${ok ? "✔ Caricamento completato" : "⚠ Caricamento terminato, ma i conteggi non coincidono"}</b><br>Righe ${sc ? `nel periodo ${esc(sc.from)} → ${esc(sc.to)}` : "nel database"}: <b>${n}</b> (attese ${recs.length})${skip ? ` · scartate dal file: ${skip}` : ""}${dup ? ` · duplicate unite: ${dup}` : ""}${miss ? ` · giorni senza "${esc(T.needs.val)}": ${miss}` : ""}<br>Dato più recente nella tabella: <b>${esc(ult)}</b> · completato alle ${new Date().toLocaleTimeString("it-IT")} in ${Math.round((Date.now() - t0) / 1000)} s<br><span class="msg">Ricarica le altre pagine per vedere i nuovi dati nei grafici.</span>`;
      st.textContent = ""; rows = []; mp.innerHTML = ""; file.value = "";
    } catch (e) {
      res.className = "res err";
      res.innerHTML = `<b>✖ Caricamento non riuscito</b><br>${esc(e.message || e)}${esc(hint(e))}<br><span class="msg">${esc(e.note || "")}</span>`;
      st.textContent = "";
    }
    pb.hidden = true; file.disabled = false;
    ref();
  };
}
importer("bia_measurements");
/* ---- Hevy: sincronizzazione degli allenamenti ---- */
const hv = card(`<h3>🏋️ Allenamenti · Hevy <small class="msg">· sincronizzazione automatica</small></h3><p class="msg" id="hv-i">Controllo lo stato…</p><p><button class="pill on" id="hv-go" disabled>Aggiorna da Hevy</button> <button class="pill" id="hv-full" disabled title="Rilegge tutto lo storico da Hevy">Risincronizza tutto</button> <span class="st msg" id="hv-st"></span></p><progress hidden></progress><div class="res" id="hv-r" role="status" aria-live="polite"></div>`);
const hq = s => hv.querySelector(s), hres = hq("#hv-r");
let hlast = null, hready = false;
const fmtDT = t => new Date(t).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
async function hevyInfo(){
  const { data, error } = await sb.from("settings").select("value").eq("key", "hevy_sync").limit(1);
  hlast = !error && data?.[0]?.value || null;
  const c = await sb.from("workouts").select("*", { count: "exact", head: true }).is("hevy_workout_id", null);
  hready = !c.error;
  hq("#hv-i").innerHTML = !hready ? `<b>Manca la colonna <code>hevy_workout_id</code>:</b> esegui <b>setup_hevy.sql</b> nell'SQL Editor di Supabase e ricarica la pagina.`
    : hlast ? `Ultimo aggiornamento da Hevy: <b>${fmtDT(hlast.at)}</b> · ${hlast.workouts} allenamenti${hlast.mode === "full" ? " (sincronizzazione completa)" : " aggiornati"}. Il pulsante scarica solo le novità.`
    : `Mai sincronizzato. La <b>prima sincronizzazione</b> scarica tutto lo storico da Hevy${c.count ? ` e sostituisce le ${c.count} righe importate da CSV` : ""}.`;
  hq("#hv-go").textContent = hlast ? "Aggiorna da Hevy" : "Prima sincronizzazione";
  hooks.forEach(h => h());
}
hooks.push(() => { hq("#hv-go").disabled = !(user && hready); hq("#hv-full").disabled = !(user && hready && hlast); });
async function hevySync(full){
  const first = !hlast; let replaceLegacy = false; hres.className = "res"; hres.textContent = "";
  if (first || full) {
    const c = await sb.from("workouts").select("*", { count: "exact", head: true }).is("hevy_workout_id", null);
    if (c.count > 0) {
      if (!confirm(`Nel database ci sono ${c.count} righe di allenamenti importate da CSV.\n\nLa sincronizzazione scarica tutto lo storico da Hevy e SOSTITUISCE quelle righe. I dati di Hevy vengono inseriti prima: se qualcosa va storto, le righe esistenti restano.\n\nContinuare?`)) return;
      replaceLegacy = true;
    } else if (full && !confirm("Rileggere tutto lo storico da Hevy?")) return;
  }
  const btns = [hq("#hv-go"), hq("#hv-full")], pb = hq("progress"); btns.forEach(b => b.disabled = true); pb.hidden = false; pb.removeAttribute("value");
  hq("#hv-st").textContent = first || full ? "Scarico lo storico da Hevy (può richiedere circa un minuto)…" : "Controllo le novità su Hevy…";
  const t0 = Date.now();
  try {
    const { data, error } = await sb.functions.invoke("sync-hevy", { body: { mode: first || full ? "full" : "incremental", replaceLegacy } });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j?.error) m = j.error; } catch (_) { /* nessun dettaglio */ }
      if (/not found|404|Failed to send|fetch/i.test(m) && !/Hevy/.test(m)) m = "La funzione «sync-hevy» non risponde: è stata distribuita su Supabase? (vedi le istruzioni in HEVY.md)"; throw new Error(m); }
    if (!data?.ok) throw new Error(data?.error || "Risposta non valida dalla funzione");
    hq("#hv-st").textContent = "Verifica dei dati salvati…";
    const { count: n } = await sb.from("workouts").select("*", { count: "exact", head: true });
    const { data: lt } = await sb.from("workouts").select("start_time").order("start_time", { ascending: false }).limit(1);
    hres.className = "res " + (data.partial ? "warn" : "ok");
    hres.innerHTML = `<b>${data.partial ? "⚠ Aggiornamento interrotto per tempo: premi di nuovo il pulsante" : "✔ Aggiornamento completato"}</b><br>Allenamenti scaricati: <b>${data.workouts}</b> (${data.sets} serie)${data.deleted ? ` · eliminati su Hevy: <b>${data.deleted}</b>` : ""}${data.legacy_removed ? ` · righe CSV sostituite: <b>${data.legacy_removed}</b>` : ""}<br>Righe totali in tabella: <b>${n}</b> · ultimo allenamento: <b>${lt?.[0] ? fmtDT(lt[0].start_time) : "n/d"}</b> · completato alle ${new Date().toLocaleTimeString("it-IT")} in ${Math.round((Date.now() - t0) / 1000)} s<br><span class="msg">${data.workouts ? "Ricarica le altre pagine per vedere i nuovi dati." : "Nessun allenamento nuovo da Hevy."}</span>`;
  } catch (e) { hres.className = "res err"; hres.innerHTML = `<b>✖ Aggiornamento non riuscito</b><br>${esc(e.message || e)}`; }
  pb.hidden = true; hq("#hv-st").textContent = ""; await hevyInfo();
}
hq("#hv-go").onclick = () => hevySync(false); hq("#hv-full").onclick = () => hevySync(true);
hevyInfo();
importer("workouts", "· alternativa da CSV"); importer("nutrition_daily");

/* ---- RingConn: inserimento manuale ---- */
const RT = "ringconn_weekly_reports", F = [
  ["week_start", "Inizio settimana", "date"], ["week_end", "Fine settimana", "date"], ["label", "Etichetta", "text"],
  ["sleep_score", "Sleep score", "number"], ["sleep_duration", "Durata sonno media", "text"], ["sleep_hr_avg", "FC media nel sonno (bpm)", "number"],
  ["activity_score", "Activity score", "number"], ["steps_avg", "Passi medi", "number"], ["calories_avg", "Calorie attive medie", "number"], ["stress_score", "Stress score", "number"]];
const rc = card(`<h3>💍 RingConn <small class="msg">· report settimanale (inserimento manuale)</small></h3><div class="row">${F.map(([k, l, ty]) => `<label class="f">${l}<input type="${ty}" data-k="${k}"${ty === "number" ? ' step="any"' : ""}></label>`).join("")}</div><p><button class="pill on" id="sv" disabled>Salva report</button> <button class="pill" id="cl">Nuovo / svuota</button> <span class="msg" id="rs"></span></p><div id="rl"></div>`);
const inp = k => rc.querySelector(`[data-k=${k}]`), rs = rc.querySelector("#rs"), sv = rc.querySelector("#sv");
let editId = null, recent = [];
hooks.push(() => sv.disabled = !user);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dm = d => d.split("-").reverse().slice(0, 2).join("/");
inp("week_start").onchange = () => { const s = inp("week_start").value; if (!s) return; if (!inp("week_end").value || !editId) inp("week_end").value = addDays(s, 6); if (!inp("label").value || !editId) inp("label").value = `${dm(s)} - ${dm(inp("week_end").value)}`; };
const clear = () => { editId = null; F.forEach(([k]) => inp(k).value = ""); rs.textContent = ""; };
rc.querySelector("#cl").onclick = clear;
async function list(){
  const { data, error } = await sb.from(RT).select("*").order("week_start", { ascending: false }).limit(10);
  if (error) { rc.querySelector("#rl").innerHTML = `<p class="err">Errore lettura: ${esc(error.message)}</p>`; return; }
  recent = data;
  if (data[0]) { inp("sleep_duration").placeholder = "es. " + data[0].sleep_duration; inp("label").placeholder = "es. " + data[0].label; }
  rc.querySelector("#rl").innerHTML = `<p class="msg">Ultimi report (clic su ✎ per modificare):</p><table><tr><th></th><th>Settimana</th><th>Sleep</th><th>Durata</th><th>FC</th><th>Activity</th><th>Passi</th><th>Kcal</th><th>Stress</th><th></th></tr>${data.map(r => `<tr><td><button class="mini" data-e="${r.id}" title="Modifica">✎</button></td><td>${esc(r.week_start)} → ${esc(r.week_end)}</td><td>${r.sleep_score ?? ""}</td><td>${esc(r.sleep_duration)}</td><td>${r.sleep_hr_avg ?? ""}</td><td>${r.activity_score ?? ""}</td><td>${r.steps_avg ?? ""}</td><td>${r.calories_avg ?? ""}</td><td>${r.stress_score ?? ""}</td><td><button class="mini" data-d="${r.id}" title="Elimina">🗑</button></td></tr>`).join("")}</table>`;
}
rc.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.e) { const r = recent.find(x => x.id == b.dataset.e); editId = r.id; F.forEach(([k]) => inp(k).value = r[k] ?? ""); rs.textContent = "Modifica del report selezionato."; scrollTo({ top: rc.offsetTop, behavior: "smooth" }); }
  if (b.dataset.d) { if (!user) { rs.textContent = "Accedi per eliminare."; return; } if (!confirm("Eliminare questo report?")) return;
    const { error } = await sb.from(RT).delete().eq("id", b.dataset.d); rs.textContent = error ? "Errore: " + error.message + hint(error) : "Report eliminato."; list(); }
});
sv.onclick = async () => {
  const rec = {}; for (const [k, , ty] of F) { const v = inp(k).value.trim(); rec[k] = v === "" ? null : ty === "number" ? cast(v, k === "sleep_score" || k.endsWith("_avg") || k.endsWith("score") ? "int" : "int") : v; }
  if (!rec.week_start || !rec.week_end) { rs.textContent = "Inizio e fine settimana sono obbligatori."; rs.className = "msg err"; return; }
  let id = editId;
  if (!id) { const ex = recent.find(r => r.week_start === rec.week_start) || (await sb.from(RT).select("id").eq("week_start", rec.week_start).limit(1)).data?.[0];
    if (ex) { if (!confirm("Esiste già un report per questa settimana. Sovrascriverlo?")) return; id = ex.id; } }
  const { error } = id ? await sb.from(RT).update(rec).eq("id", id) : await sb.from(RT).insert(rec);
  if (error) { rs.textContent = "Errore: " + error.message + hint(error); rs.className = "msg err"; return; }
  const wk = `${rec.week_start} → ${rec.week_end}`; clear(); rs.className = "msg ok"; rs.textContent = `✔ Report ${id ? "aggiornato" : "salvato"} (${wk}) alle ${new Date().toLocaleTimeString("it-IT")}`; list();
};
list(); setUser(user);
})();
