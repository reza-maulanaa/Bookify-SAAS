-- Phase 5: profil publik tenant (PRD §12 — section about & contact).
-- Section landing tampil implisit kalau datanya diisi; tanpa kolom toggle.
alter table tenants
  add column about           text,
  add column contact_phone   varchar(30),
  add column contact_address text;
