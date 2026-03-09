"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  EnrollmentWithEventAndPayments,
  PersonWithEnrollments,
  PaymentRow,
} from "@/app/app/people/types";

const PROGRAM_ORDER = ["PT", "LT", "TL"] as const;
type ProgramType = (typeof PROGRAM_ORDER)[number];

function nextProgramType(current: string): ProgramType | null {
  const upper = current?.toUpperCase();
  if (upper === "PT") return "LT";
  if (upper === "LT") return "TL";
  return null;
}

export async function getPersonWithEnrollments(
  personId: string
): Promise<PersonWithEnrollments> {
  const supabase = await createClient();

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, first_name, last_name, phone, email, city")
    .eq("id", personId)
    .single();

  if (personError || !person) {
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
      withdrew,
      finalized,
      admin_notes,
      angel_name,
      health_doc_signed,
      tl_norms_signed,
      tl_rules_signed,
      created_at,
      event:events(id, program_type, code, city, start_date, end_date, active)
    `
    )
    .eq("person_id", personId)
    .order("created_at", { ascending: true });

  if (enrollError) {
    throw new Error(enrollError.message);
  }

  const enrollmentIds =
    (enrollmentRows?.map((r: { id: string }) => r.id) as string[]) ?? [];
  let paymentsByEnrollment: Record<string, PaymentRow[]> = {};

  if (enrollmentIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("id, enrollment_id, method, fee_amount, promo_note, payer_name, created_at")
      .in("enrollment_id", enrollmentIds)
      .order("created_at", { ascending: true });

    if (payments) {
      for (const p of payments as {
        id: string;
        enrollment_id: string;
        method: string | null;
        fee_amount: number | null;
        promo_note: string | null;
        payer_name: string | null;
        created_at: string;
      }[]) {
        if (!paymentsByEnrollment[p.enrollment_id]) {
          paymentsByEnrollment[p.enrollment_id] = [];
        }
        paymentsByEnrollment[p.enrollment_id].push({
          id: p.id,
          enrollment_id: p.enrollment_id,
          method: p.method,
          fee_amount: p.fee_amount != null ? Number(p.fee_amount) : null,
          promo_note: p.promo_note ?? null,
          payer_name: p.payer_name ?? null,
          created_at: p.created_at,
        });
      }
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
    withdrew: boolean;
    finalized: boolean;
    admin_notes: string | null;
    angel_name: string | null;
    health_doc_signed: boolean | null;
    tl_norms_signed: boolean | null;
    tl_rules_signed: boolean | null;
    created_at?: string;
    event:
      | { id: string; program_type: string; code: string; city: string; start_date: string | null; end_date: string | null; active: boolean }
      | { id: string; program_type: string; code: string; city: string; start_date: string | null; end_date: string | null; active: boolean }[];
  };

  const defaultEvent = {
    id: "",
    program_type: "",
    code: "",
    city: "",
    start_date: null as string | null,
    end_date: null as string | null,
    active: false,
  };

  const enrollments: EnrollmentWithEventAndPayments[] = (
    enrollmentRows ?? []
  ).map((r: EnrollRow) => {
    const event = Array.isArray(r.event) ? r.event[0] ?? defaultEvent : r.event ?? defaultEvent;
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
      withdrew: r.withdrew ?? false,
      finalized: r.finalized ?? false,
      admin_notes: r.admin_notes,
      angel_name: r.angel_name,
      health_doc_signed: r.health_doc_signed,
      tl_norms_signed: r.tl_norms_signed,
      tl_rules_signed: r.tl_rules_signed,
      created_at: r.created_at,
      event: {
        id: event.id,
        program_type: event.program_type,
        code: event.code,
        city: event.city,
        start_date: event.start_date,
        end_date: event.end_date,
        active: event.active,
      },
      payments: paymentsByEnrollment[r.id] ?? [],
    };
  });

  return {
    ...person,
    enrollments,
  };
}

export type MoveToNextProgramResult =
  | { success: true }
  | { success: false; error: string };

export async function moveToNextProgram(
  enrollmentId: string,
  personId: string
): Promise<MoveToNextProgramResult> {
  const supabase = await createClient();

  const { data: enrollment, error: enrollError } = await supabase
    .from("enrollments")
    .select("id, event_id, person_id, angel_name")
    .eq("id", enrollmentId)
    .single();

  if (enrollError || !enrollment) {
    return { success: false, error: "Inscripción no encontrada." };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, program_type, city")
    .eq("id", enrollment.event_id)
    .single();

  if (eventError || !event) {
    return { success: false, error: "Evento no encontrado." };
  }

  const nextType = nextProgramType(event.program_type);
  if (!nextType) {
    return { success: false, error: "No hay un siguiente programa disponible." };
  }

  const { data: nextEvent, error: nextEventError } = await supabase
    .from("events")
    .select("id, city")
    .eq("program_type", nextType)
    .eq("city", event.city)
    .eq("active", true)
    .maybeSingle();

  if (nextEventError) {
    return { success: false, error: "No se pudo buscar el siguiente evento." };
  }
  if (!nextEvent) {
    return {
      success: false,
      error: "No hay un evento activo para la ciudad de este participante.",
    };
  }

  const { error: insertError } = await supabase.from("enrollments").insert({
    event_id: nextEvent.id,
    person_id: enrollment.person_id,
    status: "pending_contract",
    angel_name: enrollment.angel_name ?? null,
  });

  if (!insertError && nextEvent.city) {
    await supabase
      .from("people")
      .update({ city: nextEvent.city })
      .eq("id", enrollment.person_id);
  }

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        success: false,
        error: "Este participante ya está inscrito en el siguiente evento.",
      };
    }
    return { success: false, error: "No se pudo mover. Inténtalo de nuevo." };
  }

  revalidatePath(`/app/people/${personId}`);
  return { success: true };
}
