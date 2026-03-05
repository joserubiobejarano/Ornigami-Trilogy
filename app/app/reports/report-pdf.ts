import { jsPDF } from "jspdf";
import { formatCurrency, type ReportContent } from "./report-builder";

/** Build and save report as PDF (same layout as report view). */
export function buildReportPdf(content: ReportContent): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;
  const lineHeight = 6;

  const addLine = (text: string, fontSize?: number) => {
    if (fontSize) doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, pageWidth);
    for (const line of lines) {
      if (y > pageHeight - margin - lineHeight) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    if (fontSize) doc.setFontSize(11);
  };

  doc.setFontSize(14);
  addLine(`Informe Cierre de ${content.title}`);
  doc.setFontSize(11);
  y += lineHeight;

  addLine(`Finalizó: ${content.endDate}`);
  y += lineHeight;

  addLine(`Coordinador: ${content.coordinator}`);
  addLine(`Entrenadores: ${content.entrenadores}`);
  addLine(`Mentores: ${content.mentores}`);
  addLine(`Capitán mentores: ${content.capitanMentores}`);
  y += lineHeight;

  addLine(`Participantes que iniciaron: ${content.participantesIniciaron}`);
  addLine(`Participantes que no asistieron: ${content.participantesNoAsistieron}`);
  addLine(`Participantes que se retiraron: ${content.participantesRetiraron}`);
  addLine(`Participantes que culminaron: ${content.participantesCulminaron}`);
  addLine(`Entrolados Proposito: ${content.entroladosProposito}`);
  addLine(`Entrolados Conexión: ${content.entroladosConexion}`);
  y += lineHeight;

  addLine("Pagos");
  for (const { method, count, sum } of content.paymentLines) {
    if (count > 0 || sum > 0) {
      addLine(`Pagos ${method}: ${count} participantes - ${formatCurrency(sum)}`);
    }
  }
  if (content.feeAdministrativoCount > 0 || content.feeAdministrativoSum > 0) {
    addLine(`Fee Administrativo: ${content.feeAdministrativoCount} participantes - ${formatCurrency(content.feeAdministrativoSum)}`);
  }
  addLine(`Pagos Backlogs: ${content.pagosBacklogsCount} participantes`);
  addLine(`Total = ${formatCurrency(content.total)}`);
  y += lineHeight;

  addLine("Notas");
  addLine(content.notes || "(Sin notas)");

  const filename = `informe-cierre-${content.title.replace(/\s+/g, "-")}.pdf`;
  doc.save(filename);
}
