"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEntityType =
  | "person"
  | "enrollment"
  | "payment"
  | "enrollment_transfer";

export type AuditAction =
  | "insert"
  | "update"
  | "delete"
  | "transfer"
  | "reschedule"
  | "transfer_out"
  | "transfer_in"
  | "transfer_cancel"
  | "reschedule_out"
  | "reschedule_in";

export type AuditChange = {
  field: string;
  old_value: unknown;
  new_value: unknown;
};

export type AuditLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  context: Record<string, unknown>;
  changes: AuditChange[];
};

export type WriteAuditLogParams = {
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  changed_by?: string | null;
  context?: Record<string, unknown>;
  changes?: AuditChange[];
};

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: WriteAuditLogParams
): Promise<void> {
  const { entity_type, entity_id, action, changed_by, context, changes } =
    params;
  await supabase.from("audit_log").insert({
    entity_type,
    entity_id,
    action,
    changed_by: changed_by ?? null,
    changed_at: new Date().toISOString(),
    context: context ?? {},
    changes: changes ?? [],
  });
}
