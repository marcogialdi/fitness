// Piano Alimentare: legge piani e alimenti dal database (tabelle meal_plans e foods, create da setup_piani.sql).
// Ogni piano è legato a una fase del Setup (bulk, cut, mantenimento). Se le tabelle non esistono ancora usa i dati incorporati in piano_seed.js.
(async () => {
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const r0 = x => Math.round(x), fm = n => `${r0(n.kcal)} kcal · P ${r0(n.p)} · C ${r0(n.c)} · G ${r0(n.f)}`, sg = x => (x >= 0 ? "+" : "−") + Math.abs(r0(x));
const fmtD = d => d ? d.split("-").reverse().join("/") : "";
const zero = () => ({ kcal: 0, p: 0, c: 0, f: 0 });
const add = (a, b) => { a.kcal += b.kcal; a.p += b.p; a.c += b.c; a.f += b.f; return a; };
const $ = h => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const w = Page.shell({ title: "Piano Alimentare", sub: "Piano settimanale legato alla fase in corso (bulk, cut, mantenimento). Calorie e macro sono stime da tabelle nutrizionali." });
const host = $(`<div id="pa"><p class="msg">Carico i piani…</p></div>`); w.append(host);

/* ------------------------------------------------------------------ dati ------------------------------------------------------------------ */
await Page.loadSettings();
const phases = Page.S.phases || [];
let foods = null, plans = null, fallback = "";
try {
  const [f, p] = await Promise.all([Page.client().from("foods").select("*"), Page.client().from("meal_plans").select("*").order("version")]);
  if (f.error || p.error) throw new Error((f.error || p.error).message);
  foods = f.data; plans = p.data;
  if (!plans.length) fallback = "Nel database non ci sono ancora piani: mostro quelli incorporati.";
} catch (e) { fallback = "Le tabelle dei piani non esistono ancora nel database (esegui setup_piani.sql in Supabase): mostro i piani incorporati."; }
if (fallback) {
  const S = window.PIANO_SEED;
  foods = foods?.length ? foods : S.foods;
  const ph = [...phases].filter(p => p.phase_type === "bulk").pop();
  plans = S.plans.map((p, i) => ({ ...p, id: i + 1, phase_id: ph?.id ?? null, replaces_id: i ? i : null }));
}
const FOOD = Object.fromEntries(foods.map(f => [f.id, { name: f.name, kcal: +f.kcal, p: +f.protein_g, c: +f.carbs_g, f: +f.fat_g, unit: f.unit_g == null ? null : +f.unit_g, label: f.unit_label ? f.unit_label.split("|") : null, est: !!f.estimate }]));
const PHN = t => Page.PH[t]?.[0] || t, PLAN = id => plans.find(p => p.id === id);
const phaseOf = p => phases.find(x => x.id === p.phase_id);
const today = new Date().toLocaleDateString("sv-SE");
const curPhase = phases.find(p => p.start_date <= today && (!p.end_date || p.end_date >= today));

/* --------------------------------------------------------------- calcolo --------------------------------------------------------------- */
const food = id => FOOD[id] || { name: id, kcal: 0, p: 0, c: 0, f: 0, unit: null, label: null, est: false };
const grams = x => { const f = food(x.f); return f.unit != null ? x.n * f.unit : x.n; };
const AMT = x => { const f = food(x.f), n = x.n; return f.label ? `${n} ${f.label[n === 1 ? 0 : 1] || f.label[0]}` : f.unit === 0 ? "" : f.unit != null ? `${n} (${r0(n * f.unit)} g)` : `${n} g${f.est ? " (stima)" : ""}`; };
const nut = x => { if (x.head) return zero(); const f = food(x.f), m = grams(x) / 100; return { kcal: f.kcal * m, p: f.p * m, c: f.c * m, f: f.f * m }; };
const sumItems = l => (l || []).reduce((a, x) => add(a, nut(x)), zero());
const dayTot = (pl, d) => pl.meals.reduce((a, [k]) => add(a, sumItems(d.meals[k])), zero());
const tgtOf = (pl, d) => { const t = pl.targets || {}, kg = +t.kg || 0, P = r0((+t.protein_per_kg || 0) * kg), F = +((+t.fat_per_kg || 0) * kg).toFixed(1); return { kcal: d.tgt.kcal, p: P, f: F, c: Math.round((d.tgt.kcal - 4 * P - 9 * F) / 4) }; };

/* ---------------------------------------------------------------- pagina ---------------------------------------------------------------- */
const label = p => { const ph = phaseOf(p); return `${PHN(p.phase_type)} · ${p.name}${p.status === "archived" ? " (archiviato)" : p.status === "draft" ? " (bozza)" : ""}`; };
const pick = () => {
  const mine = curPhase ? plans.filter(p => p.status === "active" && (p.phase_id === curPhase.id || (!p.phase_id && p.phase_type === curPhase.phase_type))) : [];
  const best = a => [...a].sort((x, y) => (y.phase_id === curPhase?.id) - (x.phase_id === curPhase?.id) || y.version - x.version)[0];
  return (mine.length ? best(mine) : best(plans.filter(p => p.status === "active")) || best(plans))?.id;
};
const order = [...plans].sort((a, b) => ((b.status === "active") - (a.status === "active")) || a.phase_type.localeCompare(b.phase_type) || b.version - a.version);
const idx = (new Date().getDay() + 6) % 7;
let cur = pick(), day = idx;
const bar = (v, t) => `<div class="pa-bar" role="img" aria-label="${t ? r0(100 * v / t) : 0}% del target"><i style="width:${t ? Math.min(100, 100 * v / t) : 0}%"></i></div>`;
if (!plans.length) { host.innerHTML = `<section class="card"><p>Non c'è ancora nessun piano. Esegui <b>setup_piani.sql</b> in Supabase.</p></section>`; return; }
host.innerHTML = "";
const sel = $(`<div class="bar" role="tablist"><span>Piano</span>${order.map(p => `<button class="pill" data-v="${p.id}" role="tab">${esc(label(p))}</button>`).join("")}</div>`);
const info = $(`<p class="msg pa-info"></p>`);
const tabs = $(`<div class="bar" role="tablist"></div>`);
const body = $(`<div></div>`);
host.append(...(fallback ? [$(`<div class="res warn">${esc(fallback)}</div>`)] : []), sel, info, tabs, body);
function infoTxt(p){
  const ph = phaseOf(p), cur_ = ph && ph === curPhase;
  const f = ph ? `Fase ${PHN(ph.phase_type).toLowerCase()} dal ${fmtD(ph.start_date)}${ph.end_date ? " al " + fmtD(ph.end_date) : " (in corso)"}${cur_ ? " · è la fase attuale" : ""}` : `Tipo ${PHN(p.phase_type).toLowerCase()}, non collegato a una fase del Setup`;
  return `${f} · versione ${p.version}${p.notes ? " · " + p.notes : ""}`;
}
function show(){
  const pl = PLAN(cur), d = pl.days[Math.min(day, pl.days.length - 1)], T = dayTot(pl, d), G = tgtOf(pl, d), dev = T.kcal - G.kcal;
  const rows = [["Calorie", T.kcal, G.kcal, "kcal"], ["Proteine", T.p, G.p, "g"], ["Carboidrati", T.c, G.c, "g"], ["Grassi", T.f, G.f, "g"]];
  const off = Math.abs(dev) > 60 || Math.abs(T.p - G.p) > 10;
  body.innerHTML = `<section class="card"><h3>${esc(d.nome)} <small class="msg">· giorno ${esc(d.tgt.tipo.toLowerCase())} · ${esc(pl.name.toLowerCase())}</small></h3>
    <div class="pa-sum">${rows.map(([n, v, t, u]) => `<div><div class="pa-row"><span>${n}</span><b>${r0(v)} <small class="msg">/ ${r0(t)} ${u} (${sg(v - t)})</small></b></div>${bar(v, t)}</div>`).join("")}</div>
    <div class="res ${off ? "warn" : "ok"}">${off ? `<b>Fuori target:</b> ${sg(dev)} kcal e ${sg(T.p - G.p)} g di proteine rispetto all'obiettivo.` : `<b>In linea con il target</b> (${sg(dev)} kcal, ${sg(T.p - G.p)} g di proteine).`}</div></section>
    <div class="pa-meals">${pl.meals.map(([k, n, ora]) => { const l = d.meals[k] || []; return `<section class="card"><h3>${esc(k === "pre" && d.pre ? d.pre : n)} <small class="msg">· ${esc(ora)}</small></h3><p class="msg pa-t">${fm(sumItems(l))}</p><ul class="pa-l">${l.map(x => x.head ? `<li class="hd"><span>${esc(x.head)}</span></li>` : `<li><span>${esc(food(x.f).name)}</span><small class="msg">${[AMT(x), nut(x).kcal >= 1 ? r0(nut(x).kcal) + " kcal" : ""].filter(Boolean).join(" · ")}</small></li>`).join("")}</ul></section>`; }).join("")}</div>`;
  sel.querySelectorAll("button").forEach(b => { const on = +b.dataset.v === cur; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  tabs.innerHTML = `<span>Giorno</span>${pl.days.map((x, i) => `<button class="pill${i === day ? " on" : ""}" role="tab" data-i="${i}" aria-selected="${i === day}">${esc(x.nome.slice(0, 3))}${i === idx ? " · oggi" : ""}</button>`).join("")}`;
  info.textContent = infoTxt(pl);
  diffBox();
}
sel.onclick = e => { const b = e.target.closest("button[data-v]"); if (b) { cur = +b.dataset.v; show(); } };
tabs.onclick = e => { const b = e.target.closest("button[data-i]"); if (b) { day = +b.dataset.i; show(); } };

// Modifiche rispetto alla versione precedente (campo replaces_id), alimento per alimento
const diffHost = $(`<div></div>`); w.append(diffHost);
function diffs(pl, old){
  return pl.days.map((d, i) => { const o = old.days.find(x => x.nome === d.nome) || old.days[i], out = [];
    for (const [k, n] of pl.meals) {
      const q = l => { const m = new Map(); (l || []).filter(x => !x.head).forEach(x => m.set(x.f, (m.get(x.f) || 0) + x.n)); return m; }, a = q(o?.meals?.[k]), b = q(d.meals[k]);
      for (const f of new Set([...a.keys(), ...b.keys()])) { const va = a.get(f), vb = b.get(f); if (va === vb) continue;
        out.push({ key: `${k}|${f}|${va}|${vb}`, meal: n, txt: va == null ? `${food(f).name}: aggiunto (${AMT({ f, n: vb })})` : vb == null ? `${food(f).name}: tolto (era ${AMT({ f, n: va })})` : `${food(f).name}: ${AMT({ f, n: va })} → ${AMT({ f, n: vb })}` }); } }
    return out; });
}
function diffBox(){
  const pl = PLAN(cur), old = pl.replaces_id && PLAN(pl.replaces_id);
  if (!old) { diffHost.innerHTML = ""; return; }
  const df = diffs(pl, old), n = df.length > 2 ? df.length - 1 : df.length;
  const common = df.length > 2 ? df[0].filter(x => df.slice(0, n).every(a => a.some(y => y.key === x.key))).map(x => x.key) : [];
  const li = l => l.map(x => `<li><span>${esc(x.meal)} · ${esc(x.txt)}</span></li>`).join("") || "<li><span>Nessuna modifica</span></li>";
  diffHost.innerHTML = `<details class="more"><summary>Cosa cambia rispetto a «${esc(old.name)}»</summary><div class="card">${common.length ? `<p><b>Tutti i giorni tranne l'ultimo</b> (uguale ogni giorno)</p><ul class="pa-l">${li(df[0].filter(x => common.includes(x.key)))}</ul>` : ""}${df.map((a, i) => `<p><b>${esc(pl.days[i].nome)}</b></p><ul class="pa-l">${li(a.filter(x => i >= n || !common.includes(x.key)))}</ul>`).join("")}</div></details>`;
}
show();
const used = new Set(plans.flatMap(p => p.days.flatMap(d => Object.values(d.meals).flat().map(x => x.f))));
w.append($(`<details class="more"><summary>Come sono calcolati i valori</summary><div class="card"><ul class="pa-l"><li><span>Valori medi per 100 g di alimento <b>crudo o secco</b>; pasta e riso a crudo, ceci cotti. Sono stime da tabelle: Cronometer e le etichette dei tuoi prodotti possono dare numeri diversi, soprattutto per whey, Wasa, pane di segale, ceci in scatola e latte di soia.</span></li><li><span>Dove la quantità è in pezzi (uova, fette di Wasa, frutta) il peso del pezzo è nella tabella qui sotto; la verdura è stimata a pasto perché il piano non indica la quantità.</span></li><li><span>Obiettivi: proteine e grassi in g/kg dal peso indicato nel piano, il resto in carboidrati; le calorie di ogni giorno sono nel piano.</span></li><li><span>I piani sono salvati nel database (tabelle <b>meal_plans</b> e <b>foods</b>): per modificarli scrivimi le variazioni.</span></li></ul><div class="tw"><table><tr><th>Alimento</th><th>kcal</th><th>Prot.</th><th>Carb.</th><th>Grassi</th><th>Pezzo</th></tr>${Object.entries(FOOD).filter(([k]) => used.has(k)).map(([, f]) => `<tr><td>${esc(f.name)}</td><td>${f.kcal}</td><td>${f.p}</td><td>${f.c}</td><td>${f.f}</td><td>${f.unit ? f.unit + " g" : ""}</td></tr>`).join("")}</table></div><p class="msg">Valori per 100 g.</p></div></details>`));
})();
