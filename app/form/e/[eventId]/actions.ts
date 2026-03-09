"use server";

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { resolveOrCreatePersonAndEnroll } from "@/lib/enrollment";
import { writeAuditLog } from "@/lib/audit";
import {
  checkFormRateLimit,
  getClientIdentifier,
} from "@/lib/rate-limit";

export type SubmitParticipantFormResult =
  | { success: true }
  | { success: false; error: string; duplicate?: boolean };

const PAYMENT_METHOD_UI_TO_DB: Record<string, string> = {
  Square: "square",
  Afterpay: "afterpay",
  Zelle: "zelle",
  Cash: "cash",
  TDC: "tdc",
};

export type PaymentEntry = { method: string; amount: number | null };

export async function submitParticipantForm(
  eventId: string,
  data: {
    first_name?: string;
    last_name?: string;
    last_name_2?: string;
    phone?: string;
    email: string;
    angel_name?: string;
    /** Up to 2 payment method + amount entries; consolidated by method before insert. */
    payments: PaymentEntry[];
  }
): Promise<SubmitParticipantFormResult> {
  const headersList = await headers();
  const clientId = getClientIdentifier(headersList);
  const { allowed } = checkFormRateLimit(clientId);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  const supabase = createServiceRoleClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, form_enabled")
    .eq("id", eventId)
    .single();

  if (eventError || !event?.id) {
    return { success: false, error: "Evento no encontrado o no válido." };
  }

  if (event.form_enabled === false) {
    return {
      success: false,
      error: "El registro para este evento no está disponible.",
    };
  }

  const payload = {
    first_name: String(data.first_name ?? "").trim() || undefined,
    last_name: String(data.last_name ?? "").trim() || undefined,
    phone: String(data.phone ?? "").trim() || undefined,
    email: String(data.email ?? "").trim(),
    angel_name: String(data.angel_name ?? "").trim() || undefined,
    cantidad: null as number | null,
  };

  const { data: formRow, error: formInsertError } = await supabase
    .from("form_submissions")
    .insert({
      event_id: eventId,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      email: payload.email,
      phone: payload.phone ?? null,
      angel_name: payload.angel_name ?? null,
      source: "form",
      status: "pending",
    })
    .select("id")
    .single();

  if (formInsertError || !formRow?.id) {
    return {
      success: false,
      error: "No se pudo registrar la solicitud. Inténtalo de nuevo.",
    };
  }

  const result = await resolveOrCreatePersonAndEnroll(supabase, eventId, payload, {
    sourceFormSubmissionId: formRow.id,
  });

  if (result.success) {
    const { data: eventRow } = await supabase
      .from("events")
      .select("city")
      .eq("id", eventId)
      .single();
    if (eventRow?.city) {
      await supabase
        .from("people")
        .update({ city: eventRow.city })
        .eq("id", result.personId);
    }
  }

  if (!result.success) {
    await supabase
      .from("form_submissions")
      .update({
        status: result.duplicate ? "duplicate" : "rejected",
        processed_at: new Date().toISOString(),
      })
      .eq("id", formRow.id);
    return {
      success: false,
      error: result.error,
      duplicate: result.duplicate,
    };
  }

  await supabase
    .from("form_submissions")
    .update({
      enrollment_id: result.enrollmentId,
      person_id: result.personId,
      status: "processed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", formRow.id);

  if (result.personCreated) {
    await writeAuditLog(supabase, {
      entity_type: "person",
      entity_id: result.personId,
      action: "insert",
      changed_by: null,
      context: { event_id: eventId, source: "form", form_submission_id: formRow.id },
      changes: [],
    });
  }
  await writeAuditLog(supabase, {
    entity_type: "enrollment",
    entity_id: result.enrollmentId,
    action: "insert",
    changed_by: null,
    context: {
      event_id: eventId,
      person_id: result.personId,
      source: "form",
      form_submission_id: formRow.id,
    },
    changes: [],
  });

  const payments = data.payments ?? [];
  const byMethod: Record<string, number | null> = {};
  for (const p of payments) {
    const methodDb = p.method ? PAYMENT_METHOD_UI_TO_DB[p.method] : null;
    if (!methodDb) continue;
    const amount = p.amount != null && !Number.isNaN(Number(p.amount)) ? Number(p.amount) : null;
    if (byMethod[methodDb] != null && amount != null) {
      byMethod[methodDb] = (byMethod[methodDb] ?? 0) + amount;
    } else if (amount != null) {
      byMethod[methodDb] = amount;
    } else {
      byMethod[methodDb] = byMethod[methodDb] ?? null;
    }
  }

  let totalAmount: number | null = null;
  for (const methodDb of Object.keys(byMethod)) {
    const amount = byMethod[methodDb];
    if (amount != null && amount > 0) {
      await supabase.from("payments").insert({
        enrollment_id: result.enrollmentId,
        method: methodDb,
        amount,
      });
      totalAmount = (totalAmount ?? 0) + amount;
    }
  }

  if (totalAmount != null && totalAmount > 0) {
    await supabase
      .from("enrollments")
      .update({ cantidad: totalAmount })
      .eq("id", result.enrollmentId);
  }

  return { success: true };
}
