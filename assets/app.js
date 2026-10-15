// Template condiviso: navigazione, KPI, aggregazione, grafici (linea / istogramma + trend), zoom con scorrimento.
(() => {
const C = window.CONFIG;
const GR = [["day","Giorno"],["week","Settimana"],["month","Mese"],["quarter","Trimestre"],["semester","Semestre"],["year","Anno"]];
const WIN = { day: 60, week: 52, month: 36, quarter: 20, semester: 12, year: 10 }; // punti mostrati per granularità
const PAGES = [["index.html","Home"],["fitness.html","Fitness"],["allenamenti.html","Allenamenti"],["wellness.html","Wellness"],["carica.html","Carica Dati"]];
const state = { gran: "day", cards: [] };
const cache = {};
const $ = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };

/* ---------- dati ---------- */
function rng(s){ return () => ((s = Math.imul(s ^ s >>> 15, 2246822507) + 1013904223 | 0) >>> 0) / 4294967296; }
function demo(c){
  const r = rng(c.seed || 7), rows = [], t0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 640; i++) {
    if (c.sparse && r() > c.sparse) continue;
    const v = c.base + c.slope * i + c.amp * Math.sin(i / c.period * 6.283) + (r() - .5) * c.noise;
    rows.push({ d: new Date(t0 + i * 864e5).toISOString().slice(0, 10), v: +Math.max(0, v).toFixed(c.dec ?? 1) });
  }
  return rows;
}
let sb; const client = () => sb ||= window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const day = t => String(t).length > 10 ? new Date(t).toLocaleDateString("sv-SE") : String(t).slice(0, 10);
const hm = s => { const n = String(s).match(/\d+(?:[.,]\d+)?/g)?.map(x => +x.replace(",", ".")); return !n ? NaN : n.length > 1 ? n[0] + n[1] / 60 : (n[0] > 24 ? n[0] / 60 : n[0]); };
async function fetchAll(table, cols, order, notnull, where){ // paginazione con ordinamento stabile (order + id)
  let out = [], from = 0;
  for (;;) {
    let q = client().from(table).select(cols); if (notnull) q = q.not(notnull, "is", null);
    for (const [k, v] of Object.entries(where || {})) q = q.eq(k, v);
    const { data, error } = await q.order(order).order("id").range(from, from + 999);
    if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000;
  }
  return out;
}
let setsP, sessP;
const sets = () => setsP ||= C.SUPABASE_URL ? fetchAll("workouts", "start_time,end_time,exercise_title,set_type,weight_kg,reps", "start_time") : Promise.resolve([]);
const sessions = () => sessP ||= (async () => { // da righe-serie a sessioni
  const m = new Map();
  for (const r of await sets()) {
    let s = m.get(r.start_time);
    if (!s) m.set(r.start_time, s = { d: day(r.start_time), dur: (Date.parse(r.end_time) - Date.parse(r.start_time)) / 6e4, vol: 0, n: 0, x: [] });
    if (r.set_type === "warmup") continue;
    const w = +r.weight_kg || 0, k = +r.reps || 0;
    s.vol += w * k; s.n++; if (w && k) s.x.push([r.exercise_title || "", w * (1 + k / 30)]); // Epley
  }
  return [...m.values()];
})();
const METRIC = { volume: s => s.vol, durata: s => s.dur, sessioni: () => 1, serie: s => s.n };
function load(id){
  return cache[id] ||= (async () => {
    const s = C.SOURCES[id];
    if (!C.SUPABASE_URL || !window.supabase) return s.demo ? demo(s.demo) : [];
    if (s.kind === "workouts") {
      const f = s.match ? (x => { const v = x.x.filter(e => s.match.test(e[0])).map(e => e[1]); return v.length ? Math.max(...v) : null; }) : METRIC[s.metric];
      return (await sessions()).map(x => ({ d: x.d, v: f(x) })).filter(r => r.v != null && isFinite(r.v));
    }
    const rows = await fetchAll(s.table, `${s.date},${s.col}${s.daily ? ",completed" : ""}`, s.date, s.col, s.where);
    let out = rows.map(r => ({ d: day(r[s.date]), v: s.parse === "hm" ? hm(r[s.col]) : +r[s.col], c: r.completed })).filter(r => isFinite(r.v));
    if (s.daily) { const today = new Date().toLocaleDateString("sv-SE"); out = out.filter(r => r.d < today && (!C.SOLO_COMPLETATI || r.c)); } // giorno in corso sempre escluso
    return out;
  })();
}

/* ---------- aggregazione e trend ---------- */
function key(d, g){
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  if (g === "day") return d;
  if (g === "week") { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); }
  if (g === "month") return d.slice(0, 7);
  if (g === "quarter") return y + "-T" + Math.ceil(m / 3);
  if (g === "semester") return y + "-S" + (m <= 6 ? 1 : 2);
  return "" + y;
}
const sum = a => a.reduce((x, y) => x + y, 0);
function aggregate(rows, g, mode){
  const m = new Map();
  for (const r of rows) { const k = key(r.d, g); if (!m.has(k)) m.set(k, []); m.get(k).push(r.v); }
  return [...m].map(([k, a]) => ({ k, v: mode === "sum" ? sum(a) : mode === "max" ? Math.max(...a) : mode === "last" ? a[a.length - 1] : sum(a) / a.length }));
}
function trend(v){ // regressione lineare sull'intero storico aggregato
  const n = v.length; if (n < 2) return v.slice();
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  v.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
  const b = (n * sxy - sx * sy) / ((n * sxx - sx * sx) || 1), a = (sy - b * sx) / n;
  return v.map((_, x) => a + b * x);
}
const label = (k, g) => g === "week" ? "sett. " + k : k;

/* ---------- template grafico (type: "line" | "bar") ---------- */
function draw(canvas, cfg, labels, vals, tr, old){
  old && old.destroy();
  const bar = cfg.type === "bar", mut = "#94a3b8", grid = "#334155";
  return new Chart(canvas, {
    type: bar ? "bar" : "line",
    data: { labels, datasets: [
      { label: cfg.label, data: vals, borderColor: cfg.color, backgroundColor: bar ? cfg.color + "bb" : cfg.color + "33", borderWidth: bar ? 1 : 2, borderRadius: bar ? 4 : 0, tension: .3, pointRadius: vals.length > 80 ? 0 : 3, order: 2 },
      { type: "line", label: "Trend", data: tr, borderColor: "#fff", borderDash: [6, 5], borderWidth: 2, pointRadius: 0, order: 1 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, spanGaps: true,
      plugins: { legend: { labels: { color: mut } } },
      scales: { x: { ticks: { color: mut, maxRotation: 60 }, grid: { color: grid } }, y: { ticks: { color: mut }, grid: { color: grid }, beginAtZero: bar } } }
  });
}
async function series(cfg){
  const a = aggregate(await load(cfg.source), state.gran, cfg.agg || "avg"); // sempre tutto lo storico
  return { labels: a.map(x => label(x.k, state.gran)), vals: a.map(x => +x.v.toFixed(2)), tr: trend(a.map(x => x.v)).map(x => +x.toFixed(2)) };
}
async function render(o){
  if (o.cfg.type === "scatter") { o.s = await pairs(o.cfg); o.chart = drawScatter(o.canvas, o.cfg, o.s, o.chart); return; }
  if (o.cfg.type === "groups") { o.s = await groupsData(o.cfg); o.chart = drawGroups(o.canvas, o.cfg, o.s, o.chart); return; }
  const s = o.s = await series(o.cfg), st = Math.max(0, s.vals.length - WIN[state.gran]);
  o.chart = draw(o.canvas, o.cfg, s.labels.slice(st), s.vals.slice(st), s.tr.slice(st), o.chart);
}
function addChart(host, cfg){
  const el = $(`<section class="card chart ${cfg.wide ? "wide" : ""}"><header><h3 style="color:${cfg.color}">${cfg.title}</h3><button class="zoom">🔍 Clicca per ingrandire</button></header><div class="cv"><canvas></canvas></div></section>`);
  host.append(el);
  const o = { cfg, canvas: el.querySelector("canvas") };
  if (cfg.type === "groups") { el.querySelector(".zoom").remove(); el.querySelector(".cv").style.cursor = "default"; }
  else el.querySelector(".cv").onclick = el.querySelector(".zoom").onclick = () => openModal(o);
  state.cards.push(o);
  return render(o);
}

/* ---------- zoom con scorrimento ---------- */
let M, mo, off = 0, mchart;
function openModal(o){
  if (!M) {
    M = $(`<div id="modal" role="dialog" aria-modal="true"><div class="top"><h3></h3><button class="pill" id="prev">◀ Indietro</button><span id="range"></span><button class="pill" id="next">Avanti ▶</button><button class="pill" id="close">Chiudi ✕</button></div><div class="cv"><canvas></canvas></div></div>`);
    document.body.append(M);
    M.querySelector("#close").onclick = () => M.classList.remove("open");
    M.querySelector("#prev").onclick = () => move(1);
    M.querySelector("#next").onclick = () => move(-1);
    addEventListener("keydown", e => { if (!M.classList.contains("open")) return; if (e.key === "Escape") M.classList.remove("open"); if (e.key === "ArrowLeft") move(1); if (e.key === "ArrowRight") move(-1); });
  }
  mo = o; off = 0;
  const sc = o.cfg.type === "scatter";
  M.querySelector("h3").textContent = o.cfg.title + (sc ? "" : " · " + GR.find(g => g[0] === state.gran)[1]);
  M.querySelectorAll("#prev,#next,#range").forEach(e => e.style.display = sc ? "none" : "");
  M.classList.add("open");
  if (sc) mchart = drawScatter(M.querySelector("canvas"), o.cfg, o.s, mchart); else mdraw();
}
const move = d => { off += d * Math.ceil(WIN[state.gran] / 2); mdraw(); };
function mdraw(){
  if (mo.cfg.type === "scatter") return;
  const s = mo.s, W = WIN[state.gran], n = s.vals.length;
  off = Math.max(0, Math.min(off, Math.max(0, n - W)));
  const end = n - off, st = Math.max(0, end - W);
  mchart = draw(M.querySelector("canvas"), mo.cfg, s.labels.slice(st, end), s.vals.slice(st, end), s.tr.slice(st, end), mchart);
  M.querySelector("#range").textContent = n ? `${s.labels[st]} → ${s.labels[end - 1]}` : "Nessun dato";
  M.querySelector("#prev").disabled = st === 0;
  M.querySelector("#next").disabled = off === 0;
}

/* ---------- popup di aiuto ---------- */
let H;
function openHelp(h, title){
  if (!H) {
    H = $(`<div id="help" role="dialog" aria-modal="true" aria-labelledby="ht"><div class="hbox"><h3 id="ht"></h3><div class="hb"></div><button class="pill on">Chiudi</button></div></div>`);
    document.body.append(H);
    const close = () => { H.classList.remove("open"); H.prev?.focus(); };
    H.onclick = e => { if (e.target === H) close(); };
    H.querySelector("button").onclick = close;
    addEventListener("keydown", e => { if (e.key === "Escape" && H.classList.contains("open")) close(); });
  }
  const row = (l, x) => x ? `<p><b>${l}</b> ${x}</p>` : "";
  H.querySelector("h3").textContent = h.t || title;
  H.querySelector(".hb").innerHTML = row("Cos'è:", h.d) + row("Come leggerlo:", h.r) + row("Da sapere:", h.n);
  H.prev = document.activeElement; H.classList.add("open"); H.querySelector("button").focus();
}
/* ---------- KPI: ultimo valore + variazione, medie 7 gg, KPI calcolati ---------- */
const iso = o => new Date(Date.now() - o * 864e5).toISOString().slice(0, 10);
const inW = (r, a, b = 0) => r.filter(x => x.d > iso(a) && x.d <= iso(b)); // giorni (b, a] fa
const V = r => r.map(x => x.v), avg = a => a.length ? sum(a) / a.length : NaN;
const sd = a => { const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
const last = r => r[r.length - 1]?.v, T = C.TARGET || {};
const mac = (s, k) => ({ n: ["proteine", "carbo", "grassi_g"], f: D => { const a = x => avg(V(inW(D[x], 7))); return 100 * a(s) * k / (4 * a("proteine") + 4 * a("carbo") + 9 * a("grassi_g")); } });
const CALC = {
  mg:   { n: ["muscolo", "grasso", "peso"], f: D => last(D.muscolo) / (last(D.peso) * last(D.grasso) / 100) },
  ffmi: { n: ["lbm"], f: D => last(D.lbm) / T.altezza_m ** 2 + 6.1 * (1.8 - T.altezza_m) },
  protkg: { n: ["proteine", "peso"], f: D => avg(V(inW(D.proteine, 7))) / last(D.peso) },
  aderenza: { n: ["kcal"], f: D => { const a = V(inW(D.kcal, 30)); return a.length ? 100 * a.filter(x => Math.abs(x / T.kcal - 1) <= .1).length / a.length : NaN; } },
  tdee: { n: ["kcal", "peso"], f: D => avg(V(inW(D.kcal, 28))) - (avg(V(inW(D.peso, 7))) - avg(V(inW(D.peso, 35, 28)))) * 7700 / 28 },
  macroP: mac("proteine", 4), macroC: mac("carbo", 4), macroF: mac("grassi_g", 9),
  sess:    { n: ["sessioni"], f: D => sum(V(inW(D.sessioni, 28))) / 4 },
  volsett: { n: ["volume"], f: D => sum(V(inW(D.volume, 28))) / 4 },
  giorni:  { n: ["volume"], f: D => { const l = D.volume.at(-1); return l ? Math.floor((Date.now() - Date.parse(l.d)) / 864e5) : NaN; } },
  streak:  { n: ["sessioni"], f: D => {
    const w = new Map(); D.sessioni.forEach(r => { const k = key(r.d, "week"); w.set(k, (w.get(k) || 0) + r.v); });
    const t = new Date(key(iso(0), "week") + "T00:00:00Z"), ok = () => (w.get(t.toISOString().slice(0, 10)) || 0) >= T.sessioni;
    let n = ok() ? 1 : 0; for (;;) { t.setUTCDate(t.getUTCDate() - 7); if (ok()) n++; else break; } return n; } },
  dens: { n: ["volume", "durata"], f: D => sum(V(inW(D.volume, 28))) / sum(V(inW(D.durata, 28))) },
  acwr: { n: ["volume"], f: D => sum(V(inW(D.volume, 7))) / (sum(V(inW(D.volume, 28))) / 4) },
  debito: { n: ["ore_sonno"], f: D => { const a = V(inW(D.ore_sonno, 7)); return T.sonno_h * a.length - sum(a); } },
  regol: { n: ["addorm"], f: D => sd(V(inW(D.addorm, 14))) },
  pr: { n: Object.keys(C.SOURCES).filter(k => k.startsWith("e1rm_")), f: D => Object.values(D).filter(r => { const a = Math.max(...V(inW(r, 30))), b = Math.max(...V(r.filter(x => x.d <= iso(30)))); return a > 0 && isFinite(b) && a > b; }).length },
  hrvb:  { n: ["hrv"], f: D => 100 * (avg(V(inW(D.hrv, 7))) / avg(V(inW(D.hrv, 60))) - 1) }
};
// KPI: {title, source, kind:'last'|'avg7'}  oppure  {title, calc:'nome'}
async function addKpis(host, list){
  for (const k of list) {
    const hk = k.calc || k.source, hp = (window.HELP || {})[hk];
    const el = $(`<div class="card kpi">${hp ? `<button class="info" aria-label="Spiegazione: ${k.title}" title="Cos'è?">i</button>` : ""}<small>${k.title}</small><div class="v" style="color:${k.color}">…</div><div class="d"></div></div>`);
    host.append(el);
    if (hp) el.querySelector(".info").onclick = () => openHelp(hp, k.title);
    (async () => {
      let v, sub = "", dl = null, dd = 30;
      if (k.calc) { const c = CALC[k.calc], D = {}; (await Promise.all(c.n.map(load))).forEach((r, i) => D[c.n[i]] = r); v = c.f(D); sub = k.note || ""; }
      else {
        const r = await load(k.source);
        if (k.kind === "avg7") { v = avg(V(inW(r, 7))); dl = v - avg(V(inW(r, 14, 7))); dd = 7; sub = "media 7 gg"; }
        else { v = last(r); sub = r.at(-1)?.d || ""; dl = avg(V(inW(r, 30))) - avg(V(inW(r, 60, 30))); }
      }
      const dec = k.dec ?? 1;
      el.querySelector(".v").textContent = isFinite(v) ? `${v.toFixed(dec)} ${k.unit || ""}`.trim() : "n/d";
      el.querySelector(".d").textContent = sub + (dl != null && isFinite(dl) ? ` · ${dl >= 0 ? "▲" : "▼"} ${Math.abs(dl).toFixed(dec)} vs ${dd} gg prec.` : "");
    })().catch(e => {
      console.error("KPI", k.title, e);
      el.querySelector(".v").textContent = "errore";
      el.querySelector(".d").textContent = e.message || String(e); // motivo reale (tabella/colonna inesistente, chiave errata…)
    });
  }
}
/* ---------- template dispersione (correlazioni) ---------- */
// {type:'scatter', x:'sorgente', y:'sorgente', lag:giorni (x precede y), dy:true (y = variazione vs periodo prec.), gran:'day'|'week'}
async function pairs(c){
  const g = c.gran || "day", sh = (k, n) => new Date(Date.parse(k) - n * 864e5).toISOString().slice(0, 10);
  const X = new Map(aggregate(await load(c.x), g, c.xagg || "avg").map(a => [a.k, a.v]));
  let Y = aggregate(await load(c.y), g, c.yagg || "avg");
  if (c.dy) Y = Y.slice(1).map((a, i) => ({ k: a.k, v: a.v - Y[i].v }));
  const pts = []; for (const y of Y) { const x = X.get(c.lag ? sh(y.k, c.lag) : y.k); if (x != null) pts.push({ x: +x.toFixed(2), y: +y.v.toFixed(2), l: y.k }); }
  let r = NaN, line = [];
  if (pts.length > 2) {
    const mx = avg(pts.map(p => p.x)), my = avg(pts.map(p => p.y)); let sxy = 0, sxx = 0, syy = 0;
    pts.forEach(p => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
    const b = sxy / sxx, xs = pts.map(p => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
    r = sxy / Math.sqrt(sxx * syy); line = [{ x: lo, y: my + b * (lo - mx) }, { x: hi, y: my + b * (hi - mx) }];
  }
  return { pts, line, r };
}
async function groupsData(c){
  const cut = iso(c.days || 28), g = {}, M = Object.entries(C.MUSCLES || {});
  for (const r of await sets()) {
    if (r.set_type === "warmup" || day(r.start_time) <= cut) continue;
    const k = (M.find(([, re]) => re.test(r.exercise_title || "")) || ["Altro"])[0];
    g[k] = (g[k] || 0) + (+r.weight_kg || 0) * (+r.reps || 0);
  }
  const e = Object.entries(g).sort((a, b) => b[1] - a[1]);
  return { labels: e.map(x => x[0]), vals: e.map(x => Math.round(x[1])) };
}
function drawGroups(cv, c, s, old){
  old && old.destroy(); const mut = "#94a3b8";
  return new Chart(cv, { type: "bar", data: { labels: s.labels, datasets: [{ label: c.label, data: s.vals, backgroundColor: c.color + "bb", borderColor: c.color, borderWidth: 1, borderRadius: 4 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: mut } } },
      scales: { x: { ticks: { color: mut }, grid: { color: "#334155" } }, y: { ticks: { color: mut }, grid: { display: false } } } } });
}
function drawScatter(cv, c, s, old){
  old && old.destroy();
  const mut = "#94a3b8", ax = t => ({ title: { display: !!t, text: t, color: mut }, ticks: { color: mut }, grid: { color: "#334155" } });
  return new Chart(cv, { type: "scatter", data: { datasets: [
    { label: `${c.label || "Dati"} (n=${s.pts.length})`, data: s.pts, backgroundColor: c.color + "cc", pointRadius: 4 },
    { type: "line", label: `Trend (r = ${isNaN(s.r) ? "n/d" : s.r.toFixed(2)})`, data: s.line, borderColor: "#fff", borderDash: [6, 5], borderWidth: 2, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: mut } }, tooltip: { callbacks: { label: i => `${i.raw.l || ""} (${i.raw.x}, ${i.raw.y})` } } },
      scales: { x: ax(c.xl), y: ax(c.yl) } } });
}
async function addChips(host){
  host.append($(`<span>📌 <b>Ultimo aggiornamento DB:</b></span>`));
  for (const g of C.GROUPS) {
    const chip = $(`<span class="chip">${g.label}: <b style="color:${g.color}">…</b></span>`);
    host.append(chip);
    load(g.source).then(r => { const l = r[r.length - 1]; chip.querySelector("b").textContent = l ? l.d.split("-").reverse().join("/") : "n/d"; }).catch(() => {});
  }
}

/* ---------- pagina ---------- */
function shell(p){
  const page = location.pathname.split("/").pop() || "index.html";
  document.title = p.title + " · Dashboard";
  const w = $(`<div class="wrap"><nav>${PAGES.map(([h, n]) => `<a href="${h}" class="${h === page ? "on" : ""}">${n}</a>`).join("")}</nav><div class="chips"></div><h1>${p.title}</h1><p class="sub">${p.sub}</p></div>`);
  document.body.append(w);
  addChips(w.querySelector(".chips"));
  return w;
}
async function init(p){
  const w = shell(p);
  const bar = $(`<div class="bar"><span>Aggrega per:</span>${GR.map(([g, n]) => `<button class="pill ${g === state.gran ? "on" : ""}" data-g="${g}">${n}</button>`).join("")}</div>`);
  const k = $(`<div class="kpis"></div>`), ch = $(`<div class="charts"></div>`);
  w.append(bar, k, ch);
  bar.onclick = e => {
    const g = e.target.dataset?.g; if (!g) return;
    state.gran = g; bar.querySelectorAll(".pill").forEach(b => b.classList.toggle("on", b.dataset.g === g));
    state.cards.forEach(render);
  };
  addKpis(k, p.kpis);
  for (const c of p.charts) {
    if (c.section) { ch.append($(`<div class="sec"><h2>${c.section}</h2>${c.note ? `<p class="msg">${c.note}</p>` : ""}</div>`)); continue; }
    await addChart(ch, c);
  }
}
window.Page = { init, shell, C };
if (window.__TEST__) window.__t = { load, CALC, aggregate, key };
})();
