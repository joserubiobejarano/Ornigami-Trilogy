"use server";

import { createServiceRoleClient } from "@/lib/supabase/service";
import { AUDIT_LOG_RETENTION_DAYS } from "@/lib/audit-retention-config";

/**
 * Deletes audit_log rows where changed_at is older than the retention period.
 * Uses service role to bypass RLS. Call from server only (e.g. Historial page or cron).
 */
export async function deleteAuditLogsOlderThan(
  retentionDays: number = AUDIT_LOG_RETENTION_DAYS
): Promise<{ deleted: number; error?: string }> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffIso = cutoff.toISOString();

  const { data, error } = await supabase
    .from("audit_log")
    .delete()
    .lt("changed_at", cutoffIso)
    .select("id");

  if (error) {
    return { deleted: 0, error: error.message };
  }
  return { deleted: data?.length ?? 0 };
}
