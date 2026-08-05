-- Aggiunge la colonna "ultimo_promemoria_checkin" alla tabella pazienti.
-- Serve al worker-notifiche-checkin per NON inviare più di un promemoria push
-- per la stessa scadenza di check-in (idempotenza) pur potendo recuperare i
-- promemoria di un giorno saltato dal cron (finestra "dovuto o già scaduto").
-- Da eseguire una volta nel SQL editor di Supabase, PRIMA di deployare il worker.

alter table public.pazienti
  add column if not exists ultimo_promemoria_checkin date;
