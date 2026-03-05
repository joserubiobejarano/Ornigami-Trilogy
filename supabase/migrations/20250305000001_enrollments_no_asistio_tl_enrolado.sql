-- Add no_asistio (No Asistió) and tl_enrolado (TL enrolado) to enrollments.
alter table public.enrollments
  add column if not exists no_asistio boolean not null default false;
alter table public.enrollments
  add column if not exists tl_enrolado text;
