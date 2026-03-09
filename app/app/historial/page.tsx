import { Suspense } from "react";
import { getAuditLogAll } from "@/lib/audit-actions";
import { deleteAuditLogsOlderThan } from "@/lib/audit-retention";
import { AUDIT_LOG_RETENTION_DAYS } from "@/lib/audit-retention-config";
import { AuditTimeline } from "@/components/audit-timeline";
import { HistorialFilter } from "./HistorialFilter";

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await deleteAuditLogsOlderThan(AUDIT_LOG_RETENTION_DAYS);
  const params = await searchParams;
  const userParam =
    typeof params?.user === "string" && params.user ? params.user : null;

  const entries = await getAuditLogAll(100);
  const distinctUsers = [
    ...new Set(entries.map((e) => e.actor_label).filter(Boolean)),
  ].sort((a, b) => String(a).localeCompare(String(b)));
  const filteredEntries = userParam
    ? entries.filter((e) => e.actor_label === userParam)
    : entries;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 sm:px-6">
      <h1 className="text-2xl font-semibold">Historial</h1>
      <p className="text-sm text-foreground">
        Cambios recientes en todos los eventos.
      </p>
      <Suspense fallback={null}>
        <HistorialFilter distinctUsers={distinctUsers} currentUser={userParam} />
      </Suspense>
      <AuditTimeline
        entries={filteredEntries}
        emptyMessage="Sin cambios recientes."
      />
    </div>
  );
}
