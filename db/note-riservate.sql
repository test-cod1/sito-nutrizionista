-- Sposta le note del nutrizionista sul paziente in una tabella dedicata
-- "note_paziente", accessibile SOLO agli amministratori.
--
-- Perché: la tabella "pazienti" ha una policy che permette al paziente di
-- leggere e aggiornare la propria riga (user_id = auth.uid()) senza restrizione
-- di colonna. Finché "note" sta in "pazienti", un paziente può leggere (o
-- sovrascrivere) via API le annotazioni riservate del nutrizionista. Poiché
-- admin e paziente condividono lo stesso ruolo Postgres ("authenticated"), non
-- è possibile separarli con i privilegi di colonna: la soluzione pulita è
-- spostare il campo in una tabella con RLS solo-admin (nessuna policy paziente).
--
-- ISTRUZIONI DI ROLL-OUT SENZA INTERRUZIONI (eseguire nell'ordine):
--   1) Eseguire lo STEP 1 qui sotto (crea la tabella e copia i dati).
--   2) Deployare il nuovo codice del sito (git push): da quel momento le note
--      vengono lette/scritte da note_paziente.
--   3) Verificato che le note funzionino, eseguire lo STEP 2 (rimuove la vecchia
--      colonna pazienti.note e chiude definitivamente la fuga di dati).

-- ============================ STEP 1 ============================

create table if not exists public.note_paziente (
  paziente_id   uuid primary key references public.pazienti(id) on delete cascade,
  note          text,
  aggiornata_il timestamptz not null default now()
);

alter table public.note_paziente enable row level security;

-- Solo gli amministratori possono vedere e gestire le note riservate.
drop policy if exists note_paziente_admin_all on public.note_paziente;
create policy note_paziente_admin_all on public.note_paziente
  for all
  using (exists (select 1 from public.amministratori a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.amministratori a where a.user_id = auth.uid()));

-- Gate MFA RESTRICTIVE (in AND), coerente con le altre tabelle sensibili.
drop policy if exists "Richiede MFA se attiva" on public.note_paziente;
create policy "Richiede MFA se attiva" on public.note_paziente
  as restrictive
  for all
  using (mfa_soddisfatta())
  with check (mfa_soddisfatta());

-- Copia le note esistenti (solo quelle non vuote).
insert into public.note_paziente (paziente_id, note)
  select id, note from public.pazienti where note is not null and btrim(note) <> ''
  on conflict (paziente_id) do nothing;

-- ============================ STEP 2 ============================
-- Eseguire SOLO dopo aver deployato il nuovo codice e verificato le note.
-- Rimuove la colonna dalla tabella leggibile dal paziente: da qui la fuga è chiusa.

-- alter table public.pazienti drop column if exists note;
