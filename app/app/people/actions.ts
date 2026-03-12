"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { programTypeToDisplay } from "@/lib/program-display";
import { compareProgramCodes } from "@/lib/program-order";
import type { PersonRow } from "./types";

export type DeletePersonResult = { success: true } | { success: false; error: string };

export async function deletePerson(personId: string): Promise<DeletePersonResult> {
  if (!personId?.trim()) {
    return { success: false, error: "ID de participante no válido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("people").delete().eq("id", personId.trim());
  if (error) {
    return { success: false, error: error.message || "No se pudo eliminar al participante." };
  }
  revalidatePath("/app/people");
  return { success: true };
}

const BACKLOG_STATUSES = [
  "paid",
  "confirmed",
  "no_show_paid",
  "no_show_unpaid",
  "rescheduled",
] as const;

export type PeopleFilters = {
  city?: string;
  paymentMethod?: string;
  backlog?: boolean;
  eventId?: string;
};

export type EventFilterOption = { value: string; label: string };

export type EventFilterOptions = {
  events: EventFilterOption[];
};

export async function getEventFilterOptions(): Promise<EventFilterOptions> {
  const supabase = await createClient();
  const { data: events = [] } = await supabase
    .from("events")
    .select("id, program_type, code, city")
    .is("scheduled_deletion_at", null);

  type EventRow = { id: string; program_type: string; code: string; city: string | null };
  const rows = events as EventRow[];
  const eventsList: EventFilterOption[] = rows
    .filter((e) => e.program_type && e.code)
    .sort((a, b) => {
      const pt = compareProgramCodes(a.program_type ?? "", b.program_type ?? "");
      if (pt !== 0) return pt;
      const na = Number(a.code);
      const nb = Number(b.code);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a.code).localeCompare(String(b.code));
    })
    .map((e) => {
      const programLabel = programTypeToDisplay(e.program_type);
      const city = (e.city ?? "").trim();
      const label = city ? `${programLabel} ${e.code} ${city}` : `${programLabel} ${e.code}`;
      return { value: e.id, label: label.trim() };
    });
  return { events: eventsList };
}

export type PeopleCounts = {
  total: number;
  byCity: Record<string, number>;
  byPaymentMethod: Record<string, number>;
  backlogTotal: number;
};

type EnrollRow = {
  id: string;
  person_id: string;
  city: string | null;
  status: string;
  attended: boolean;
  replaced_by_enrollment_id?: string | null;
};

type EnrollRowWithEvent = EnrollRow & {
  event?: { program_type: string; code: string; scheduled_deletion_at: string | null } | null;
};

/** Supabase returns nested FK relations as array; normalize to single object. */
function normalizeEnrollmentRows(
  rows: { id: string; person_id: string; city: unknown; status: unknown; attended: unknown; replaced_by_enrollment_id?: unknown; event?: unknown }[]
): EnrollRowWithEvent[] {
  return rows.map((r) => {
    const event = Array.isArray(r.event) ? r.event[0] : r.event;
    return {
      id: r.id,
      person_id: r.person_id,
      city: r.city as string | null,
      status: r.status as string,
      attended: r.attended as boolean,
      replaced_by_enrollment_id: r.replaced_by_enrollment_id as string | null | undefined,
      event: event as EnrollRowWithEvent["event"],
    };
  });
}

/** Event shape when joined from enrollments. */
type EventRef = { start_date: string | null; city: string | null } | null;

/**
 * Effective city = city from the first event the person participated in (by event start_date).
 * Used so Participantes shows the city assigned in their first event, not only people.city.
 */
async function getEffectiveCityByPersonId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personIds: string[]
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (personIds.length === 0) return out;

  const { data: rows = [] } = await supabase
    .from("enrollments")
    .select("person_id, city, event:events(start_date, city)")
    .in("person_id", personIds);

  type Row = { person_id: string; city: string | null; event?: EventRef | EventRef[] };
  const byPerson = new Map<string, { start_date: string | null; city: string | null }[]>();
  for (const r of rows as Row[]) {
    const event = Array.isArray(r.event) ? r.event[0] : r.event;
    const start_date = event?.start_date ?? null;
    const city = (r.city?.trim() ? r.city : event?.city?.trim() ? event.city : null) ?? null;
    if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, []);
    byPerson.get(r.person_id)!.push({ start_date, city });
  }

  for (const pid of personIds) {
    const list = byPerson.get(pid);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => {
      const da = a.start_date ?? "";
      const db = b.start_date ?? "";
      return da.localeCompare(db);
    });
    const first = list[0];
    if (first.city) out[pid] = first.city;
  }
  return out;
}

function applyEffectiveCity(people: PersonRow[], effectiveCity: Record<string, string | null>): void {
  for (const p of people) {
    const city = effectiveCity[p.id];
    if (city !== undefined) (p as PersonRow).city = city;
  }
}

export async function getFilteredPeople(
  filters: PeopleFilters
): Promise<{ people: PersonRow[]; counts: PeopleCounts }> {
  const supabase = await createClient();

  const eventId = filters.eventId?.trim();
  const hasEventFilter = Boolean(eventId);
  const hasFilters =
    (filters.city && filters.city !== "all") ||
    (filters.paymentMethod && filters.paymentMethod !== "all") ||
    filters.backlog === true ||
    hasEventFilter;

  if (!hasFilters) {
    const { data: rows = [] } = await supabase
      .from("people")
      .select("id, first_name, last_name, email, phone, city, created_at")
      .order("created_at", { ascending: false });

    const people = rows as PersonRow[];
    const effectiveCity = await getEffectiveCityByPersonId(
      supabase,
      people.map((p) => p.id)
    );
    applyEffectiveCity(people, effectiveCity);
    const counts = await getPeopleCounts(supabase);
    return { people, counts };
  }

  let enrollmentRows: EnrollRowWithEvent[];
  if (hasEventFilter) {
    const { data: rows = [] } = await supabase
      .from("enrollments")
      .select("id, person_id, city, status, attended, replaced_by_enrollment_id")
      .eq("event_id", eventId);
    enrollmentRows = normalizeEnrollmentRows(rows ?? []);
  } else {
    const { data: rows = [] } = await supabase
      .from("enrollments")
      .select("id, person_id, city, status, attended, replaced_by_enrollment_id");
    enrollmentRows = normalizeEnrollmentRows(rows ?? []);
  }

  const enrollmentIds = enrollmentRows.map((r) => r.id);
  let enrollmentIdsWithPayment = new Set<string>();
  const paymentMethodByEnrollmentId: Record<string, string> = {};

  if (enrollmentIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("enrollment_id, method")
      .in("enrollment_id", enrollmentIds);

    if (payments) {
      for (const p of payments as { enrollment_id: string; method: string | null }[]) {
        enrollmentIdsWithPayment.add(p.enrollment_id);
        if (p.method) paymentMethodByEnrollmentId[p.enrollment_id] = p.method;
      }
    }
  }

  let matchingPersonIds = new Set<string>();
  for (const e of enrollmentRows) {
    const inBacklog =
      !e.attended &&
      !e.replaced_by_enrollment_id &&
      (BACKLOG_STATUSES.includes(e.status as (typeof BACKLOG_STATUSES)[number]) ||
        enrollmentIdsWithPayment.has(e.id));
    const paymentMethod = paymentMethodByEnrollmentId[e.id];
    const matchesPayment =
      !filters.paymentMethod ||
      filters.paymentMethod === "all" ||
      paymentMethod === filters.paymentMethod;
    const matchesBacklog = !filters.backlog || inBacklog;

    if (matchesPayment && matchesBacklog) {
      matchingPersonIds.add(e.person_id);
    }
  }

  if (filters.city && filters.city !== "all" && matchingPersonIds.size > 0) {
    const effectiveCity = await getEffectiveCityByPersonId(
      supabase,
      Array.from(matchingPersonIds)
    );
    const wantCity = filters.city === "Sin ciudad" ? "" : filters.city;
    matchingPersonIds = new Set(
      Array.from(matchingPersonIds).filter((id) => {
        const c = (effectiveCity[id] ?? "").trim();
        return wantCity === "" ? !c : c === filters.city;
      })
    );
  }

  if (matchingPersonIds.size === 0) {
    const counts = await getPeopleCounts(supabase);
    return { people: [], counts };
  }

  const { data: rows = [] } = await supabase
    .from("people")
    .select("id, first_name, last_name, email, phone, city, created_at")
    .in("id", Array.from(matchingPersonIds))
    .order("created_at", { ascending: false });

  const people = rows as PersonRow[];
  const effectiveCity = await getEffectiveCityByPersonId(
    supabase,
    people.map((p) => p.id)
  );
  applyEffectiveCity(people, effectiveCity);
  const counts = await getPeopleCounts(supabase);
  return { people, counts };
}

async function getPeopleCounts(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PeopleCounts> {
  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("id, person_id, status, attended, replaced_by_enrollment_id");

  type EnrollRowCount = {
    id: string;
    person_id: string;
    status: string;
    attended: boolean;
    replaced_by_enrollment_id?: string | null;
  };

  const enrollmentRowsTyped = (enrollmentRows ?? []) as EnrollRowCount[];
  const enrollmentIds = enrollmentRowsTyped.map((r) => r.id);
  const enrollmentIdToPersonId = new Map(
    enrollmentRowsTyped.map((r) => [r.id, r.person_id])
  );
  let enrollmentIdsWithPayment = new Set<string>();
  const personIdsByPaymentMethod: Record<string, Set<string>> = {};

  if (enrollmentIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("enrollment_id, method")
      .in("enrollment_id", enrollmentIds);

    if (payments) {
      for (const p of payments as { enrollment_id: string; method: string | null }[]) {
        enrollmentIdsWithPayment.add(p.enrollment_id);
        const m = p.method ?? "sin_pago";
        if (!personIdsByPaymentMethod[m]) personIdsByPaymentMethod[m] = new Set<string>();
        const personId = enrollmentIdToPersonId.get(p.enrollment_id);
        if (personId) personIdsByPaymentMethod[m].add(personId);
      }
    }
  }

  const paymentMethodCounts: Record<string, number> = {};
  for (const [method, set] of Object.entries(personIdsByPaymentMethod)) {
    paymentMethodCounts[method] = set.size;
  }

  const uniquePersonIds = [...new Set(enrollmentRowsTyped.map((r) => r.person_id))];
  const peopleByCity: Record<string, number> = {};
  let backlogTotal = 0;

  if (uniquePersonIds.length > 0) {
    const { data: peopleRows = [] } = await supabase
      .from("people")
      .select("id, city")
      .in("id", uniquePersonIds);
    for (const p of peopleRows as { id: string; city: string | null }[]) {
      const city = (p.city ?? "").trim() || "Sin ciudad";
      peopleByCity[city] = (peopleByCity[city] ?? 0) + 1;
    }
  }

  for (const e of enrollmentRowsTyped) {
    const inBacklog =
      !e.attended &&
      !e.replaced_by_enrollment_id &&
      (BACKLOG_STATUSES.includes(e.status as (typeof BACKLOG_STATUSES)[number]) ||
        enrollmentIdsWithPayment.has(e.id));
    if (inBacklog) backlogTotal += 1;
  }

  return {
    total: uniquePersonIds.length,
    byCity: peopleByCity,
    byPaymentMethod: paymentMethodCounts,
    backlogTotal,
  };
}
