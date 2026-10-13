// ====== CONFIGURAZIONE ======
// Lascia SUPABASE_URL vuoto per vedere i dati di esempio (demo).
// La chiave "anon" è pubblica per natura: proteggi i dati con le policy RLS di Supabase.
window.CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Ogni sorgente = una colonna di una tabella. Adatta table/date/col al tuo schema.
  // agg: come aggregare più valori nello stesso periodo (avg | sum | last | max)
  SOURCES: {
    peso:       { table: "bia",          date: "data", col: "peso",        demo: { base: 77, slope: .004, amp: 1.2, period: 60, noise: 1.2, dec: 2 } },
    lbm:        { table: "bia",          date: "data", col: "lbm",         demo: { base: 64, slope: .003, amp: .6, period: 60, noise: .8, seed: 3 } },
    muscolo:    { table: "bia",          date: "data", col: "massa_musc",  demo: { base: 60, slope: .003, amp: .5, period: 60, noise: .7, seed: 4 } },
    grasso:     { table: "bia",          date: "data", col: "massa_grassa",demo: { base: 17, slope: -.004, amp: .6, period: 90, noise: .6, seed: 5 } },
    kcal:       { table: "alimentazione",date: "data", col: "kcal",        demo: { base: 2500, slope: 0, amp: 150, period: 14, noise: 500, dec: 0, seed: 6 } },
    proteine:   { table: "alimentazione",date: "data", col: "proteine",    demo: { base: 150, slope: .02, amp: 10, period: 14, noise: 40, dec: 0, seed: 8 } },
    volume:     { table: "workouts",     date: "data", col: "volume",      demo: { base: 6000, slope: 0, amp: 1500, period: 30, noise: 4000, sparse: .4, dec: 0, seed: 9 } },
    durata:     { table: "workouts",     date: "data", col: "durata_min",  demo: { base: 65, slope: 0, amp: 8, period: 30, noise: 25, sparse: .4, dec: 0, seed: 9 } },
    sessioni:   { table: "workouts",     date: "data", col: "sessione",    demo: { base: 1, slope: 0, amp: 0, period: 1, noise: 0, sparse: .4, dec: 0, seed: 9 } },
    sonno:      { table: "ringconn",     date: "data", col: "sleep_score", demo: { base: 80, slope: -.005, amp: 4, period: 20, noise: 8, dec: 0, seed: 11 } },
    ore_sonno:  { table: "ringconn",     date: "data", col: "ore_sonno",   demo: { base: 7.2, slope: 0, amp: .4, period: 20, noise: 1.2, seed: 12 } },
    hrv:        { table: "ringconn",     date: "data", col: "hrv",         demo: { base: 52, slope: .01, amp: 5, period: 25, noise: 10, dec: 0, seed: 13 } },
    fc_riposo:  { table: "ringconn",     date: "data", col: "fc_riposo",   demo: { base: 56, slope: -.004, amp: 2, period: 25, noise: 4, dec: 0, seed: 14 } }
  },

  // Badge "Ultimo aggiornamento DB" (una sorgente rappresentativa per gruppo)
  GROUPS: [
    { label: "BIA", source: "peso", color: "#38bdf8" },
    { label: "Workouts", source: "volume", color: "#facc15" },
    { label: "RingConn", source: "sonno", color: "#ec4899" }
  ]
};
