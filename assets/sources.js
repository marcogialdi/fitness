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
    stress:    { table: "ringconn_weekly_reports", date: "week_end", col: "stress_score" },

    // Alimentazione (Cronometer): si usa la riga "Total" di ogni giorno. Il giorno in corso è escluso perché ancora incompleto.
    kcal:     { table: "nutrition_daily", date: "log_date", col: "energy_kcal", where: { meal_group: "Total" }, daily: true },
    proteine: { table: "nutrition_daily", date: "log_date", col: "protein_g",   where: { meal_group: "Total" }, daily: true },
    carbo:    { table: "nutrition_daily", date: "log_date", col: "carbs_g",     where: { meal_group: "Total" }, daily: true },
    grassi_g: { table: "nutrition_daily", date: "log_date", col: "fat_g",       where: { meal_group: "Total" }, daily: true },
    fibre:    { table: "nutrition_daily", date: "log_date", col: "fiber_g",     where: { meal_group: "Total" }, daily: true },
    sodio:    { table: "nutrition_daily", date: "log_date", col: "sodium_mg",   where: { meal_group: "Total" }, daily: true }
  },
  // true = nei grafici e nei KPI di alimentazione contano solo i giorni segnati "Completato" in Cronometer
  SOLO_COMPLETATI: false,
  TARGET: { altezza_m: 1.80, sessioni: 3, kcal: 2500 },
  GROUPS: [
    { label: "BIA", source: "peso", color: "#38bdf8" },
    { label: "Workouts", source: "volume", color: "#facc15" },
    { label: "RingConn", source: "sonno", color: "#ec4899" },
    { label: "Alimentazione", source: "kcal", color: "#4ade80" }
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
    nutrition_daily: { label: "Alimentazione (Cronometer)", req: "log_date", uniq: ["log_date", "meal_group"],
      merge: { col: "log_date" }, needs: { col: "meal_group", val: "Total", by: "log_date" }, alias: { date: "log_date", group: "meal_group" },
      cols: { log_date: "date", meal_group: "text", ...cols("num", "energy_kcal alcohol_g caffeine_mg oxalate_mg phytate_mg water_g b1_thiamine_mg b2_riboflavin_mg b3_niacin_mg b5_pantothenic_acid_mg b6_pyridoxine_mg b12_cobalamin_ug folate_ug vitamin_a_ug vitamin_c_mg vitamin_d_iu vitamin_e_mg vitamin_k_ug calcium_mg copper_mg iron_mg magnesium_mg manganese_mg phosphorus_mg potassium_mg selenium_ug sodium_mg zinc_mg net_carbs_g carbs_g fiber_g insoluble_fiber_g soluble_fiber_g starch_g sugars_g added_sugars_g fat_g cholesterol_mg monounsaturated_g polyunsaturated_g saturated_g trans_fats_g omega_3_g ala_g dha_g epa_g omega_6_g aa_g la_g cystine_g histidine_g isoleucine_g leucine_g lysine_g methionine_g phenylalanine_g protein_g threonine_g tryptophan_g tyrosine_g valine_g"), completed: "bool" } },
    workouts: { label: "Allenamenti", req: "start_time", cols: {
      ...cols("text", "title description exercise_title exercise_notes set_type"), ...cols("ts", "start_time end_time"),
      ...cols("int", "superset_id set_index reps"), ...cols("num", "weight_kg distance_km duration_seconds rpe") } }
  };
})();
