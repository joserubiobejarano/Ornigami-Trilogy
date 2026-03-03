-- Backfill people.city from most recent enrollment for participants who still have null.
-- Safe to run multiple times: only updates rows where people.city is null.
update public.people p
set city = sub.city
from (
  select distinct on (e.person_id) e.person_id, coalesce(e.city, ev.city) as city
  from public.enrollments e
  join public.events ev on ev.id = e.event_id
  where ev.scheduled_deletion_at is null
    and coalesce(e.city, ev.city) is not null
    and trim(coalesce(e.city, ev.city)) <> ''
  order by e.person_id, e.created_at desc
) sub
where p.id = sub.person_id
  and (p.city is null or trim(p.city) = '');
