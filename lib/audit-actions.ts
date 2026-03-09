"use server";

import { createClient } from "@/lib/supabase/server";
import { programTypeToDisplay } from "@/lib/program-display";
import type { AuditLogRow } from "./audit";

export type AuditLogEntry = AuditLogRow & {
  actor_label: string;
  event_label: string | null;
  /** When the change is inside a participant row: participant name/email and row number for display */
  participant_reference?: string | null;
};

export async function getAuditLogAll(limit = 100): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, entity_type, entity_id, action, changed_by, changed_at, context, changes")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  const rows = (data ?? []) as AuditLogRow[];
  const eventIds = [
    ...new Set(
      rows
        .map((r) => r.context?.event_id as string | undefined)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  let eventLabels: Record<string, string> = {};
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, program_type, code, city")
      .in("id", eventIds);
    if (events) {
      eventLabels = Object.fromEntries(
        (events as { id: string; program_type: string | null; code: string | null; city: string | null }[]).map(
          (e) => {
            const programDisplay = programTypeToDisplay(e.program_type ?? "");
            const code = (e.code ?? "").trim();
            const city = (e.city ?? "").trim();
            const label = [programDisplay && code ? `${programDisplay} ${code}` : code || programDisplay, city ? `Ciudad: ${city}` : ""]
              .filter(Boolean)
              .join(" · ") || e.id;
            return [e.id, label];
          }
        )
      );
    }
  }

  // Build participant reference data: eventId -> ordered list of { enrollment_id, person_id, label, rowNumber }
  const eventIdsForParticipants = [
    ...new Set(
      rows
        .filter((r) => {
          const ctx = r.context ?? {};
          const eventId = ctx.event_id;
          const hasEnrollment = ctx.enrollment_id || r.entity_type === "enrollment";
          const hasPerson = ctx.person_id || r.entity_type === "person";
          return typeof eventId === "string" && (hasEnrollment || hasPerson);
        })
        .map((r) => r.context?.event_id as string)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  type EnrollmentWithPerson = {
    id: string;
    person_id: string;
    person: { first_name: string | null; last_name: string | null; email: string } | { first_name: string | null; last_name: string | null; email: string }[];
  };
  const enrollmentOrderByEvent: Record<string, { enrollmentId: string; personId: string; label: string; rowNumber: number }[]> = {};
  for (const eventId of eventIdsForParticipants) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, person_id, person:people(first_name, last_name, email)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    const list = (enrollments ?? []) as EnrollmentWithPerson[];
    enrollmentOrderByEvent[eventId] = list.map((enr, index) => {
      const person = Array.isArray(enr.person) ? enr.person[0] : enr.person;
      const first = person?.first_name ?? "";
      const last = person?.last_name ?? "";
      const email = person?.email ?? "";
      const name = [first, last].filter(Boolean).join(" ").trim();
      const label = name ? `${name} (${email || "—"})` : email || "—";
      return {
        enrollmentId: enr.id,
        personId: enr.person_id,
        label,
        rowNumber: index + 1,
      };
    });
  }

  return rows.map((row) => {
    const ctx = row.context ?? {};
    const actorEmail = ctx.actor_email as string | null | undefined;
    const eventId = ctx.event_id as string | undefined;
    const enrollmentId = (ctx.enrollment_id as string | undefined) ?? (row.entity_type === "enrollment" ? row.entity_id : undefined);
    const personId = (ctx.person_id as string | undefined) ?? (row.entity_type === "person" ? row.entity_id : undefined);

    let participant_reference: string | null = null;
    if (eventId && enrollmentOrderByEvent[eventId]) {
      const byEnrollment = enrollmentId
        ? enrollmentOrderByEvent[eventId].find((x) => x.enrollmentId === enrollmentId)
        : undefined;
      const byPerson = personId
        ? enrollmentOrderByEvent[eventId].find((x) => x.personId === personId)
        : undefined;
      const ref = byEnrollment ?? byPerson;
      if (ref) {
        participant_reference = `${ref.label} · Fila ${ref.rowNumber}`;
      }
    }

    return {
      ...row,
      actor_label: typeof actorEmail === "string" && actorEmail ? actorEmail : row.changed_by ? "Usuario" : "Sistema",
      event_label: eventId ? eventLabels[eventId] ?? null : null,
      participant_reference: participant_reference ?? undefined,
    };
  });
}

export async function getAuditLogForEvent(
  eventId: string,
  limit = 50
): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, entity_type, entity_id, action, changed_by, changed_at, context, changes")
    .contains("context", { event_id: eventId })
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  const rows = (data ?? []) as AuditLogRow[];
  return rows.map((row) => ({
    ...row,
    actor_label: row.changed_by ? "Usuario" : "Sistema",
    event_label: null,
  }));
}

export async function getAuditLogForEntity(
  entityType: string,
  entityId: string,
  limit = 30
): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, entity_type, entity_id, action, changed_by, changed_at, context, changes")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  const rows = (data ?? []) as AuditLogRow[];
  return rows.map((row) => ({
    ...row,
    actor_label: row.changed_by ? "Usuario" : "Sistema",
    event_label: null,
  }));
}

export async function getAuditLogForPerson(
  personId: string,
  limit = 50
): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const [personResult, contextResult] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, entity_type, entity_id, action, changed_by, changed_at, context, changes")
      .eq("entity_type", "person")
      .eq("entity_id", personId)
      .order("changed_at", { ascending: false })
      .limit(limit),
    supabase
      .from("audit_log")
      .select("id, entity_type, entity_id, action, changed_by, changed_at, context, changes")
      .contains("context", { person_id: personId })
      .order("changed_at", { ascending: false })
      .limit(limit),
  ]);

  const personRows = (personResult.data ?? []) as AuditLogRow[];
  const contextRows = (contextResult.data ?? []) as AuditLogRow[];
  const seen = new Set<string>();
  const merged: AuditLogRow[] = [];
  for (const row of [...personRows, ...contextRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  merged.sort(
    (a, b) =>
      new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );
  return merged.slice(0, limit).map((row) => ({
    ...row,
    actor_label: row.changed_by ? "Usuario" : "Sistema",
    event_label: null,
  }));
}
