import { jsPDF } from "jspdf";
import { formatCurrency, type ReportContent } from "./report-builder";

/** Build and save report as PDF (same layout as report view). */
export function buildReportPdf(content: ReportContent): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;
  const lineHeight = 6.5;
  const sectionGap = lineHeight * 2;
  const bodyFontSize = 12;
  const titleFontSize = 16;

  const addLine = (text: string, fontSize?: number, bold?: boolean) => {
    if (fontSize) doc.setFontSize(fontSize);
    if (bold) doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(text, pageWidth);
    for (const line of lines) {
      if (y > pageHeight - margin - lineHeight) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    if (bold) doc.setFont("helvetica", "normal");
    if (fontSize) doc.setFontSize(bodyFontSize);
  };

  doc.setFontSize(titleFontSize);
  addLine(`Informe Cierre de ${content.title}`);
  doc.setFontSize(bodyFontSize);
  y += lineHeight;

  addLine("Fechas", undefined, true);
  addLine(`Empezó: ${content.startDate}`);
  addLine(`Finalizó: ${content.endDate}`);
  y += sectionGap;

  addLine("Responsables", undefined, true);
  addLine(`Coordinador: ${content.coordinator}`);
  addLine(`Entrenadores: ${content.entrenadores}`);
  addLine(`Mentores: ${content.mentores}`);
  addLine(`Capitán mentores: ${content.capitanMentores}`);
  y += sectionGap;

  addLine("Participantes", undefined, true);
  addLine(`Participantes inscritos: ${content.participantesInscritos}`);
  addLine(`Participantes que iniciaron: ${content.participantesIniciaron}`);
  addLine(`Participantes que no asistieron: ${content.participantesNoAsistieron}`);
  addLine(`Participantes que se retiraron: ${content.participantesRetiraron}`);
  addLine(`Participantes que culminaron: ${content.participantesCulminaron}`);
  addLine(`Cupos transferidos: ${content.cuposTransferidos}`);
  addLine(`Cupos recibidos: ${content.cuposRecibidos}`);
  addLine(`Backlogs: ${content.backlogs}`);
  addLine(`Entrolados Proposito: ${content.entroladosProposito}`);
  for (const { method, sum } of content.propositoByMethod.filter((m) => m.sum > 0)) {
    addLine(`Proposito ${method}: ${formatCurrency(sum)}`);
  }
  if (content.totalProposito > 0) {
    addLine(`Total Proposito: ${formatCurrency(content.totalProposito)}`, undefined, true);
  }
  const hasConexion =
    content.entroladosConexion > 0 || content.totalConexion > 0 || content.conexionByMethod.some((m) => m.sum > 0);
  if (hasConexion) {
    addLine(`Entrolados Conexión: ${content.entroladosConexion}`);
    for (const { method, sum } of content.conexionByMethod.filter((m) => m.sum > 0)) {
      addLine(`Conexión ${method}: ${formatCurrency(sum)}`);
    }
    if (content.totalConexion > 0) {
      addLine(`Total Conexión: ${formatCurrency(content.totalConexion)}`, undefined, true);
    }
  }
  y += sectionGap;

  addLine("Pagos", undefined, true);
  for (const { method, count, sum } of content.paymentLines) {
    if (count > 0 || sum > 0) {
      addLine(`Pagos ${method}: ${count} participantes - ${formatCurrency(sum)}`);
    }
  }
  if (content.feeAdministrativoCount > 0 || content.feeAdministrativoSum > 0) {
    addLine(`Fee Administrativo: ${content.feeAdministrativoCount} participantes - ${formatCurrency(content.feeAdministrativoSum)}`);
  }
  addLine(`Pagos de Asistieron: ${formatCurrency(content.pagosAsistieronSum)}`);
  addLine(`Total = ${formatCurrency(content.total)}`);
  y += sectionGap;

  addLine("Notas");
  addLine(content.notes || "(Sin notas)");

  const filename = `informe-cierre-${content.title.replace(/\s+/g, "-")}.pdf`;
  doc.save(filename);
}
