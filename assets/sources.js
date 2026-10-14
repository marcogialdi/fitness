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
    imp_br_dx: { table: "bia_measurements", date: "measurement_time", col: "right_arm_bioelectrical_impedance" },
    imp_br_sx: { table: "bia_measurements", date: "measurement_time", col: "left_arm_bioelectrical_impedance" },
    imp_tronco: { table: "bia_measurements", date: "measurement_time", col: "trunk_bioelectrical_impedance" },
    imp_gb_dx: { table: "bia_measurements", date: "measurement_time", col: "right_leg_bioelectrical_impedance" },
    imp_gb_sx: { table: "bia_measurements", date: "measurement_time", col: "left_leg_bioelectrical_impedance" },
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

// Struttura delle tabelle scrivibili da "Carica Dati" (tipi: text | int | num | ts)
window.CONFIG.TABLES = (() => {
  const cols = (ty, s) => Object.fromEntries(s.split(/\s+/).map(c => [c, ty]));
  return {
    bia_measurements: { label: "BIA", req: "measurement_time", uniq: ["measurement_time"], cols: {
      ...cols("ts", "measurement_time"),
      ...cols("int", "heart_rate visceral_fat basal_metabolism body_age body_score"),
      ...cols("num", "weight bmi body_fat_percentage subcutaneous_fat cardiac_index body_water skeletal_muscle_rate muscle_mass bone_mass protein body_fat_mass water_content skeletal_muscle muscle_rate protein_mass obesity_degree lean_body_mass smi recommended_target_weight weight_control fat_control muscle_control left_arm_segmental_fat_analysis right_arm_segmental_fat_analysis trunk_segmental_fat_analysis left_leg_segmental_fat_analysis right_leg_segmental_fat_analysis left_arm_muscle_balance right_arm_muscle_balance trunk_muscle_balance left_leg_muscle_balance right_leg_muscle_balance right_arm_bioelectrical_impedance left_arm_bioelectrical_impedance trunk_bioelectrical_impedance right_leg_bioelectrical_impedance left_leg_bioelectrical_impedance") } },
    workouts: { label: "Allenamenti", req: "start_time", cols: {
      ...cols("text", "title description exercise_title exercise_notes set_type"), ...cols("ts", "start_time end_time"),
      ...cols("int", "superset_id set_index reps"), ...cols("num", "weight_kg distance_km duration_seconds rpe") } }
  };
})();
