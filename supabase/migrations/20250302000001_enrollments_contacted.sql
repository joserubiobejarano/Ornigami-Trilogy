-- Add contacted (Contactado) checkbox to enrollments.
alter table public.enrollments
  add column if not exists contacted boolean not null default false;
