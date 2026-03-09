import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getReportData } from "../actions";
import { buildReportContent, formatCurrency } from "../report-builder";
import { ReportViewClient } from "./ReportViewClient";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  let data;
  try {
    data = await getReportData(eventId);
  } catch {
    notFound();
  }

  const content = buildReportContent(
    data,
    data.enrollments,
    data.notes
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/reports">← Volver a reportes</Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Informe Cierre de {content.title}{data.city ? ` - ${data.city}` : ""}
        </h1>
      </header>

      <div className="rounded-md border-2 bg-card p-4 text-base space-y-8">
        <div>
          <p className="font-medium mb-1 text-[1.0625rem]">Fechas</p>
          <ul className="list-none space-y-1">
            <li>Empezó: {content.startDate}</li>
            <li>Finalizó: {content.endDate}</li>
          </ul>
        </div>

        <div>
          <p className="font-medium mb-1 text-[1.0625rem]">Responsables</p>
          <ul className="list-none space-y-1">
            <li>Coordinador: {content.coordinator}</li>
            <li>Entrenadores: {content.entrenadores}</li>
            <li>Mentores: {content.mentores}</li>
            <li>Capitán mentores: {content.capitanMentores}</li>
          </ul>
        </div>

        <div>
          <p className="font-medium mb-1 text-[1.0625rem]">Participantes</p>
          <ul className="list-none space-y-1">
            <li>Participantes que iniciaron: {content.participantesIniciaron}</li>
            <li>Participantes que no asistieron: {content.participantesNoAsistieron}</li>
            <li>Participantes que se retiraron: {content.participantesRetiraron}</li>
            <li>Participantes que culminaron: {content.participantesCulminaron}</li>
            <li>Entrolados Proposito: {content.entroladosProposito}</li>
            {content.propositoByMethod.map(({ method, sum }) => (
              <li key={`proposito-${method}`} className="pl-4">
                Proposito {method}: {formatCurrency(sum)}
              </li>
            ))}
            <li>Entrolados Conexión: {content.entroladosConexion}</li>
            {content.conexionByMethod.map(({ method, sum }) => (
              <li key={`conexion-${method}`} className="pl-4">
                Conexión {method}: {formatCurrency(sum)}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-medium mb-1 text-[1.0625rem]">Pagos</p>
          <ul className="list-none space-y-1">
            {content.paymentLines.map(({ method, count, sum }) =>
              count > 0 || sum > 0 ? (
                <li key={method}>
                  Pagos {method}: {count} participantes - {formatCurrency(sum)}
                </li>
              ) : null
            )}
            {content.feeAdministrativoCount > 0 || content.feeAdministrativoSum > 0 ? (
              <li>
                Fee Administrativo: {content.feeAdministrativoCount} participantes - {formatCurrency(content.feeAdministrativoSum)}
              </li>
            ) : null}
            <li>Pagos de Asistieron: {formatCurrency(content.pagosAsistieronSum)}</li>
          </ul>
          <p className="mt-2">
            Total = {formatCurrency(content.total)}
          </p>
        </div>
      </div>

      <ReportViewClient eventId={eventId} initialContent={content} />
    </div>
  );
}
