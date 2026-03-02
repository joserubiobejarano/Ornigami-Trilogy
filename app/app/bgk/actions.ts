"use server";

import { createClient } from "@/lib/supabase/server";
import { programTypeToDisplay } from "@/lib/program-display";
import { INSCRIPTION_VALID_DAYS } from "@/app/app/people/constants";

type EventRelation = {
  program_type: string | null;
  code: string | null;
  scheduled_deletion_at: string | null;
} | null;

type PersonRelation = {
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  created_at: string | null;
} | null;

type RawRow = {
  id: string;
  person_id: string;
  status: string;
  event: EventRelation | EventRelation[] | null;
  person: PersonRelation | PersonRelation[] | null;
};

function hasBGKTag(status: string): boolean {
  const tags = (status ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return tags.includes("BGK");
}

function buildEntrenamientoLabel(
  event: EventRelation | null
): string {
  if (!event || (!event.program_type && !event.code)) return "—";
  const programType = event.program_type?.trim() ?? "";
  const code = event.code != null ? String(event.code).trim() : "";
  if (!programType && !code) return "—";
  const label = programTypeToDisplay(programType);
  return code ? `${label} ${code}` : label;
}

/** Days remaining from INSCRIPTION_VALID_DAYS since person created_at (UTC). */
function daysRemaining(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const elapsedDays = Math.floor((now - created) / (24 * 60 * 60 * 1000));
  return Math.max(0, INSCRIPTION_VALID_DAYS - elapsedDays);
}

export type BGKRow = {
  enrollmentId: string;
  personId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  createdAt: string | null;
  entrenamientoLabel: string;
  daysRemaining: number | null;
};

export async function getBGKEnrollments(): Promise<BGKRow[]> {
  const supabase = await createClient();

  const { data: rows = [] } = await supabase
    .from("enrollments")
    .select(
      "id, person_id, status, event:events(program_type, code, scheduled_deletion_at), person:people(first_name, last_name, email, phone, city, created_at)"
    )
    .ilike("status", "%BGK%");

  const raw = (rows ?? []) as RawRow[];
  const result: BGKRow[] = [];

  for (const r of raw) {
    if (!hasBGKTag(r.status)) continue;

    const event = Array.isArray(r.event) ? r.event[0] ?? null : r.event;
    const person = Array.isArray(r.person) ? r.person[0] ?? null : r.person;

    if (!person) continue;

    result.push({
      enrollmentId: r.id,
      personId: r.person_id,
      firstName: person.first_name,
      lastName: person.last_name,
      email: person.email,
      phone: person.phone,
      city: person.city,
      createdAt: person.created_at ?? null,
      entrenamientoLabel: buildEntrenamientoLabel(event),
      daysRemaining: daysRemaining(person.created_at),
    });
  }

  return result;
}
