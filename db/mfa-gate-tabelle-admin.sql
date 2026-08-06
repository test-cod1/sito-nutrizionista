-- Aggiunge il gate MFA (policy RESTRICTIVE, in AND) alle due tabelle admin che
-- ne erano prive — alimenti_etichette e modelli_dieta — per coerenza con tutte
-- le altre tabelle sensibili. Con la 2FA attiva sull'account admin, l'accesso a
-- queste tabelle richiederà lo step-up (aal2); senza 2FA nulla cambia
-- (mfa_soddisfatta() è true quando non c'è un fattore verificato).
-- Da eseguire una volta nel SQL editor di Supabase. Additivo e reversibile.

drop policy if exists "Richiede MFA se attiva" on public.alimenti_etichette;
create policy "Richiede MFA se attiva" on public.alimenti_etichette
  as restrictive
  for all
  using (mfa_soddisfatta())
  with check (mfa_soddisfatta());

drop policy if exists "Richiede MFA se attiva" on public.modelli_dieta;
create policy "Richiede MFA se attiva" on public.modelli_dieta
  as restrictive
  for all
  using (mfa_soddisfatta())
  with check (mfa_soddisfatta());
