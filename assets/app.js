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
let sb;
function load(id){
  return cache[id] ||= (async () => {
    const s = C.SOURCES[id];
    if (!C.SUPABASE_URL || !window.supabase) return demo(s.demo);
    sb ||= window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    let out = [], from = 0;
    for (;;) {
      const { data, error } = await sb.from(s.table).select(`${s.date},${s.col}`).not(s.col, "is", null).order(s.date).range(from, from + 999);
      if (error) throw error;
      out = out.concat(data.map(r => ({ d: String(r[s.date]).slice(0, 10), v: +r[s.col] })));
      if (data.length < 1000) break;
      from += 1000;
    }
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
  const s = o.s = await series(o.cfg), st = Math.max(0, s.vals.length - WIN[state.gran]);
  o.chart = draw(o.canvas, o.cfg, s.labels.slice(st), s.vals.slice(st), s.tr.slice(st), o.chart);
}
function addChart(host, cfg){
  const el = $(`<section class="card chart ${cfg.wide ? "wide" : ""}"><header><h3 style="color:${cfg.color}">${cfg.title}</h3><button class="zoom">🔍 Clicca per ingrandire</button></header><div class="cv"><canvas></canvas></div></section>`);
  host.append(el);
  const o = { cfg, canvas: el.querySelector("canvas") };
  el.querySelector(".cv").onclick = el.querySelector(".zoom").onclick = () => openModal(o);
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
  M.querySelector("h3").textContent = o.cfg.title + " · " + GR.find(g => g[0] === state.gran)[1];
  M.classList.add("open"); mdraw();
}
const move = d => { off += d * Math.ceil(WIN[state.gran] / 2); mdraw(); };
function mdraw(){
  const s = mo.s, W = WIN[state.gran], n = s.vals.length;
  off = Math.max(0, Math.min(off, Math.max(0, n - W)));
  const end = n - off, st = Math.max(0, end - W);
  mchart = draw(M.querySelector("canvas"), mo.cfg, s.labels.slice(st, end), s.vals.slice(st, end), s.tr.slice(st, end), mchart);
  M.querySelector("#range").textContent = n ? `${s.labels[st]} → ${s.labels[end - 1]}` : "Nessun dato";
  M.querySelector("#prev").disabled = st === 0;
  M.querySelector("#next").disabled = off === 0;
}

/* ---------- KPI e badge ---------- */
async function addKpis(host, list){
  for (const k of list) {
    const el = $(`<div class="card kpi"><small>${k.title}</small><div class="v" style="color:${k.color}">…</div><div class="d"></div></div>`);
    host.append(el);
    load(k.source).then(rows => {
      const l = rows[rows.length - 1];
      el.querySelector(".v").textContent = l ? `${l.v.toFixed(k.dec ?? 1)} ${k.unit || ""}`.trim() : "n/d";
      el.querySelector(".d").textContent = l ? l.d : "";
    }).catch(() => { el.querySelector(".v").textContent = "errore"; });
  }
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
  for (const c of p.charts) await addChart(ch, c);
}
window.Page = { init, shell, C };
})();
