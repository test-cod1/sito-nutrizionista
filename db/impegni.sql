-- Tabella "impegni": eventi del calendario NON legati a un paziente
-- (riunioni, formazione, ferie, impegni personali dell'admin).
-- Da eseguire una volta nel SQL editor di Supabase.

create table if not exists public.impegni (
  id            uuid primary key default gen_random_uuid(),
  titolo        text        not null,
  data_ora      timestamptz not null,
  durata_minuti integer     not null default 60,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists impegni_data_ora_idx on public.impegni (data_ora);

alter table public.impegni enable row level security;

-- Solo gli amministratori possono vedere e gestire gli impegni.
-- (Coerente con determinaRuolo(): un utente è admin se compare in amministratori.)
drop policy if exists impegni_admin_all on public.impegni;
create policy impegni_admin_all on public.impegni
  for all
  using (exists (select 1 from public.amministratori a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.amministratori a where a.user_id = auth.uid()));

-- Gate MFA identico a quello della tabella "appuntamenti": policy RESTRICTIVE
-- (in AND con quella admin), così l'accesso richiede il 2FA completato quando
-- attivo. Senza "as restrictive" verrebbe messa in OR e il 2FA sarebbe aggirabile.
drop policy if exists "Richiede MFA se attiva" on public.impegni;
create policy "Richiede MFA se attiva" on public.impegni
  as restrictive
  for all
  using (mfa_soddisfatta())
  with check (mfa_soddisfatta());
