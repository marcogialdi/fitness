// Misure: modulo per registrare le circonferenze (serve l'accesso) e storico delle ultime misurazioni.
// I grafici e i KPI della pagina sono disegnati dal motore comune (app.js); qui c'è solo l'inserimento.
window.Misure = { async mount(){
  const C = Page.C, esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = h => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
  const today = () => new Date().toLocaleDateString("sv-SE"), fmtD = d => d.split("-").reverse().join("/");
  const say = (el, text, ok) => { el.textContent = text; el.className = "msg " + (ok ? "ok" : "err"); };
  const sb = Page.client(), M = C.MISURE || [];
  const grp = [["Tronco", ["collo", "spalle", "petto", "vita", "fianchi"]], ["Braccia", ["braccio_dx", "braccio_sx", "avambraccio_dx", "avambraccio_sx"]], ["Gambe", ["coscia_dx", "coscia_sx", "polpaccio_dx", "polpaccio_sx"]]];
  const col = k => M.find(m => m[0] === k)[2], lab = k => M.find(m => m[0] === k)[1];
  const { data: rows, error } = await sb.from("body_measurements").select("*").order("measured_on", { ascending: false }).limit(60);
  const host = document.querySelector(".kpis") || document.querySelector(".wrap");
  if (error) {
    const miss = /does not exist|schema cache|PGRST205|42P01/i.test((error.message || "") + (error.code || ""));
    host.after($(`<section class="card"><h3>Tabella mancante</h3><p>${miss ? "La tabella delle misure non esiste ancora nel database. Esegui <b>setup_misure.sql</b> nello SQL Editor di Supabase e ricarica questa pagina." : "Errore: " + esc(error.message)}</p></section>`));
    return;
  }
  const last = rows[0], due = !last || (Date.parse(today()) - Date.parse(last.measured_on)) / 864e5 >= 28;
  const f = $(`<details class="more" id="mis-f"${due ? " open" : ""}><summary><span class="t">➕ Registra le misure</span><span class="n">${last ? "ultima: " + fmtD(last.measured_on) : "nessuna misura ancora"}</span></summary><div class="more-body">
    <div class="card"><div class="row" data-auth></div><p class="msg" id="mis-lock"></p>
    <p class="msg">Al mattino, a digiuno, muscolo rilassato, metro aderente ma senza stringere, sempre alla stessa altezza. Lascia vuote le sedi che non misuri: restano come sono.</p>
    <div class="row"><label>Data <input type="date" id="mis-d" value="${today()}" max="${today()}"></label></div>
    ${grp.map(([g, ks]) => `<h4>${g}</h4><div class="row mis-g">${ks.map(k => `<label>${lab(k)} (cm) <input type="text" inputmode="decimal" data-k="${k}" data-w placeholder="${last?.[col(k)] ?? ""}" autocomplete="off"></label>`).join("")}</div>`).join("")}
    <div class="row"><label style="flex:1">Nota <input type="text" id="mis-n" data-w placeholder="facoltativa" style="width:100%"></label></div>
    <div class="row"><button class="pill on" id="mis-sv" data-w>Salva</button><span id="mis-m" class="msg"></span></div></div>
    ${rows.length ? `<div class="card"><h4>Storico</h4><div class="tw"><table><tr><th>Data</th>${M.map(m => `<th>${esc(m[1].replace("Braccio", "Br.").replace("Avambraccio", "Avb.").replace("Coscia", "Cos.").replace("Polpaccio", "Polp."))}</th>`).join("")}<th></th></tr>
    ${rows.slice(0, 12).map(r => `<tr data-id="${r.id}"><td>${fmtD(r.measured_on)}</td>${M.map(m => `<td>${r[m[2]] ?? ""}</td>`).join("")}<td><button class="pill" style="width:auto;min-width:0;padding:.15rem .55rem" data-w data-del="${r.id}" title="Elimina" aria-label="Elimina la misura del ${fmtD(r.measured_on)}">✕</button></td></tr>`).join("")}</table></div></div>` : ""}</div></details>`);
  host.after(f);
  let user = null;
  const lock = () => f.querySelectorAll("[data-w]").forEach(e => { e.disabled = !user; });
  Auth.mount(f, sb, u => { user = u; lock(); f.querySelector("#mis-lock").textContent = u ? "" : "Senza accesso puoi solo consultare le misure."; });
  const num = v => { v = String(v).trim().replace(",", "."); return v === "" ? null : (/^\d+(\.\d+)?$/.test(v) ? +v : NaN); };
  const dEl = f.querySelector("#mis-d"), m = f.querySelector("#mis-m");
  // se esiste già una misura per la data scelta, il modulo la mostra per correggerla
  const fill = () => { const r = rows.find(x => x.measured_on === dEl.value); f.querySelectorAll("[data-k]").forEach(i => { i.value = r?.[col(i.dataset.k)] ?? ""; }); f.querySelector("#mis-n").value = r?.note ?? ""; if (r) say(m, "Esiste già una misura per questa data: salvando la sostituisci.", true); else m.textContent = ""; };
  dEl.onchange = fill; fill(); m.textContent = "";
  f.querySelector("#mis-sv").onclick = async () => {
    const rec = { measured_on: dEl.value }, bad = [];
    f.querySelectorAll("[data-k]").forEach(i => { const v = num(i.value); if (Number.isNaN(v) || (v != null && (v < 5 || v > 250))) bad.push(lab(i.dataset.k)); else rec[col(i.dataset.k)] = v; });
    if (!rec.measured_on) return say(m, "Scegli la data.", false);
    if (bad.length) return say(m, "Valore non valido (cm, tra 5 e 250): " + bad.join(", "), false);
    if (!M.some(x => rec[x[2]] != null)) return say(m, "Inserisci almeno una misura.", false);
    rec.note = f.querySelector("#mis-n").value.trim() || null;
    const { error: e } = await sb.from("body_measurements").upsert(rec, { onConflict: "measured_on" });
    if (e) return say(m, "Errore: " + e.message, false);
    say(m, "Salvato. Ricarico la pagina…", true); setTimeout(() => location.reload(), 700);
  };
  f.onclick = async e => {
    const id = e.target.dataset?.del; if (!id || !user) return;
    if (!confirm("Eliminare questa misurazione?")) return;
    const { error: er } = await sb.from("body_measurements").delete().eq("id", id);
    if (er) return say(m, "Errore: " + er.message, false);
    location.reload();
  };
} };
