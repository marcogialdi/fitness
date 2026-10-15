// Setup: profilo, TDEE dichiarato, fasi nutrizionali, esercizi chiave / gruppi muscolari, annotazioni.
(async () => {
const C = Page.C, S = Page.S;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = h => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const today = () => new Date().toLocaleDateString("sv-SE");
const addD = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const fmtD = d => d ? d.split("-").reverse().join("/") : "";
const num = v => { v = String(v).trim().replace(",", "."); return v === "" ? null : (isNaN(+v) ? NaN : +v); };
const sg = (x, d = 1, u = "") => x == null || !isFinite(x) ? "n/d" : (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d) + u;
const say = (el, text, ok) => { el.textContent = text; el.className = "msg " + (ok ? "ok" : "err"); };
const stamp = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const PHN = { bulk: "Bulk", cut: "Cut", maintenance: "Mantenimento" };

const w = Page.shell({ title: "Setup", sub: "Profilo, fase nutrizionale, esercizi chiave e annotazioni usati da tutta la dashboard." });
const root = (h) => w.append(h);
if (!C.SUPABASE_URL) { root($(`<p class="msg">Configura SUPABASE_URL e SUPABASE_ANON_KEY in assets/config.js.</p>`)); return; }
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const stack = $(`<div class="stack"></div>`); w.append(stack);
const card = h => { const e = $(`<section class="card">${h}</section>`); stack.append(e); return e; };
let user = null;
const lock = () => document.querySelectorAll("[data-w]").forEach(e => { e.disabled = !user; });

/* ---- accesso ---- */
const ac = card(`<h3>🔐 Accesso</h3><div class="row" data-auth></div><p class="msg" id="alock"></p>`);
Auth.mount(ac, sb, u => { user = u; lock(); ac.querySelector("#alock").textContent = u ? "" : "Senza accesso puoi solo consultare le impostazioni."; });

/* ---- le tabelle del setup esistono? ---- */
const probe = await sb.from("settings").select("key").limit(1);
if (probe.error && /does not exist|schema cache|PGRST205|42P01/i.test((probe.error.message || "") + (probe.error.code || ""))) {
  card(`<h3>Tabelle mancanti</h3><p>Le tabelle del setup non esistono ancora nel database. Esegui <b>setup_impostazioni.sql</b> nello SQL Editor di Supabase e ricarica questa pagina.</p>`); return;
}
await Page.loadSettings();
const saveSetting = async (key, value) => (await sb.from("settings").upsert({ key, value, updated_at: new Date().toISOString() })).error;
const refresh = async () => { await Page.loadSettings(); };

/* ---- profilo ---- */
const pr = card(`<h3>👤 Profilo</h3><div class="row"><label class="f">Altezza (cm)<input type="number" step="any" data-w id="p-h"></label><label class="f">Sesso<select data-w id="p-s"><option value="">—</option><option value="M">Uomo</option><option value="F">Donna</option></select></label><label class="f">Anno di nascita<input type="number" step="1" data-w id="p-b"></label></div><p><button class="pill on" data-w id="p-sv">Salva profilo</button> <span class="msg" id="p-m"></span></p><p class="msg">L'altezza serve per il FFMI. Sesso e anno di nascita danno i valori di riferimento nei testi di aiuto dei KPI.</p>`);
const pv = id => pr.querySelector(id);
pv("#p-h").value = S.profile?.height_cm ?? ""; pv("#p-s").value = S.profile?.sex ?? ""; pv("#p-b").value = S.profile?.birth_year ?? "";
pv("#p-sv").onclick = async () => {
  const h = num(pv("#p-h").value), b = num(pv("#p-b").value), m = pv("#p-m");
  if (h != null && (isNaN(h) || h < 120 || h > 230)) return say(m, "Altezza non valida (tra 120 e 230 cm).", false);
  if (b != null && (isNaN(b) || b < 1930 || b > new Date().getFullYear() - 10)) return say(m, "Anno di nascita non valido.", false);
  const err = await saveSetting("profile", { height_cm: h, sex: pv("#p-s").value || null, birth_year: b });
  if (err) return say(m, "Errore: " + err.message, false);
  await refresh(); say(m, `✔ Profilo salvato alle ${stamp()}`, true);
};

/* ---- TDEE ---- */
const td = card(`<h3>🔥 TDEE</h3><p class="msg">Il fabbisogno calorico giornaliero che stimi per te. La dashboard lo confronta con quello calcolato dai tuoi dati reali (calorie assunte e variazione di peso).</p><div class="row"><label class="f">TDEE dichiarato (kcal)<input type="number" data-w id="t-k"></label><label class="f">Data della stima<input type="date" data-w id="t-d"></label><label class="f" style="flex:2 1 260px">Nota<input type="text" data-w id="t-n" maxlength="80" placeholder="es. da calcolatore, 4 sessioni a settimana"></label></div><p><button class="pill on" data-w id="t-sv">Salva TDEE</button> <span class="msg" id="t-m"></span></p><div class="res" id="t-e"></div>`);
const tv = id => td.querySelector(id);
tv("#t-k").value = S.tdee?.declared_kcal ?? ""; tv("#t-d").value = S.tdee?.date ?? ""; tv("#t-n").value = S.tdee?.note ?? "";
async function refreshTdee(){
  const e = tv("#t-e"); e.className = "res"; e.textContent = "Calcolo dai dati…";
  try {
    const r = await Page.calc("tdee"), est = r?.v, dec = +S.tdee?.declared_kcal;
    if (!isFinite(est)) { e.className = "res warn"; e.innerHTML = `Dati insufficienti per la stima: servono le calorie di Cronometer e almeno due pesate BIA negli ultimi 35 giorni.${dec ? ` Stima dichiarata: <b>${Math.round(dec)} kcal</b>.` : ""}`; return; }
    const diff = dec ? (est / dec - 1) * 100 : null;
    e.className = "res " + (diff != null && Math.abs(diff) > 10 ? "warn" : "ok");
    e.innerHTML = `Stimato dai dati (ultimi 28 giorni): <b>${Math.round(est)} kcal</b>${dec ? ` · dichiarato <b>${Math.round(dec)} kcal</b> · scarto <b>${sg(diff, 0, "%")}</b>${Math.abs(diff) > 10 ? "<br>Lo scarto supera il 10%: valuta se aggiornare la stima dichiarata." : ""}` : `<br><span class="msg">Inserisci la tua stima per vedere lo scarto.</span>`}`;
  } catch (x) { e.className = "res err"; e.textContent = "Calcolo non riuscito: " + (x.message || x); }
}
tv("#t-sv").onclick = async () => {
  const k = num(tv("#t-k").value), m = tv("#t-m");
  if (k == null || isNaN(k) || k < 1000 || k > 6000) return say(m, "Inserisci un TDEE tra 1000 e 6000 kcal.", false);
  const err = await saveSetting("tdee", { declared_kcal: Math.round(k), date: tv("#t-d").value || today(), note: tv("#t-n").value.trim() || null });
  if (err) return say(m, "Errore: " + err.message, false);
  await refresh(); say(m, `✔ TDEE salvato alle ${stamp()}`, true); refreshTdee();
};
refreshTdee();

/* ---- fasi ---- */
const ph = card(`<h3>📅 Fasi nutrizionali</h3><p class="msg">Bulk, cut o mantenimento con intervallo di date e target. Le fasi compaiono come bande sui grafici e i target alimentano i KPI di Alimentazione. Lascia vuota la data di fine per una fase in corso.</p>
<div class="row"><label class="f">Tipo<select data-w id="f-t"><option value="bulk">Bulk</option><option value="cut">Cut</option><option value="maintenance">Mantenimento</option></select></label><label class="f">Inizio<input type="date" data-w id="f-s"></label><label class="f">Fine (opzionale)<input type="date" data-w id="f-e"></label><label class="f">Ritmo (kg/sett)<input type="number" step="0.05" data-w id="f-r" placeholder="es. 0.25"></label><label class="f">Calorie target<input type="number" data-w id="f-k"></label><label class="f">Proteine target (g)<input type="number" data-w id="f-p"></label></div>
<div class="row" style="margin-top:12px"><label class="f" style="flex:1 1 100%">Nota<input type="text" data-w id="f-n" maxlength="120"></label></div>
<p><button class="pill on" data-w id="f-sv">Salva fase</button> <button class="pill" data-w id="f-cl">Annulla modifica</button> <span class="msg" id="f-m"></span></p><div id="f-l"></div>`);
const fv = id => ph.querySelector(id);
let phEdit = null;
const phName = p => `${PHN[p.phase_type]} dal ${fmtD(p.start_date)}`;
function phClear(){ phEdit = null; ["#f-s", "#f-e", "#f-r", "#f-k", "#f-p", "#f-n"].forEach(i => fv(i).value = ""); fv("#f-t").value = "bulk"; fv("#f-sv").textContent = "Salva fase"; }
fv("#f-cl").onclick = () => { phClear(); fv("#f-m").textContent = ""; };
async function phStats(p){
  const end = p.end_date || today(), [peso, grasso, lbm, musc, kcal] = await Promise.all(["peso", "grasso", "lbm", "muscolo", "kcal"].map(Page.load));
  const near = (rows, d) => { let b = null, bd = 1e9; for (const r of rows) { const x = Math.abs(Date.parse(r.d) - Date.parse(d)) / 864e5; if (x < bd) { bd = x; b = r; } } return bd <= 10 ? b : null; };
  const delta = rows => { const a = near(rows, p.start_date), z = near(rows, end); return a && z && a !== z ? z.v - a.v : null; };
  const days = Math.round((Date.parse(end) - Date.parse(p.start_date)) / 864e5) + 1, dp = delta(peso), kc = kcal.filter(r => r.d >= p.start_date && r.d <= end).map(r => r.v);
  return { days, dp, dg: delta(grasso), dl: delta(lbm), dm: delta(musc), kcal: kc.length ? kc.reduce((a, b) => a + b, 0) / kc.length : null, rate: dp != null && days >= 7 ? dp / days * 7 : null };
}
async function renderPhases(){
  const L = fv("#f-l");
  if (!S.phases.length) { L.innerHTML = `<p class="msg">Nessuna fase inserita.</p>`; return; }
  const rows = [...S.phases].sort((a, b) => b.start_date.localeCompare(a.start_date)), st = await Promise.all(rows.map(phStats)), t = today();
  L.innerHTML = `<div class="tw"><table><tr><th></th><th>Fase</th><th>Periodo</th><th>Giorni</th><th>Δ peso</th><th>Δ grasso</th><th>Δ massa magra</th><th>Δ muscolo</th><th>kcal medie</th><th>Ritmo reale / previsto</th><th></th></tr>${rows.map((p, i) => { const s = st[i], now = p.start_date <= t && (!p.end_date || p.end_date >= t);
    return `<tr class="${now ? "now" : ""}"><td><button class="mini" data-w data-e="${p.id}" title="Modifica">✎</button></td><td><span class="badge ${esc(p.phase_type)}">${esc(PHN[p.phase_type] || p.phase_type)}</span>${now ? ' <small class="msg">in corso</small>' : ""}</td><td>${fmtD(p.start_date)} → ${p.end_date ? fmtD(p.end_date) : "in corso"}</td><td>${s.days}</td><td>${sg(s.dp, 1, " kg")}</td><td>${sg(s.dg, 1, " pt")}</td><td>${sg(s.dl, 1, " kg")}</td><td>${sg(s.dm, 1, " kg")}</td><td>${s.kcal == null ? "n/d" : Math.round(s.kcal)}</td><td>${sg(s.rate, 2)} / ${p.target_rate_kg_week == null ? "—" : sg(+p.target_rate_kg_week, 2)}</td><td><button class="mini" data-w data-d="${p.id}" title="Elimina">🗑</button></td></tr>`; }).join("")}</table></div><p class="msg">I delta usano la misura BIA più vicina all'inizio e alla fine della fase (entro 10 giorni); «pt» = punti percentuali di grasso. Il ritmo reale richiede almeno 7 giorni di fase.</p>`;
  lock();
}
ph.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.e) { const p = S.phases.find(x => x.id == b.dataset.e); phEdit = p.id; fv("#f-t").value = p.phase_type; fv("#f-s").value = p.start_date; fv("#f-e").value = p.end_date || ""; fv("#f-r").value = p.target_rate_kg_week ?? ""; fv("#f-k").value = p.target_kcal ?? ""; fv("#f-p").value = p.target_protein_g ?? ""; fv("#f-n").value = p.note || ""; fv("#f-sv").textContent = "Aggiorna fase"; say(fv("#f-m"), "Modifica della fase selezionata.", true); scrollTo({ top: ph.offsetTop, behavior: "smooth" }); }
  if (b.dataset.d) { const p = S.phases.find(x => x.id == b.dataset.d); if (!confirm(`Eliminare la fase «${phName(p)}»?`)) return;
    const { error } = await sb.from("phases").delete().eq("id", p.id); if (error) return say(fv("#f-m"), "Errore: " + error.message, false);
    await refresh(); say(fv("#f-m"), "Fase eliminata.", true); renderPhases(); }
});
fv("#f-sv").onclick = async () => {
  const m = fv("#f-m"), r = num(fv("#f-r").value), k = num(fv("#f-k").value), pg = num(fv("#f-p").value);
  const rec = { phase_type: fv("#f-t").value, start_date: fv("#f-s").value, end_date: fv("#f-e").value || null, target_rate_kg_week: r, target_kcal: k == null ? null : Math.round(k), target_protein_g: pg == null ? null : Math.round(pg), note: fv("#f-n").value.trim() || null };
  if (!rec.start_date) return say(m, "La data di inizio è obbligatoria.", false);
  if (rec.end_date && rec.end_date < rec.start_date) return say(m, "La data di fine è precedente all'inizio.", false);
  if (isNaN(r) || (r != null && Math.abs(r) > 2)) return say(m, "Ritmo non valido (tra −2 e +2 kg a settimana).", false);
  if (isNaN(k) || (k != null && (k < 800 || k > 8000))) return say(m, "Calorie target non valide (800–8000).", false);
  if (isNaN(pg) || (pg != null && (pg < 20 || pg > 500))) return say(m, "Proteine target non valide (20–500 g).", false);
  if (r != null && ((rec.phase_type === "bulk" && r < 0) || (rec.phase_type === "cut" && r > 0)) && !confirm("Il ritmo indicato non sembra coerente con il tipo di fase. Salvare comunque?")) return;
  const inf = "9999-12-31", hit = S.phases.filter(p => p.id !== phEdit && p.start_date <= (rec.end_date || inf) && rec.start_date <= (p.end_date || inf));
  let closed = null;
  if (hit.length === 1 && !hit[0].end_date && hit[0].start_date < rec.start_date) {
    if (!confirm(`La fase «${phName(hit[0])}» è ancora aperta. Chiuderla il ${fmtD(addD(rec.start_date, -1))}?`)) return;
    closed = hit[0]; const { error } = await sb.from("phases").update({ end_date: addD(rec.start_date, -1) }).eq("id", closed.id); if (error) return say(m, "Errore: " + error.message, false);
  } else if (hit.length) return say(m, `Si sovrappone alla fase «${phName(hit[0])}» (${hit[0].end_date ? "fino al " + fmtD(hit[0].end_date) : "in corso"}). Modifica le date o chiudi prima l'altra fase.`, false);
  const { error } = phEdit ? await sb.from("phases").update(rec).eq("id", phEdit) : await sb.from("phases").insert(rec);
  if (error) { if (closed) await sb.from("phases").update({ end_date: null }).eq("id", closed.id); return say(m, "Errore: " + error.message, false); }
  const was = phEdit; phClear(); await refresh(); say(m, `✔ Fase ${was ? "aggiornata" : "salvata"} alle ${stamp()}${closed ? ` · «${phName(closed)}» chiusa` : ""}`, true); renderPhases(); refreshTdee();
};
renderPhases();

/* ---- allenamento: esercizi chiave e gruppi muscolari ---- */
const titles = await (async () => { const c = new Map(); for (const r of await Page.sets()) if (r.set_type !== "warmup" && r.exercise_title) c.set(r.exercise_title, (c.get(r.exercise_title) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]); })();
const valid = p => { try { new RegExp(p, "i"); return true; } catch (e) { return false; } };
const names = m => m.slice(0, 5).map(x => esc(x[0])).join(", ") + (m.length > 5 ? ` +${m.length - 5}` : "");
const tr = card(`<h3>🏋️ Allenamento</h3><div class="row"><label class="f">Sessioni a settimana (obiettivo)<input type="number" min="1" max="14" data-w id="a-s"></label></div>
<h4>Esercizi chiave (1RM stimato)</h4><p class="msg">Per ogni esercizio indica un'espressione regolare sul titolo (maiuscole ignorate; separa le alternative con |, ^ = inizio del titolo). L'anteprima mostra i titoli del tuo storico che corrispondono. Massimo 6.</p><div id="a-l"></div><p><button class="pill" data-w id="a-la">+ Aggiungi esercizio</button></p>
<h4>Gruppi muscolari</h4><p class="msg">Ogni esercizio va al primo gruppo, dall'alto, la cui espressione corrisponde.</p><div id="a-g"></div><p><button class="pill" data-w id="a-ga">+ Aggiungi gruppo</button></p><div class="res" id="a-u"></div>
<p><button class="pill on" data-w id="a-sv">Salva allenamento</button> <span class="msg" id="a-m"></span></p>`);
const av = id => tr.querySelector(id);
const trn = S.training || {};
av("#a-s").value = trn.sessions_per_week ?? C.TARGET.sessioni ?? 3;
let lifts = (trn.lifts?.length ? trn.lifts : C.LIFTS).map(x => ({ ...x }));
let groups = (trn.groups?.length ? trn.groups : Object.entries(C.MUSCLES).map(([label, re]) => ({ label, pattern: re.source }))).map(x => ({ ...x }));
function previews(){
  tr.querySelectorAll("#a-l .rowx").forEach((row, i) => { const p = lifts[i].pattern, el = row.querySelector(".pv");
    if (!p.trim()) el.textContent = "Inserisci un'espressione."; else if (!valid(p)) el.textContent = "Espressione non valida."; else { const m = titles.filter(t => new RegExp(p, "i").test(t[0])); el.innerHTML = m.length ? `${m.length} esercizi: ${names(m)}` : "Nessun esercizio corrisponde."; } });
  const taken = new Set();
  tr.querySelectorAll("#a-g .rowx").forEach((row, i) => { const p = groups[i].pattern, el = row.querySelector(".pv");
    if (!p.trim()) { el.textContent = "Inserisci un'espressione."; return; } if (!valid(p)) { el.textContent = "Espressione non valida."; return; }
    const m = titles.filter(t => !taken.has(t[0]) && new RegExp(p, "i").test(t[0])); m.forEach(t => taken.add(t[0])); el.innerHTML = m.length ? `${m.length} esercizi: ${names(m)}` : "Nessun esercizio nuovo (già assegnati a gruppi sopra o nessuna corrispondenza)."; });
  const u = titles.filter(t => !taken.has(t[0])), box = av("#a-u");
  box.className = "res " + (u.length ? "warn" : "ok"); box.innerHTML = u.length ? `<b>${u.length} esercizi non assegnati</b> (finiscono in «Altro»): ${names(u)}` : "Tutti gli esercizi del tuo storico sono assegnati a un gruppo.";
}
function listRows(){
  const mk = (arr, host, ph1) => { av(host).innerHTML = arr.map((x, i) => `<div class="rowx" data-i="${i}"><input type="text" data-w class="lbl" value="${esc(x.label)}" placeholder="Etichetta" maxlength="30"><input type="text" data-w class="pat" value="${esc(x.pattern)}" placeholder="${ph1}"><button class="mini" data-w data-x title="Rimuovi">✕</button><div class="pv msg"></div></div>`).join(""); };
  mk(lifts, "#a-l", "es. ^bench press|panca"); mk(groups, "#a-g", "es. squat|leg|lunge"); previews(); lock();
}
tr.addEventListener("input", e => { const row = e.target.closest(".rowx"); if (!row) return; const arr = row.parentElement.id === "a-l" ? lifts : groups, i = +row.dataset.i;
  if (e.target.classList.contains("lbl")) arr[i].label = e.target.value; else arr[i].pattern = e.target.value; previews(); });
tr.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.x !== undefined) { const row = b.closest(".rowx"), arr = row.parentElement.id === "a-l" ? lifts : groups; arr.splice(+row.dataset.i, 1); listRows(); }
  if (b.id === "a-la") { if (lifts.length >= 6) return say(av("#a-m"), "Massimo 6 esercizi chiave.", false); lifts.push({ label: "", pattern: "" }); listRows(); }
  if (b.id === "a-ga") { groups.push({ label: "", pattern: "" }); listRows(); } });
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "esercizio";
av("#a-sv").onclick = async () => {
  const m = av("#a-m"), n = num(av("#a-s").value);
  if (n == null || isNaN(n) || n < 1 || n > 14) return say(m, "Sessioni a settimana: un numero tra 1 e 14.", false);
  for (const [arr, nome] of [[lifts, "esercizio chiave"], [groups, "gruppo"]]) for (const x of arr) { if (!x.label.trim() || !x.pattern.trim()) return say(m, `Ogni ${nome} ha bisogno di etichetta ed espressione.`, false); if (!valid(x.pattern)) return say(m, `Espressione non valida: ${x.pattern}`, false); }
  if (new Set(groups.map(g => g.label.trim().toLowerCase())).size < groups.length) return say(m, "Due gruppi hanno la stessa etichetta.", false);
  const used = new Set(), out = lifts.map(l => { let k = l.key || slug(l.label), j = 2; while (used.has(k)) k = slug(l.label) + "_" + j++; used.add(k); return { key: k, label: l.label.trim(), pattern: l.pattern.trim() }; });
  const err = await saveSetting("training", { sessions_per_week: Math.round(n), lifts: out, groups: groups.map(g => ({ label: g.label.trim(), pattern: g.pattern.trim() })) });
  if (err) return say(m, "Errore: " + err.message, false);
  lifts = out; await refresh(); say(m, `✔ Allenamento salvato alle ${stamp()}`, true);
};
listRows();

/* ---- annotazioni ---- */
const an = card(`<h3>📌 Annotazioni</h3><p class="msg">Eventi datati mostrati sui grafici come linee verticali: infortunio, viaggio, inizio di un integratore, cambio di programma…</p><div class="row"><label class="f">Data<input type="date" data-w id="e-d"></label><label class="f">Categoria<select data-w id="e-c"><option>Salute</option><option>Viaggio</option><option>Integratore</option><option>Allenamento</option><option>Altro</option></select></label><label class="f" style="flex:2 1 280px">Descrizione<input type="text" data-w id="e-l" maxlength="80"></label></div><p><button class="pill on" data-w id="e-sv">Aggiungi annotazione</button> <button class="pill" data-w id="e-cl">Annulla modifica</button> <span class="msg" id="e-m"></span></p><div id="e-list"></div>`);
const ev = id => an.querySelector(id);
let evEdit = null;
const evClear = () => { evEdit = null; ev("#e-d").value = ""; ev("#e-l").value = ""; ev("#e-c").value = "Salute"; ev("#e-sv").textContent = "Aggiungi annotazione"; };
ev("#e-cl").onclick = () => { evClear(); ev("#e-m").textContent = ""; };
function renderEvents(){
  const L = ev("#e-list"), rows = [...S.events].sort((a, b) => b.event_date.localeCompare(a.event_date));
  L.innerHTML = rows.length ? `<table><tr><th></th><th>Data</th><th>Categoria</th><th>Descrizione</th><th></th></tr>${rows.map(r => `<tr><td><button class="mini" data-w data-e="${r.id}" title="Modifica">✎</button></td><td>${fmtD(r.event_date)}</td><td>${esc(r.category)}</td><td>${esc(r.label)}</td><td><button class="mini" data-w data-d="${r.id}" title="Elimina">🗑</button></td></tr>`).join("")}</table>` : `<p class="msg">Nessuna annotazione.</p>`;
  lock();
}
an.addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.e) { const r = S.events.find(x => x.id == b.dataset.e); evEdit = r.id; ev("#e-d").value = r.event_date; ev("#e-c").value = r.category || "Altro"; ev("#e-l").value = r.label; ev("#e-sv").textContent = "Aggiorna annotazione"; say(ev("#e-m"), "Modifica dell'annotazione selezionata.", true); }
  if (b.dataset.d) { if (!confirm("Eliminare questa annotazione?")) return; const { error } = await sb.from("events").delete().eq("id", b.dataset.d); if (error) return say(ev("#e-m"), "Errore: " + error.message, false); await refresh(); say(ev("#e-m"), "Annotazione eliminata.", true); renderEvents(); } });
ev("#e-sv").onclick = async () => {
  const m = ev("#e-m"), rec = { event_date: ev("#e-d").value, category: ev("#e-c").value, label: ev("#e-l").value.trim() };
  if (!rec.event_date || !rec.label) return say(m, "Data e descrizione sono obbligatorie.", false);
  const { error } = evEdit ? await sb.from("events").update(rec).eq("id", evEdit) : await sb.from("events").insert(rec);
  if (error) return say(m, "Errore: " + error.message, false);
  const was = evEdit; evClear(); await refresh(); say(m, `✔ Annotazione ${was ? "aggiornata" : "salvata"} alle ${stamp()}`, true); renderEvents();
};
renderEvents(); lock();
})();
