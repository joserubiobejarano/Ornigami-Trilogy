import { getAuditLogAll } from "@/lib/audit-actions";
import {
  deleteAuditLogsOlderThan,
  AUDIT_LOG_RETENTION_DAYS,
} from "@/lib/audit-retention";
import { AuditTimeline } from "@/components/audit-timeline";

export default async function HistorialPage() {
  await deleteAuditLogsOlderThan(AUDIT_LOG_RETENTION_DAYS);
  const entries = await getAuditLogAll(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold">Historial</h1>
      <p className="text-muted-foreground text-sm">
        Cambios recientes en todos los eventos.
      </p>
      <AuditTimeline entries={entries} emptyMessage="Sin cambios recientes." />
    </div>
  );
}
