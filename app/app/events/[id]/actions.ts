"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreatePersonAndEnroll } from "@/lib/enrollment";
import { writeAuditLog } from "@/lib/audit";
import type {
  EnrollmentRow,
  EventWithEnrollments,
  ViewFilter,
} from "@/app/app/events/types";

const BACKLOG_STATUSES = [
  "paid",
  "confirmed",
  "no_show_paid",
  "no_show_unpaid",
] as const;

const BOOLEAN_FIELDS = [
  "attended",
  "details_sent",
  "confirmed",
  "contract_signed",
  "cca_signed",
  "contacted",
  "health_doc_signed",
  "tl_norms_signed",
  "tl_rules_signed",
  "finalized",
  "withdrew",
  "no_asistio",
] as const;

const TEXT_FIELDS = ["admin_notes", "angel_name", "city", "status", "tl_enrolado"] as const;
const NUMBER_FIELDS = ["cantidad"] as const;

type AllowedField =
  | (typeof BOOLEAN_FIELDS)[number]
  | (typeof TEXT_FIELDS)[number]
  | (typeof NUMBER_FIELDS)[number];

function applyViewFilter(
  enrollments: EnrollmentRow[],
  view: ViewFilter,
  enrollmentIdsWithPayment: Set<string>
): EnrollmentRow[] {
  if (!view) return enrollments;
  switch (view) {
    case "backlog":
      return enrollments.filter(
        (e) =>
          !e.attended &&
          !e.replaced_by_enrollment_id &&
          (BACKLOG_STATUSES.includes(e.status as (typeof BACKLOG_STATUSES)[number]) ||
            enrollmentIdsWithPayment.has(e.id))
      );
    case "confirmed":
      return enrollments.filter((e) => e.confirmed);
    case "attended":
      return enrollments.filter((e) => e.attended);
    case "finalized":
      return enrollments.filter((e) => e.finalized);
    default:
      return enrollments;
  }
}

export async function getEventWithEnrollments(
  eventId: string,
  view: ViewFilter
): Promise<EventWithEnrollments> {
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: enrollmentRows, error: enrollError } = await supabase
    .from("enrollments")
    .select(
      `
      id,
      event_id,
      person_id,
      status,
      attended,
      details_sent,
      confirmed,
      contract_signed,
      cca_signed,
      contacted,
      admin_notes,
      angel_name,
      city,
      health_doc_signed,
      tl_norms_signed,
      tl_rules_signed,
      cantidad,
      finalized,
      withdrew,
      no_asistio,
      tl_enrolado,
      created_at,
      replaced_by_enrollment_id,
      person:people(first_name, last_name, phone, email, created_at)
    `
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (enrollError) {
    throw new Error(enrollError.message);
  }

  const enrollmentIds =
    (enrollmentRows?.map((r: { id: string }) => r.id) as string[]) ?? [];
  const enrollmentIdsWithPayment = new Set<string>();

  type PaymentRow = {
    id: string;
    enrollment_id: string;
    method: string | null;
    amount: number | null;
    fee_amount: number | null;
    created_at: string;
  };

  const paymentsByEnrollmentId: Record<
    string,
    { last_payment: { id: string; method: string | null; fee_amount: number | null } | null; payments_by_method: Record<string, number | null>; payment_fee: number | null }
  > = {};
  if (enrollmentIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("id, enrollment_id, method, amount, fee_amount, created_at")
      .in("enrollment_id", enrollmentIds)
      .order("created_at", { ascending: true });

    if (payments) {
      for (const p of payments as PaymentRow[]) {
        const eid = p.enrollment_id;
        if (!paymentsByEnrollmentId[eid]) {
          paymentsByEnrollmentId[eid] = {
            last_payment: null,
            payments_by_method: {},
            payment_fee: null,
          };
        }
        const rec = paymentsByEnrollmentId[eid];
        enrollmentIdsWithPayment.add(eid);
        const method = (p.method ?? "").trim().toLowerCase();
        const numAmount = p.amount != null && !Number.isNaN(Number(p.amount)) ? Number(p.amount) : null;
        const numFee = p.fee_amount != null && !Number.isNaN(Number(p.fee_amount)) ? Number(p.fee_amount) : null;
        if (method) {
          rec.payments_by_method[method] = numAmount;
          if (!rec.last_payment) rec.last_payment = { id: p.id, method: p.method, fee_amount: numFee };
        } else {
          rec.payment_fee = numFee;
          if (!rec.last_payment) rec.last_payment = { id: p.id, method: null, fee_amount: numFee };
        }
      }
    }
  }
  for (const eid of enrollmentIds) {
    if (!paymentsByEnrollmentId[eid]) {
      paymentsByEnrollmentId[eid] = {
        last_payment: null,
        payments_by_method: {},
        payment_fee: null,
      };
    }
  }

  type EnrollRow = {
    id: string;
    event_id: string;
    person_id: string;
    status: string;
    attended: boolean;
    details_sent: boolean;
    confirmed: boolean;
    contract_signed: boolean;
    cca_signed: boolean;
    contacted: boolean;
    admin_notes: string | null;
    angel_name: string | null;
    city: string | null;
    health_doc_signed: boolean | null;
    tl_norms_signed: boolean | null;
    tl_rules_signed: boolean | null;
    cantidad: number | null;
    finalized: boolean;
    withdrew: boolean;
    no_asistio: boolean;
    tl_enrolado: string | null;
    created_at?: string;
    replaced_by_enrollment_id: string | null;
    person:
      | { first_name: string | null; last_name: string | null; phone: string | null; email: string }
      | { first_name: string | null; last_name: string | null; phone: string | null; email: string }[];
  };

  const defaultPerson = {
    first_name: null,
    last_name: null,
    phone: null,
    email: "",
    created_at: null as string | null,
  };

  const enrollments: EnrollmentRow[] = (enrollmentRows ?? []).map((r: EnrollRow) => {
    const person = Array.isArray(r.person) ? r.person[0] ?? defaultPerson : r.person ?? defaultPerson;
    return {
      id: r.id,
      event_id: r.event_id,
      person_id: r.person_id,
      status: r.status,
      attended: r.attended,
      details_sent: r.details_sent,
      confirmed: r.confirmed,
      contract_signed: r.contract_signed,
      cca_signed: r.cca_signed,
      contacted: r.contacted ?? false,
      admin_notes: r.admin_notes,
      angel_name: r.angel_name,
      city: r.city ?? null,
      health_doc_signed: r.health_doc_signed,
      tl_norms_signed: r.tl_norms_signed,
      tl_rules_signed: r.tl_rules_signed,
      finalized: r.finalized ?? false,
      withdrew: r.withdrew ?? false,
      no_asistio: r.no_asistio ?? false,
      tl_enrolado: r.tl_enrolado ?? null,
      cantidad:
        r.cantidad != null && String(r.cantidad).trim() !== "" && !Number.isNaN(Number(r.cantidad))
          ? Number(r.cantidad)
          : null,
      created_at: r.created_at,
      person,
      last_payment: paymentsByEnrollmentId[r.id]?.last_payment ?? null,
      payments_by_method: paymentsByEnrollmentId[r.id]?.payments_by_method ?? {},
      payment_fee: paymentsByEnrollmentId[r.id]?.payment_fee ?? null,
      replaced_by_enrollment_id: r.replaced_by_enrollment_id ?? null,
    };
  });

  // Order: place recipient immediately after the transferrer
  const recipientIds = new Set(
    enrollments.filter((e) => e.replaced_by_enrollment_id).map((e) => e.replaced_by_enrollment_id!)
  );
  const ordered: EnrollmentRow[] = [];
  const added = new Set<string>();
  for (const e of enrollments) {
    if (added.has(e.id)) continue;
    if (recipientIds.has(e.id)) continue; // defer recipients; add when we process their transferrer
    ordered.push(e);
    added.add(e.id);
    if (e.replaced_by_enrollment_id) {
      const recipient = enrollments.find((r) => r.id === e.replaced_by_enrollment_id);
      if (recipient && !added.has(recipient.id)) {
        ordered.push(recipient);
        added.add(recipient.id);
      }
    }
  }
  for (const e of enrollments) {
    if (!added.has(e.id)) ordered.push(e);
  }
  const sortedEnrollments = ordered;

  const filtered = applyViewFilter(sortedEnrollments, view, enrollmentIdsWithPayment);

  return {
    ...event,
    enrollments: filtered,
  } as EventWithEnrollments;
}

export type AddParticipantResult =
  | { success: true }
  | { success: false; error: string };

export async function addParticipant(
  eventId: string,
  formData: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email: string;
    angel_name?: string;
  }
): Promise<AddParticipantResult> {
  const supabase = await createClient();
  const result = await resolveOrCreatePersonAndEnroll(supabase, eventId, formData, {});
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (result.personCreated) {
    await writeAuditLog(supabase, {
      entity_type: "person",
      entity_id: result.personId,
      action: "insert",
      changed_by: user?.id ?? null,
      context: { event_id: eventId, actor_email: user?.email ?? null },
      changes: [],
    });
  }
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: result.enrollmentId,
    action: "insert",
    changed_by: user?.id ?? null,
    context: { event_id: eventId, person_id: result.personId, actor_email: user?.email ?? null },
    changes: [],
  });

  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/bgk");
  revalidatePath("/app/people");
  return { success: true };
}

export async function addExistingParticipantToEvent(
  eventId: string,
  personId: string
): Promise<AddParticipantResult> {
  const supabase = await createClient();

  // Fetch person with only required fields so we don't fail if optional columns (e.g. city) are missing or restricted
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, angel_name")
    .eq("id", personId)
    .single();

  if (personError) {
    // PGRST116 = no rows returned; treat as true "person not found"
    if (personError.code === "PGRST116" || personError.message?.includes("0 rows")) {
      return { success: false, error: "Persona no encontrada." };
    }
    return { success: false, error: "No se pudo verificar al participante. Inténtalo de nuevo." };
  }
  if (!person?.id) {
    return { success: false, error: "Persona no encontrada." };
  }

  // Optional: event city for enrollment/backfill; never block enrollment on this
  let eventCity: string | null = null;
  try {
    const { data: eventRow, error: eventError } = await supabase
      .from("events")
      .select("city")
      .eq("id", eventId)
      .single();
    if (!eventError && eventRow && typeof (eventRow as { city?: string | null }).city === "string") {
      eventCity = ((eventRow as { city: string }).city?.trim() || null);
    }
  } catch {
    // ignore; enrollment continues without city
  }

  const { data: existingEnroll } = await supabase
    .from("enrollments")
    .select("id")
    .eq("event_id", eventId)
    .eq("person_id", personId)
    .maybeSingle();

  if (existingEnroll?.id) {
    return { success: false, error: "Esta persona ya está inscrita en este evento." };
  }

  // Base insert: only columns that exist on enrollments in all environments (no city to avoid missing-column errors)
  const enrollmentInsert: {
    event_id: string;
    person_id: string;
    status: string;
    angel_name: string | null;
  } = {
    event_id: eventId,
    person_id: personId,
    status: "pending_contract",
    angel_name: (person.angel_name as string | null) ?? null,
  };

  const { data: enrollmentInserted, error: enrollError } = await supabase
    .from("enrollments")
    .insert(enrollmentInsert)
    .select("id")
    .single();

  if (enrollError) {
    if (enrollError.code === "23505") {
      return { success: false, error: "Esta persona ya está inscrita en este evento." };
    }
    return { success: false, error: "No se pudo agregar al participante. Inténtalo de nuevo." };
  }

  if (!enrollmentInserted?.id) {
    return { success: false, error: "No se pudo crear la inscripción." };
  }

  // Optional backfill: set people.city from event if supported; never block on this
  if (eventCity != null) {
    try {
      const { data: personRow } = await supabase
        .from("people")
        .select("city")
        .eq("id", personId)
        .single();
      const personCity = (personRow as { city?: string | null } | null)?.city ?? null;
      if (!personCity || !String(personCity).trim()) {
        await supabase.from("people").update({ city: eventCity }).eq("id", personId);
      }
    } catch {
      // ignore
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: enrollmentInserted.id,
    action: "insert",
    changed_by: user?.id ?? null,
    context: { event_id: eventId, person_id: personId, actor_email: user?.email ?? null },
    changes: [],
  });

  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/bgk");
  revalidatePath("/app/people");
  return { success: true };
}

export type UpdateEnrollmentFieldResult =
  | { success: true }
  | { success: false; error: string };

function toBool(value: boolean | string): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  return s === "true" || s === "1";
}

function toNumber(value: number | string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const n = Number(String(value).trim());
  return Number.isNaN(n) ? null : n;
}

export async function updateEnrollmentField(
  enrollmentId: string,
  field: string,
  value: boolean | string | number | null
): Promise<UpdateEnrollmentFieldResult> {
  const allowed = [...BOOLEAN_FIELDS, ...TEXT_FIELDS, ...NUMBER_FIELDS];
  if (!allowed.includes(field as AllowedField)) {
    return { success: false, error: "Campo no válido." };
  }

  const isBoolean = BOOLEAN_FIELDS.includes(field as (typeof BOOLEAN_FIELDS)[number]);
  const isText = TEXT_FIELDS.includes(field as (typeof TEXT_FIELDS)[number]);
  const isNumber = NUMBER_FIELDS.includes(field as (typeof NUMBER_FIELDS)[number]);
  let payloadValue: boolean | string | number | null = value as boolean | string | number;
  if (isBoolean) {
    payloadValue = typeof value === "boolean" ? value : toBool(String(value));
  }
  if (isText && typeof value !== "string") {
    return { success: false, error: "El campo debe ser texto." };
  }
  if (isNumber) {
    payloadValue = toNumber(value as number | string);
  }

  const supabase = await createClient();
  const payload = { [field]: payloadValue };

  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollments")
    .select(`event_id, person_id, ${field}`)
    .eq("id", enrollmentId)
    .single();

  const eventId = (enrollment as { event_id?: string } | null)?.event_id;
  const personId = (enrollment as { person_id?: string } | null)?.person_id;
  if (fetchError || !eventId) {
    return { success: false, error: "Inscripción no encontrada." };
  }

  const oldValue = (enrollment as unknown as Record<string, unknown>)[field];

  const { error: updateError } = await supabase
    .from("enrollments")
    .update(payload)
    .eq("id", enrollmentId);

  if (updateError) {
    return { success: false, error: "No se pudo actualizar. Inténtalo de nuevo." };
  }

  if (
    field === "city" &&
    personId &&
    typeof payloadValue === "string" &&
    payloadValue.trim()
  ) {
    const { data: personRow } = await supabase
      .from("people")
      .select("city")
      .eq("id", personId)
      .single();
    const currentCity = (personRow as { city?: string | null } | null)?.city;
    if (!currentCity || !String(currentCity).trim()) {
      await supabase.from("people").update({ city: payloadValue.trim() }).eq("id", personId);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: enrollmentId,
    action: "update",
    changed_by: user?.id ?? null,
    context: { event_id: eventId, actor_email: user?.email ?? null },
    changes: [{ field, old_value: oldValue, new_value: payloadValue }],
  });

  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/people");
  return { success: true };
}

const PERSON_FIELDS = ["first_name", "last_name", "email", "phone"] as const;
type PersonField = (typeof PERSON_FIELDS)[number];

export type UpdatePersonFieldResult =
  | { success: true }
  | { success: false; error: string };

export async function updatePersonField(
  personId: string,
  eventId: string,
  field: PersonField,
  value: string
): Promise<UpdatePersonFieldResult> {
  if (!personId?.trim() || !eventId?.trim()) {
    return { success: false, error: "Faltan datos." };
  }
  if (!PERSON_FIELDS.includes(field)) {
    return { success: false, error: "Campo no válido." };
  }
  const trimmed = value.trim();
  if (field === "email" && !trimmed) {
    return { success: false, error: "El correo es obligatorio." };
  }

  const supabase = await createClient();

  const { data: person, error: fetchError } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .single();

  if (fetchError || !person?.id) {
    return { success: false, error: "Persona no encontrada." };
  }

  const payload =
    field === "email"
      ? { email: trimmed }
      : { [field]: trimmed || null };

  const { error: updateError } = await supabase
    .from("people")
    .update(payload)
    .eq("id", personId);

  if (updateError) {
    if (updateError.code === "23505") {
      return { success: false, error: "Ese correo ya está en uso por otra persona." };
    }
    return { success: false, error: "No se pudo actualizar. Inténtalo de nuevo." };
  }

  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/people");
  revalidatePath(`/app/people/${personId}`);
  return { success: true };
}

const PAYMENT_METHOD_UI_TO_DB: Record<string, string> = {
  Square: "square",
  Afterpay: "afterpay",
  Zelle: "zelle",
  Cash: "cash",
  TDC: "tdc",
};

export type UpdateEnrollmentPaymentAmountResult =
  | { success: true }
  | { success: false; error: string };

export async function updateEnrollmentPaymentAmount(
  enrollmentId: string,
  methodUiLabel: string,
  amountValue: number | null
): Promise<UpdateEnrollmentPaymentAmountResult> {
  const methodDb = PAYMENT_METHOD_UI_TO_DB[methodUiLabel];
  if (!methodDb) {
    return { success: false, error: "Forma de pago no válida." };
  }

  const supabase = await createClient();

  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollments")
    .select("event_id")
    .eq("id", enrollmentId)
    .single();

  if (fetchError || !enrollment?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }

  const { data: existing } = await supabase
    .from("payments")
    .select("id, amount")
    .eq("enrollment_id", enrollmentId)
    .eq("method", methodDb)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (existing?.id) {
    if (amountValue == null) {
      const { error: delErr } = await supabase
        .from("payments")
        .delete()
        .eq("id", existing.id);
      if (delErr) {
        return { success: false, error: "No se pudo actualizar el pago." };
      }
    } else {
      const { error: updateError } = await supabase
        .from("payments")
        .update({ amount: amountValue })
        .eq("id", existing.id);
      if (updateError) {
        return { success: false, error: "No se pudo actualizar el pago." };
      }
      await writeAuditLog(supabase, {
        entity_type: "payment",
        entity_id: existing.id,
        action: "update",
        changed_by: user?.id ?? null,
        context: { event_id: enrollment.event_id, enrollment_id: enrollmentId, actor_email: user?.email ?? null },
        changes: [{ field: "amount", old_value: existing.amount, new_value: amountValue }],
      });
    }
  } else if (amountValue != null) {
    const { data: inserted, error: insertError } = await supabase
      .from("payments")
      .insert({
        enrollment_id: enrollmentId,
        method: methodDb,
        amount: amountValue,
      })
      .select("id")
      .single();
    if (insertError || !inserted?.id) {
      return { success: false, error: "No se pudo crear el pago." };
    }
    await writeAuditLog(supabase, {
      entity_type: "payment",
      entity_id: inserted.id,
      action: "insert",
      changed_by: user?.id ?? null,
      context: { event_id: enrollment.event_id, enrollment_id: enrollmentId, actor_email: user?.email ?? null },
      changes: [
        { field: "method", old_value: null, new_value: methodDb },
        { field: "amount", old_value: null, new_value: amountValue },
      ],
    });
  }

  await updateEnrollmentCantidadFromPayments(supabase, enrollmentId, enrollment.event_id);
  revalidatePath(`/app/events/${enrollment.event_id}`);
  return { success: true };
}

export type UpdateEnrollmentPaymentFeeResult =
  | { success: true }
  | { success: false; error: string };

export async function updateEnrollmentPaymentFee(
  enrollmentId: string,
  feeValue: number | null
): Promise<UpdateEnrollmentPaymentFeeResult> {
  const supabase = await createClient();

  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollments")
    .select("event_id")
    .eq("id", enrollmentId)
    .single();

  if (fetchError || !enrollment?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }

  const { data: feeRow } = await supabase
    .from("payments")
    .select("id, fee_amount")
    .eq("enrollment_id", enrollmentId)
    .is("method", null)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (feeRow?.id) {
    const { error: updateError } = await supabase
      .from("payments")
      .update({ fee_amount: feeValue })
      .eq("id", feeRow.id);
    if (updateError) {
      return { success: false, error: "No se pudo actualizar el fee." };
    }
    if (Number(feeRow.fee_amount) !== (feeValue ?? 0)) {
      await writeAuditLog(supabase, {
        entity_type: "payment",
        entity_id: feeRow.id,
        action: "update",
        changed_by: user?.id ?? null,
        context: { event_id: enrollment.event_id, enrollment_id: enrollmentId, actor_email: user?.email ?? null },
        changes: [{ field: "fee_amount", old_value: feeRow.fee_amount, new_value: feeValue }],
      });
    }
  } else if (feeValue != null) {
    const { data: inserted, error: insertError } = await supabase
      .from("payments")
      .insert({
        enrollment_id: enrollmentId,
        method: null,
        fee_amount: feeValue,
      })
      .select("id")
      .single();
    if (insertError || !inserted?.id) {
      return { success: false, error: "No se pudo crear el registro del fee." };
    }
    await writeAuditLog(supabase, {
      entity_type: "payment",
      entity_id: inserted.id,
      action: "insert",
      changed_by: user?.id ?? null,
      context: { event_id: enrollment.event_id, enrollment_id: enrollmentId, actor_email: user?.email ?? null },
      changes: [{ field: "fee_amount", old_value: null, new_value: feeValue }],
    });
  }

  revalidatePath(`/app/events/${enrollment.event_id}`);
  return { success: true };
}

async function updateEnrollmentCantidadFromPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enrollmentId: string,
  eventId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from("payments")
    .select("amount")
    .eq("enrollment_id", enrollmentId)
    .not("method", "is", null);

  let total: number | null = null;
  if (rows?.length) {
    const sum = rows.reduce(
      (acc, r) => acc + (r.amount != null && !Number.isNaN(Number(r.amount)) ? Number(r.amount) : 0),
      0
    );
    total = sum > 0 ? sum : null;
  }
  await supabase
    .from("enrollments")
    .update({ cantidad: total })
    .eq("id", enrollmentId);
}

export type UpdateEnrollmentPaymentResult =
  | { success: true }
  | { success: false; error: string };

export async function updateEnrollmentPayment(
  enrollmentId: string,
  methodUiLabel: string,
  feeValue: number | null
): Promise<UpdateEnrollmentPaymentResult> {
  const methodDb = PAYMENT_METHOD_UI_TO_DB[methodUiLabel];
  if (!methodDb && methodUiLabel !== "") {
    return { success: false, error: "Forma de pago no válida." };
  }

  const supabase = await createClient();

  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollments")
    .select("event_id")
    .eq("id", enrollmentId)
    .single();

  if (fetchError || !enrollment?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }

  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, method, fee_amount")
    .eq("enrollment_id", enrollmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (existingPayment?.id) {
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        method: methodDb ?? null,
        fee_amount: feeValue,
      })
      .eq("id", existingPayment.id);

    if (updateError) {
      return { success: false, error: "No se pudo actualizar el pago. Inténtalo de nuevo." };
    }
    const changes: { field: string; old_value: unknown; new_value: unknown }[] = [];
    if (existingPayment.method !== (methodDb ?? null))
      changes.push({
        field: "method",
        old_value: existingPayment.method,
        new_value: methodDb ?? null,
      });
    if (Number(existingPayment.fee_amount) !== (feeValue ?? 0))
      changes.push({
        field: "fee_amount",
        old_value: existingPayment.fee_amount,
        new_value: feeValue,
      });
    if (changes.length > 0) {
      await writeAuditLog(supabase, {
        entity_type: "payment",
        entity_id: existingPayment.id,
        action: "update",
        changed_by: user?.id ?? null,
        context: { event_id: enrollment.event_id, enrollment_id: enrollmentId, actor_email: user?.email ?? null },
        changes,
      });
    }
  } else {
    const { data: insertedPayment, error: insertError } = await supabase
      .from("payments")
      .insert({
        enrollment_id: enrollmentId,
        method: methodDb ?? null,
        fee_amount: feeValue,
      })
      .select("id")
      .single();

    if (insertError || !insertedPayment?.id) {
      return { success: false, error: "No se pudo crear el pago. Inténtalo de nuevo." };
    }
    await writeAuditLog(supabase, {
      entity_type: "payment",
      entity_id: insertedPayment.id,
      action: "insert",
      changed_by: user?.id ?? null,
      context: { event_id: enrollment.event_id, enrollment_id: enrollmentId, actor_email: user?.email ?? null },
      changes: [
        { field: "method", old_value: null, new_value: methodDb ?? null },
        { field: "fee_amount", old_value: null, new_value: feeValue },
      ],
    });
  }

  revalidatePath(`/app/events/${enrollment.event_id}`);
  return { success: true };
}

export type DeleteEnrollmentResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteEnrollment(
  enrollmentId: string
): Promise<DeleteEnrollmentResult> {
  const supabase = await createClient();

  const { data: enrollment, error: fetchError } = await supabase
    .from("enrollments")
    .select("event_id")
    .eq("id", enrollmentId)
    .single();

  if (fetchError || !enrollment?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: enrollmentId,
    action: "delete",
    changed_by: user?.id ?? null,
    context: { event_id: enrollment.event_id, actor_email: user?.email ?? null },
    changes: [],
  });

  const { error: deleteError } = await supabase
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId);

  if (deleteError) {
    return { success: false, error: "No se pudo eliminar al participante del evento." };
  }

  revalidatePath(`/app/events/${enrollment.event_id}`);
  return { success: true };
}

export type TransferSpotResult =
  | { success: true }
  | { success: false; error: string };

export type TransferSpotTarget = {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  angel_name?: string;
};

function formatTransferNoteTo(recipientFirstName: string | null, recipientLastName: string | null): string {
  const first = String(recipientFirstName ?? "").trim();
  const last = String(recipientLastName ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ") || "Sin nombre";
  return `Transfirió su cupo a ${name}`;
}

function formatTransferNoteFrom(transferrerFirstName: string | null, transferrerLastName: string | null): string {
  const first = String(transferrerFirstName ?? "").trim();
  const last = String(transferrerLastName ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ") || "Sin nombre";
  return `Recibió cupo de ${name}`;
}

function appendAdminNote(existing: string | null, newNote: string): string {
  const trimmed = String(existing ?? "").trim();
  return trimmed ? `${trimmed}\n${newNote}` : newNote;
}

/** Remove the single line that exactly matches the transfer note. */
function removeTransferNoteLine(existing: string | null, noteToRemove: string): string {
  const trimmed = String(existing ?? "").trim();
  if (!trimmed) return "";
  const toRemove = String(noteToRemove ?? "").trim();
  if (!toRemove) return trimmed;
  const lines = trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const next = lines.filter((line) => line !== toRemove);
  return next.join("\n").trim();
}

export type CancelTransferResult =
  | { success: true }
  | { success: false; error: string };

export async function cancelTransferEnrollment(fromEnrollmentId: string): Promise<CancelTransferResult> {
  const supabase = await createClient();

  const { data: fromRow, error: fetchFromErr } = await supabase
    .from("enrollments")
    .select(`
      id,
      event_id,
      replaced_by_enrollment_id,
      admin_notes,
      person:people(first_name, last_name)
    `)
    .eq("id", fromEnrollmentId)
    .single();

  if (fetchFromErr || !fromRow?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }
  const fromEnrollment = fromRow as {
    id: string;
    event_id: string;
    replaced_by_enrollment_id: string | null;
    admin_notes: string | null;
    person: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[];
  };
  const toEnrollmentId = fromEnrollment.replaced_by_enrollment_id;
  if (!toEnrollmentId) {
    return { success: false, error: "Esta inscripción no tiene una transferencia asociada." };
  }

  const { data: toRow, error: fetchToErr } = await supabase
    .from("enrollments")
    .select(`
      id,
      admin_notes,
      person:people(first_name, last_name)
    `)
    .eq("id", toEnrollmentId)
    .single();

  if (fetchToErr || !toRow?.id) {
    return { success: false, error: "Inscripción receptora no encontrada." };
  }
  const toEnrollment = toRow as {
    id: string;
    admin_notes: string | null;
    person: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[];
  };

  const transferrerPerson = Array.isArray(fromEnrollment.person) ? fromEnrollment.person[0] : fromEnrollment.person;
  const recipientPerson = Array.isArray(toEnrollment.person) ? toEnrollment.person[0] : toEnrollment.person;
  const transferredNote = formatTransferNoteTo(
    recipientPerson?.first_name ?? null,
    recipientPerson?.last_name ?? null
  );
  const receivedNote = formatTransferNoteFrom(
    transferrerPerson?.first_name ?? null,
    transferrerPerson?.last_name ?? null
  );

  const fromNotesNext = removeTransferNoteLine(fromEnrollment.admin_notes, transferredNote);
  const toNotesNext = removeTransferNoteLine(toEnrollment.admin_notes, receivedNote);

  const { error: deleteTransferErr } = await supabase
    .from("enrollment_transfers")
    .delete()
    .eq("from_enrollment_id", fromEnrollmentId)
    .eq("to_enrollment_id", toEnrollmentId);

  if (deleteTransferErr) {
    return { success: false, error: "No se pudo eliminar el registro de transferencia." };
  }

  const { error: updateFromErr } = await supabase
    .from("enrollments")
    .update({
      replaced_by_enrollment_id: null,
      admin_notes: fromNotesNext || null,
    })
    .eq("id", fromEnrollmentId);

  if (updateFromErr) {
    return { success: false, error: "No se pudo actualizar la inscripción origen." };
  }

  const { error: updateToErr } = await supabase
    .from("enrollments")
    .update({ admin_notes: toNotesNext || null })
    .eq("id", toEnrollmentId);

  if (updateToErr) {
    return { success: false, error: "No se pudo actualizar la inscripción destino." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: fromEnrollmentId,
    action: "transfer_cancel",
    changed_by: user?.id ?? null,
    context: {
      event_id: fromEnrollment.event_id,
      to_enrollment_id: toEnrollmentId,
      actor_email: user?.email ?? null,
    },
    changes: [],
  });

  revalidatePath(`/app/events/${fromEnrollment.event_id}`);
  return { success: true };
}

export async function transferEnrollmentSpot(
  fromEnrollmentId: string,
  target: TransferSpotTarget,
  notes?: string
): Promise<TransferSpotResult> {
  const supabase = await createClient();

  const { data: fromEnrollmentRow, error: fetchErr } = await supabase
    .from("enrollments")
    .select(`
      id,
      event_id,
      person_id,
      angel_name,
      cantidad,
      admin_notes,
      replaced_by_enrollment_id,
      person:people(first_name, last_name)
    `)
    .eq("id", fromEnrollmentId)
    .single();

  if (fetchErr || !fromEnrollmentRow?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }
  const fromEnrollment = fromEnrollmentRow as {
    id: string;
    event_id: string;
    person_id: string;
    angel_name: string | null;
    cantidad: number | null;
    admin_notes: string | null;
    replaced_by_enrollment_id: string | null;
    person: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[];
  };
  if (fromEnrollment.replaced_by_enrollment_id) {
    return { success: false, error: "Este cupo ya fue transferido." };
  }

  const eventId = fromEnrollment.event_id as string;
  const email = String(target.email ?? "").trim().toLowerCase();
  if (!email) {
    return { success: false, error: "El correo del destinatario es obligatorio." };
  }

  const { data: existing } = await supabase
    .from("people")
    .select("id, first_name, last_name")
    .ilike("email", email)
    .maybeSingle();

  let targetPersonId: string;
  let recipientFirstName: string | null;
  let recipientLastName: string | null;
  if (existing?.id) {
    const { data: existingEnroll } = await supabase
      .from("enrollments")
      .select("id")
      .eq("event_id", eventId)
      .eq("person_id", existing.id)
      .maybeSingle();
    if (existingEnroll?.id) {
      return { success: false, error: "Esa persona ya está inscrita en este evento." };
    }
    targetPersonId = existing.id;
    recipientFirstName = existing.first_name;
    recipientLastName = existing.last_name;
  } else {
    const fn = String(target.first_name ?? "").trim() || null;
    const ln = String(target.last_name ?? "").trim() || null;
    const { data: inserted, error: insertErr } = await supabase
      .from("people")
      .insert({
        first_name: fn,
        last_name: ln,
        phone: String(target.phone ?? "").trim() || null,
        email,
      })
      .select("id")
      .single();
    if (insertErr || !inserted?.id) {
      return { success: false, error: "No se pudo crear la persona." };
    }
    targetPersonId = inserted.id;
    recipientFirstName = fn;
    recipientLastName = ln;
  }

  const transferrerPerson = Array.isArray(fromEnrollment.person) ? fromEnrollment.person[0] : fromEnrollment.person;
  const transferrerFirstName = transferrerPerson?.first_name ?? null;
  const transferrerLastName = transferrerPerson?.last_name ?? null;
  const receivedNote = formatTransferNoteFrom(transferrerFirstName, transferrerLastName);
  const initialAdminNotes = notes?.trim()
    ? appendAdminNote(receivedNote, notes.trim())
    : receivedNote;

  const { data: toEnrollment, error: insertEnrollErr } = await supabase
    .from("enrollments")
    .insert({
      event_id: eventId,
      person_id: targetPersonId,
      angel_name:
        (target.angel_name?.trim() || (fromEnrollment.angel_name as string | null) || null) ?? null,
      admin_notes: initialAdminNotes,
    })
    .select("id")
    .single();

  if (insertEnrollErr || !toEnrollment?.id) {
    return { success: false, error: "No se pudo crear la nueva inscripción." };
  }

  const transferredNote = formatTransferNoteTo(recipientFirstName, recipientLastName);
  const updatedFromAdminNotes = appendAdminNote(fromEnrollment.admin_notes, transferredNote);

  const { error: updateFromErr } = await supabase
    .from("enrollments")
    .update({
      replaced_by_enrollment_id: toEnrollment.id,
      admin_notes: updatedFromAdminNotes,
    })
    .eq("id", fromEnrollmentId);

  if (updateFromErr) {
    return { success: false, error: "No se pudo actualizar la inscripción origen." };
  }

  const { data: transferRow, error: transferErr } = await supabase
    .from("enrollment_transfers")
    .insert({
      from_enrollment_id: fromEnrollmentId,
      to_enrollment_id: toEnrollment.id,
      event_id: eventId,
      notes: notes?.trim() || null,
      transferred_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select("id")
    .single();

  if (transferErr) {
    // Non-fatal: transfer record failed but data is consistent
  }

  const { data: { user } } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: fromEnrollmentId,
    action: "transfer_out",
    changed_by: user?.id ?? null,
    context: {
      event_id: eventId,
      to_enrollment_id: toEnrollment.id,
      to_person_id: targetPersonId,
      actor_email: user?.email ?? null,
    },
    changes: [],
  });
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: toEnrollment.id,
    action: "transfer_in",
    changed_by: user?.id ?? null,
    context: {
      event_id: eventId,
      from_enrollment_id: fromEnrollmentId,
      from_person_id: fromEnrollment.person_id,
      actor_email: user?.email ?? null,
    },
    changes: [],
  });
  if (transferRow?.id) {
    await writeAuditLog(supabase, {
      entity_type: "enrollment_transfer",
      entity_id: transferRow.id,
      action: "transfer",
      changed_by: user?.id ?? null,
      context: { event_id: eventId, from_enrollment_id: fromEnrollmentId, to_enrollment_id: toEnrollment.id, actor_email: user?.email ?? null },
      changes: [],
    });
  }

  revalidatePath(`/app/events/${eventId}`);
  return { success: true };
}

export async function transferEnrollmentSpotToExistingEnrollment(
  fromEnrollmentId: string,
  toEnrollmentId: string
): Promise<TransferSpotResult> {
  const supabase = await createClient();

  const { data: fromEnrollmentRow, error: fetchErr } = await supabase
    .from("enrollments")
    .select(`
      id,
      event_id,
      person_id,
      cantidad,
      admin_notes,
      replaced_by_enrollment_id,
      person:people(first_name, last_name)
    `)
    .eq("id", fromEnrollmentId)
    .single();

  if (fetchErr || !fromEnrollmentRow?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }
  const fromEnrollment = fromEnrollmentRow as {
    id: string;
    event_id: string;
    person_id: string;
    cantidad: number | null;
    admin_notes: string | null;
    replaced_by_enrollment_id: string | null;
    person: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[];
  };
  if (fromEnrollment.replaced_by_enrollment_id) {
    return { success: false, error: "Este cupo ya fue transferido." };
  }

  const eventId = fromEnrollment.event_id as string;

  const { data: toEnrollmentRow, error: toErr } = await supabase
    .from("enrollments")
    .select(`
      id,
      person_id,
      admin_notes,
      person:people(first_name, last_name)
    `)
    .eq("id", toEnrollmentId)
    .eq("event_id", eventId)
    .single();

  if (toErr || !toEnrollmentRow?.id) {
    return { success: false, error: "Inscripción del destinatario no encontrada." };
  }
  const toEnrollment = toEnrollmentRow as {
    id: string;
    person_id: string;
    admin_notes: string | null;
    person: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[];
  };

  if (toEnrollmentId === fromEnrollmentId) {
    return { success: false, error: "No puedes transferir el cupo a ti mismo." };
  }

  const transferrerPerson = Array.isArray(fromEnrollment.person) ? fromEnrollment.person[0] : fromEnrollment.person;
  const recipientPerson = Array.isArray(toEnrollment.person) ? toEnrollment.person[0] : toEnrollment.person;
  const transferrerFirstName = transferrerPerson?.first_name ?? null;
  const transferrerLastName = transferrerPerson?.last_name ?? null;
  const recipientFirstName = recipientPerson?.first_name ?? null;
  const recipientLastName = recipientPerson?.last_name ?? null;

  const transferredNote = formatTransferNoteTo(recipientFirstName, recipientLastName);
  const receivedNote = formatTransferNoteFrom(transferrerFirstName, transferrerLastName);

  const updatedFromAdminNotes = appendAdminNote(fromEnrollment.admin_notes, transferredNote);
  const updatedToAdminNotes = appendAdminNote(toEnrollment.admin_notes, receivedNote);

  const { error: updateFromErr } = await supabase
    .from("enrollments")
    .update({
      replaced_by_enrollment_id: toEnrollmentId,
      admin_notes: updatedFromAdminNotes,
    })
    .eq("id", fromEnrollmentId);

  if (updateFromErr) {
    return { success: false, error: "No se pudo actualizar la inscripción origen." };
  }

  const { error: updateToErr } = await supabase
    .from("enrollments")
    .update({
      admin_notes: updatedToAdminNotes,
    })
    .eq("id", toEnrollmentId);

  if (updateToErr) {
    return { success: false, error: "No se pudo actualizar la inscripción destino." };
  }

  await supabase.from("enrollment_transfers").insert({
    from_enrollment_id: fromEnrollmentId,
    to_enrollment_id: toEnrollmentId,
    event_id: eventId,
    notes: null,
    transferred_by: (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: { user } } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: fromEnrollmentId,
    action: "transfer_out",
    changed_by: user?.id ?? null,
    context: { event_id: eventId, to_enrollment_id: toEnrollmentId, to_person_id: toEnrollment.person_id, actor_email: user?.email ?? null },
    changes: [],
  });
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: toEnrollmentId,
    action: "transfer_in",
    changed_by: user?.id ?? null,
    context: { event_id: eventId, from_enrollment_id: fromEnrollmentId, from_person_id: fromEnrollment.person_id, actor_email: user?.email ?? null },
    changes: [],
  });

  revalidatePath(`/app/events/${eventId}`);
  return { success: true };
}

export type PersonOption = { id: string; first_name: string | null; last_name: string | null; email: string };

/** Participant already in the event (enrollment exists). Includes enrollmentId for transfer. */
export type ParticipantInEventOption = {
  enrollmentId: string;
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

export async function searchParticipantsInEvent(
  eventId: string,
  searchQuery: string,
  excludeEnrollmentId: string
): Promise<ParticipantInEventOption[]> {
  const supabase = await createClient();

  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(`
      id,
      person:people(id, first_name, last_name, email)
    `)
    .eq("event_id", eventId)
    .neq("id", excludeEnrollmentId)
    .is("replaced_by_enrollment_id", null)
    .order("created_at", { ascending: true });

  if (error || !enrollments) return [];

  const trimmed = searchQuery.trim().toLowerCase();
  const options: ParticipantInEventOption[] = [];

  for (const row of enrollments as {
    id: string;
    person:
      | { id: string; first_name: string | null; last_name: string | null; email: string }
      | { id: string; first_name: string | null; last_name: string | null; email: string }[];
  }[]) {
    const person = Array.isArray(row.person) ? row.person[0] : row.person;
    if (!person?.id) continue;

    const first = (person.first_name ?? "").toLowerCase();
    const last = (person.last_name ?? "").toLowerCase();
    const email = (person.email ?? "").toLowerCase();

    if (!trimmed) {
      options.push({
        enrollmentId: row.id,
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
      });
    } else if (
      first.includes(trimmed) ||
      last.includes(trimmed) ||
      `${first} ${last}`.trim().includes(trimmed) ||
      `${last} ${first}`.trim().includes(trimmed) ||
      email.includes(trimmed)
    ) {
      options.push({
        enrollmentId: row.id,
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
      });
    }
  }

  return options.slice(0, 50);
}

export async function getPeopleNotInEvent(eventId: string): Promise<PersonOption[]> {
  const supabase = await createClient();
  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("person_id")
    .eq("event_id", eventId);
  const enrolledIds = new Set(
    (enrolled ?? []).map((r: { person_id: string }) => r.person_id)
  );
  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, last_name, email")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  const all = (people ?? []) as PersonOption[];
  if (enrolledIds.size === 0) return all;
  return all.filter((p) => !enrolledIds.has(p.id));
}

export async function searchPeopleNotInEvent(
  eventId: string,
  searchQuery: string
): Promise<PersonOption[]> {
  const trimmed = searchQuery.trim();
  if (trimmed === "") return [];

  const supabase = await createClient();
  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("person_id")
    .eq("event_id", eventId);
  const enrolledIds = new Set(
    (enrolled ?? []).map((r: { person_id: string }) => r.person_id)
  );

  const escaped = trimmed.replace(/"/g, '""');
  const pattern = `"%${escaped}%"`;

  let query = supabase
    .from("people")
    .select("id, first_name, last_name, email")
    .limit(50)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`
    );

  if (enrolledIds.size > 0) {
    query = query.not("id", "in", `(${Array.from(enrolledIds).join(",")})`);
  }

  const { data: people } = await query;
  return (people ?? []) as PersonOption[];
}

export async function transferEnrollmentSpotToExistingPerson(
  fromEnrollmentId: string,
  targetPersonId: string,
  notes?: string
): Promise<TransferSpotResult> {
  const supabase = await createClient();

  const { data: fromEnrollmentRow, error: fetchErr } = await supabase
    .from("enrollments")
    .select(`
      id,
      event_id,
      person_id,
      angel_name,
      cantidad,
      admin_notes,
      replaced_by_enrollment_id,
      person:people(first_name, last_name)
    `)
    .eq("id", fromEnrollmentId)
    .single();

  if (fetchErr || !fromEnrollmentRow?.event_id) {
    return { success: false, error: "Inscripción no encontrada." };
  }
  const fromEnrollment = fromEnrollmentRow as {
    id: string;
    event_id: string;
    person_id: string;
    angel_name: string | null;
    cantidad: number | null;
    admin_notes: string | null;
    replaced_by_enrollment_id: string | null;
    person: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[];
  };
  if (fromEnrollment.replaced_by_enrollment_id) {
    return { success: false, error: "Este cupo ya fue transferido." };
  }

  const eventId = fromEnrollment.event_id as string;

  const { data: existingEnroll } = await supabase
    .from("enrollments")
    .select("id")
    .eq("event_id", eventId)
    .eq("person_id", targetPersonId)
    .maybeSingle();
  if (existingEnroll?.id) {
    return { success: false, error: "Esa persona ya está inscrita en este evento." };
  }

  const { data: targetPerson } = await supabase
    .from("people")
    .select("id, first_name, last_name, angel_name")
    .eq("id", targetPersonId)
    .single();
  if (!targetPerson?.id) {
    return { success: false, error: "Persona no encontrada." };
  }

  const angelName =
    (targetPerson.angel_name as string | null) ||
    (fromEnrollment.angel_name as string | null) ||
    null;

  const transferrerPerson = Array.isArray(fromEnrollment.person) ? fromEnrollment.person[0] : fromEnrollment.person;
  const transferrerFirstName = transferrerPerson?.first_name ?? null;
  const transferrerLastName = transferrerPerson?.last_name ?? null;
  const recipientFirstName = targetPerson.first_name ?? null;
  const recipientLastName = targetPerson.last_name ?? null;
  const receivedNote = formatTransferNoteFrom(transferrerFirstName, transferrerLastName);

  const { data: toEnrollment, error: insertEnrollErr } = await supabase
    .from("enrollments")
    .insert({
      event_id: eventId,
      person_id: targetPersonId,
      angel_name: angelName,
      admin_notes: receivedNote,
    })
    .select("id")
    .single();

  if (insertEnrollErr || !toEnrollment?.id) {
    return { success: false, error: "No se pudo crear la nueva inscripción." };
  }

  const transferredNote = formatTransferNoteTo(recipientFirstName, recipientLastName);
  const updatedFromAdminNotes = appendAdminNote(fromEnrollment.admin_notes, transferredNote);

  const { error: updateFromErr } = await supabase
    .from("enrollments")
    .update({
      replaced_by_enrollment_id: toEnrollment.id,
      admin_notes: updatedFromAdminNotes,
    })
    .eq("id", fromEnrollmentId);

  if (updateFromErr) {
    return { success: false, error: "No se pudo actualizar la inscripción origen." };
  }

  const { data: transferRow, error: transferErr } = await supabase
    .from("enrollment_transfers")
    .insert({
      from_enrollment_id: fromEnrollmentId,
      to_enrollment_id: toEnrollment.id,
      event_id: eventId,
      notes: notes?.trim() || null,
      transferred_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select("id")
    .single();

  if (transferErr) {
    // Non-fatal
  }

  const { data: { user } } = await supabase.auth.getUser();
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: fromEnrollmentId,
    action: "transfer_out",
    changed_by: user?.id ?? null,
    context: {
      event_id: eventId,
      to_enrollment_id: toEnrollment.id,
      to_person_id: targetPersonId,
      actor_email: user?.email ?? null,
    },
    changes: [],
  });
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: toEnrollment.id,
    action: "transfer_in",
    changed_by: user?.id ?? null,
    context: {
      event_id: eventId,
      from_enrollment_id: fromEnrollmentId,
      from_person_id: fromEnrollment.person_id,
      actor_email: user?.email ?? null,
    },
    changes: [],
  });
  if (transferRow?.id) {
    await writeAuditLog(supabase, {
      entity_type: "enrollment_transfer",
      entity_id: transferRow.id,
      action: "transfer",
      changed_by: user?.id ?? null,
      context: { event_id: eventId, from_enrollment_id: fromEnrollmentId, to_enrollment_id: toEnrollment.id, actor_email: user?.email ?? null },
      changes: [],
    });
  }

  revalidatePath(`/app/events/${eventId}`);
  return { success: true };
}

