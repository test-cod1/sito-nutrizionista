// Configurazione connessione Supabase.
// La chiave qui sotto è la "publishable/anon" key: è pensata per stare nel
// codice del sito ed essere pubblica — la protezione dei dati è garantita
// dalle regole (Row Level Security) impostate nel database, non dal
// nascondere questa chiave.
const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_EJ_oqaFOqZ8rHTpuhS27EA_-56te9DW";

// Chiave pubblica VAPID per le notifiche push: è pensata per essere pubblica
// (serve al browser per criptare la subscription), la controparte privata
// resta solo lato server e non va mai messa qui.
const VAPID_PUBLIC_KEY = "BHyHOci-J4N4PzeWkF8tkFXoRQoHhfvMhEGZcLnoqq-qePusl38LU-Hpr6hp8hqWQt4sEdz8I9J-Ob2uVYJl9Qc";
