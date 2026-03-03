import { jsPDF } from "jspdf";
import type { BGKRow } from "./actions";

function escapeCsvCell(value: string): string {
  const s = String(value ?? "").trim();
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function displayName(row: BGKRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.join(" ") || row.email || "—";
}

export function exportBGKCSV(
  rows: BGKRow[],
  filenamePrefix = "backlogs"
): void {
  const headers = [
    "Nombre",
    "Correo",
    "Teléfono",
    "Ciudad",
    "Entrenamiento",
    "Observaciones",
    "Días restantes",
  ];
  const dataRows = rows.map((r) => [
    displayName(r),
    r.email ?? "",
    r.phone ?? "",
    r.city ?? "",
    r.entrenamientoLabel ?? "",
    r.admin_notes ?? "",
    r.daysRemaining === null ? "" : String(r.daysRemaining),
  ]);
  const csvContent = [
    headers.map(escapeCsvCell).join(","),
    ...dataRows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildBGKTablePdf(rows: BGKRow[]): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 5;
  const fontSize = 8;
  doc.setFontSize(fontSize);

  const title = "Backlogs";
  doc.setFontSize(10);
  doc.text(title, margin, margin + lineHeight);
  doc.setFontSize(fontSize);
  let y = margin + lineHeight * 2.5;

  const cols = [
    { key: "nombre", w: 35 },
    { key: "correo", w: 45 },
    { key: "telefono", w: 28 },
    { key: "ciudad", w: 22 },
    { key: "entrenamiento", w: 35 },
    { key: "observaciones", w: 50 },
    { key: "dias_restantes", w: 22 },
  ];
  let x = margin;

  cols.forEach((c) => {
    const label =
      c.key === "dias_restantes"
        ? "Días restantes"
        : c.key.charAt(0).toUpperCase() + c.key.slice(1).replace("_", " ");
    doc.text(label, x, y);
    x += c.w;
  });
  y += lineHeight * 1.2;

  rows.forEach((r) => {
    if (y > pageHeight - margin - lineHeight * 3) {
      doc.addPage("a4", "landscape");
      y = margin + lineHeight;
    }
    x = margin;
    const row = [
      displayName(r).slice(0, 24),
      (r.email ?? "").slice(0, 32),
      (r.phone ?? "").slice(0, 18),
      (r.city ?? "").slice(0, 14),
      (r.entrenamientoLabel ?? "").slice(0, 24),
      (r.admin_notes ?? "").slice(0, 38),
      r.daysRemaining === null ? "—" : String(r.daysRemaining),
    ];
    cols.forEach((c, j) => {
      const text = doc.splitTextToSize(row[j], c.w - 1);
      doc.text(text[0] ?? "", x, y);
      x += c.w;
    });
    y += lineHeight;
  });

  doc.save("backlogs.pdf");
}
