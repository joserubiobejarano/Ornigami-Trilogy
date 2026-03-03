"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove the BGK tag from a comma-separated status string; other tags unchanged. */
function statusWithoutBGK(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "";
  const tags = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((tag) => tag.toUpperCase() !== "BGK");
  return tags.join(", ").trim();
}

/**
 * Remove BGK from status on all prior enrollments for this person (so they drop off the Backlogs list).
 * Call only after successfully inserting a new enrollment for the person.
 * @param excludeEnrollmentId - the newly created enrollment; do not modify it
 */
export async function removeBGKFromPriorEnrollments(
  supabase: SupabaseClient,
  personId: string,
  excludeEnrollmentId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("person_id", personId)
    .neq("id", excludeEnrollmentId);

  if (!rows?.length) return;

  for (const row of rows as { id: string; status: string | null }[]) {
    const nextStatus = statusWithoutBGK(row.status);
    if (nextStatus === (row.status ?? "").trim()) continue; // no BGK to remove
    await supabase.from("enrollments").update({ status: nextStatus || null }).eq("id", row.id);
  }
}

export type ResolveOrCreatePersonAndEnrollData = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email: string;
  angel_name?: string;
  cantidad?: number | null;
};

export type ResolveOrCreatePersonAndEnrollOptions = {
  sourceFormSubmissionId?: string | null;
};

export type ResolveOrCreatePersonAndEnrollResult =
  | {
      success: true;
      personId: string;
      enrollmentId: string;
      personCreated: boolean;
    }
  | { success: false; error: string; duplicate?: boolean };

export async function resolveOrCreatePersonAndEnroll(
  supabase: SupabaseClient,
  eventId: string,
  data: ResolveOrCreatePersonAndEnrollData,
  options: ResolveOrCreatePersonAndEnrollOptions = {}
): Promise<ResolveOrCreatePersonAndEnrollResult> {
  const email = String(data.email ?? "").trim().toLowerCase();
  if (!email) {
    return { success: false, error: "El correo es obligatorio." };
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("city")
    .eq("id", eventId)
    .single();

  const eventCity =
    !eventError && eventRow && typeof (eventRow as { city?: string | null }).city === "string"
      ? ((eventRow as { city: string }).city?.trim() || null)
      : null;

  const { data: existing } = await supabase
    .from("people")
    .select("id, city")
    .ilike("email", email)
    .maybeSingle();

  let personId: string;
  let personCreated = false;
  let personCity: string | null = null;
  if (existing?.id) {
    personId = existing.id;
    personCity = (existing as { city?: string | null }).city ?? null;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("people")
      .insert({
        first_name: String(data.first_name ?? "").trim() || null,
        last_name: String(data.last_name ?? "").trim() || null,
        phone: String(data.phone ?? "").trim() || null,
        email,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return {
        success: false,
        error: "No se pudo crear la persona. Inténtalo de nuevo.",
      };
    }
    personId = inserted.id;
    personCreated = true;
  }

  const enrollmentPayload: Record<string, unknown> = {
    event_id: eventId,
    person_id: personId,
    status: "pending_contract",
    angel_name: String(data.angel_name ?? "").trim() || null,
    cantidad: data.cantidad ?? null,
    ...(eventCity != null && { city: eventCity }),
  };
  if (options.sourceFormSubmissionId != null) {
    enrollmentPayload.source_form_submission_id = options.sourceFormSubmissionId;
  }

  const { data: enrollmentInserted, error: enrollError } = await supabase
    .from("enrollments")
    .insert(enrollmentPayload)
    .select("id")
    .single();

  if (enrollError) {
    if (enrollError.code === "23505") {
      return {
        success: false,
        error: "Esta persona ya está inscrita en este evento.",
        duplicate: true,
      };
    }
    return {
      success: false,
      error: "No se pudo agregar al participante. Inténtalo de nuevo.",
    };
  }

  if (!enrollmentInserted?.id) {
    return { success: false, error: "No se pudo crear la inscripción." };
  }

  await removeBGKFromPriorEnrollments(supabase, personId, enrollmentInserted.id);

  if (eventCity != null && (!personCity || !personCity.trim())) {
    await supabase.from("people").update({ city: eventCity }).eq("id", personId);
  }

  return {
    success: true,
    personId,
    enrollmentId: enrollmentInserted.id,
    personCreated,
  };
}
