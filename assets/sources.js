// Mappa sorgenti -> schema reale del database. Caricato DOPO config.js (che conserva URL e chiave).
Object.assign(window.CONFIG, {
  SOURCES: {
    // BIA: una riga per misurazione (timestamp)
    peso:    { table: "bia_measurements", date: "measurement_time", col: "weight" },
    lbm:     { table: "bia_measurements", date: "measurement_time", col: "lean_body_mass" },
    muscolo: { table: "bia_measurements", date: "measurement_time", col: "muscle_mass" },
    grasso:  { table: "bia_measurements", date: "measurement_time", col: "body_fat_percentage" },
    acqua:   { table: "bia_measurements", date: "measurement_time", col: "body_water" },
    visc:    { table: "bia_measurements", date: "measurement_time", col: "visceral_fat" },
    bmr:     { table: "bia_measurements", date: "measurement_time", col: "basal_metabolism" },
    eta_met: { table: "bia_measurements", date: "measurement_time", col: "body_age" },
    smi:     { table: "bia_measurements", date: "measurement_time", col: "smi" },
    score:   { table: "bia_measurements", date: "measurement_time", col: "body_score" },

    // Workouts: una riga per SERIE -> metriche calcolate per sessione (le serie "warmup" sono escluse)
    volume:   { kind: "workouts", metric: "volume" },   // somma peso x ripetizioni
    durata:   { kind: "workouts", metric: "durata" },   // end_time - start_time, in minuti
    sessioni: { kind: "workouts", metric: "sessioni" },
    serie:    { kind: "workouts", metric: "serie" },
    // 1RM stimato (Epley) = migliore serie della sessione. ADATTA le regex ai titoli reali degli esercizi.
    e1rm_panca:    { kind: "workouts", match: /^bench press|panca piana/i },
    e1rm_squat:    { kind: "workouts", match: /^squat/i },
    e1rm_stacco:   { kind: "workouts", match: /^deadlift|^stacco/i },
    e1rm_military: { kind: "workouts", match: /^overhead press|^military press|lento avanti/i },

    // RingConn: report SETTIMANALI (si usa week_end per allinearsi alle settimane degli allenamenti)
    sonno:     { table: "ringconn_weekly_reports", date: "week_end", col: "sleep_score" },
    ore_sonno: { table: "ringconn_weekly_reports", date: "week_end", col: "sleep_duration", parse: "hm" },
    fc_sonno:  { table: "ringconn_weekly_reports", date: "week_end", col: "sleep_hr_avg" },
    attivita:  { table: "ringconn_weekly_reports", date: "week_end", col: "activity_score" },
    passi:     { table: "ringconn_weekly_reports", date: "week_end", col: "steps_avg" },
    cal_att:   { table: "ringconn_weekly_reports", date: "week_end", col: "calories_avg" },
    stress:    { table: "ringconn_weekly_reports", date: "week_end", col: "stress_score" }
  },
  TARGET: { altezza_m: 1.80, sessioni: 3 },
  GROUPS: [
    { label: "BIA", source: "peso", color: "#38bdf8" },
    { label: "Workouts", source: "volume", color: "#facc15" },
    { label: "RingConn", source: "sonno", color: "#ec4899" }
  ],
  // Gruppi muscolari: vince la prima regex che corrisponde a exercise_title (altrimenti "Altro")
  MUSCLES: {
    Gambe:   /squat|leg|lunge|calf|affond|gamb|hip thrust|glute/i,
    Petto:   /bench|chest|pec|fly|croci|panca|petto/i,
    Spalle:  /shoulder|overhead|military|lateral|delt|spall|face pull/i,
    Schiena: /row|pull|lat |deadlift|stacco|schiena|rematore|trazion/i,
    Braccia: /curl|tricep|bicep|dip|pushdown|braccia|skull/i,
    Core:    /plank|crunch|abs|core|addome/i
  }
});
