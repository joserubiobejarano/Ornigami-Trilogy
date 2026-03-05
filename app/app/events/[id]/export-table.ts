import { jsPDF } from "jspdf";
import type { EnrollmentRow, EventRow } from "@/app/app/events/types";
import { programTypeToDisplay } from "@/lib/program-display";

const PAYMENT_METHOD_OPTIONS = ["Square", "Afterpay", "Zelle", "Cash", "TDC"];

function escapeCsvCell(value: string): string {
  const s = String(value ?? "").trim();
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportParticipantsCSV(
  enrollments: EnrollmentRow[],
  eventCode: string
): void {
  const headers = [
    "Nombre",
    "Apellidos",
    "Correo",
    "Teléfono",
    "Ángel",
    "Estado",
    "Ciudad",
    "TL enrolado",
    "Envió Detalles",
    "Doc Salud",
    "Contrato Firmado",
    "CCA",
    "Contactado",
    "Confirmó",
    "Asistió",
    "No Asistió",
    "Retiró",
    "Finalizó",
    ...PAYMENT_METHOD_OPTIONS,
    "Fee Administrativo",
    "Observaciones",
  ];
  const rows = enrollments.map((e) => {
    const payments = e.payments_by_method ?? {};
    return [
      e.person?.first_name ?? "",
      e.person?.last_name ?? "",
      e.person?.email ?? "",
      e.person?.phone ?? "",
      e.angel_name ?? "",
      e.status ?? "",
      e.city ?? "",
      e.tl_enrolado ?? "",
      e.details_sent ? "Sí" : "No",
      e.health_doc_signed ? "Sí" : "No",
      e.contract_signed ? "Sí" : "No",
      e.cca_signed ? "Sí" : "No",
      e.contacted ? "Sí" : "No",
      e.confirmed ? "Sí" : "No",
      e.attended ? "Sí" : "No",
      e.no_asistio ? "Sí" : "No",
      e.withdrew ? "Sí" : "No",
      e.finalized ? "Sí" : "No",
      ...PAYMENT_METHOD_OPTIONS.map((m) =>
        String(payments[m.toLowerCase()] ?? "")
      ),
      String(e.payment_fee ?? ""),
      e.admin_notes ?? "",
    ];
  });
  const csvContent = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `participantes-${eventCode || "evento"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildParticipantsTablePdf(
  enrollments: EnrollmentRow[],
  event: EventRow
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 5;
  const fontSize = 8;
  doc.setFontSize(fontSize);

  const eventCode = event.code || "evento";
  const eventTitle =
    `${programTypeToDisplay(event.program_type)} ${event.code}`.trim() ||
    "Evento";
  doc.setFontSize(10);
  doc.text(eventTitle, margin, margin + lineHeight);
  doc.setFontSize(fontSize);
  let y = margin + lineHeight * 2.5;

  const cols = [
    { key: "nombre", w: 28 },
    { key: "apellidos", w: 28 },
    { key: "correo", w: 45 },
    { key: "estado", w: 22 },
    { key: "asistio", w: 14 },
    { key: "finalizo", w: 14 },
    { key: "observaciones", w: 55 },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  let x = margin;

  cols.forEach((c) => {
    doc.text(c.key.charAt(0).toUpperCase() + c.key.slice(1), x, y);
    x += c.w;
  });
  y += lineHeight * 1.2;
  const headerY = y;

  enrollments.forEach((e, i) => {
    if (y > pageHeight - margin - lineHeight * 3) {
      doc.addPage("a4", "landscape");
      y = margin + lineHeight;
    }
    x = margin;
    const row = [
      (e.person?.first_name ?? "").slice(0, 18),
      (e.person?.last_name ?? "").slice(0, 18),
      (e.person?.email ?? "").slice(0, 32),
      (e.status ?? "").slice(0, 14),
      e.attended ? "Sí" : "No",
      e.finalized ? "Sí" : "No",
      (e.admin_notes ?? "").slice(0, 38),
    ];
    cols.forEach((c, j) => {
      const text = doc.splitTextToSize(row[j], c.w - 1);
      doc.text(text[0] ?? "", x, y);
      x += c.w;
    });
    y += lineHeight;
  });

  const filename = `participantes-${eventCode}.pdf`;
  doc.save(filename);
}
