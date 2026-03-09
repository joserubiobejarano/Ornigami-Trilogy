import { jsPDF } from "jspdf";
import type { PersonRow } from "./types";
import { INSCRIPTION_VALID_DAYS } from "./constants";

function escapeCsvCell(value: string): string {
  const s = String(value ?? "").trim();
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function displayName(p: PersonRow): string {
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.join(" ") || p.email || "—";
}

function daysRemaining(p: PersonRow): number | null {
  const created = p.created_at;
  if (!created) return null;
  const createdAt = new Date(created).getTime();
  const now = Date.now();
  const elapsedDays = Math.floor((now - createdAt) / (24 * 60 * 60 * 1000));
  return Math.max(0, INSCRIPTION_VALID_DAYS - elapsedDays);
}

export function exportPeopleCSV(
  people: PersonRow[],
  filenamePrefix = "participantes"
): void {
  const headers = ["Nombre", "Correo", "Teléfono", "Ciudad", "Días restantes"];
  const dataRows = people.map((p) => [
    displayName(p),
    p.email ?? "",
    p.phone ?? "",
    p.city ?? "",
    daysRemaining(p) === null ? "" : String(daysRemaining(p)),
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

export function buildPeopleTablePdf(
  people: PersonRow[],
  filenamePrefix = "participantes"
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 5;
  const fontSize = 8;
  doc.setFontSize(fontSize);

  const title = "Participantes";
  doc.setFontSize(10);
  doc.text(title, margin, margin + lineHeight);
  doc.setFontSize(fontSize);
  let y = margin + lineHeight * 2.5;

  const cols = [
    { key: "nombre", w: 45 },
    { key: "correo", w: 55 },
    { key: "telefono", w: 30 },
    { key: "ciudad", w: 25 },
    { key: "dias_restantes", w: 28 },
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

  people.forEach((p) => {
    if (y > pageHeight - margin - lineHeight * 3) {
      doc.addPage("a4", "landscape");
      y = margin + lineHeight;
    }
    x = margin;
    const row = [
      displayName(p).slice(0, 28),
      (p.email ?? "").slice(0, 38),
      (p.phone ?? "").slice(0, 18),
      (p.city ?? "").slice(0, 14),
      daysRemaining(p) === null ? "—" : String(daysRemaining(p)),
    ];
    cols.forEach((c, j) => {
      const text = doc.splitTextToSize(row[j], c.w - 1);
      doc.text(text[0] ?? "", x, y);
      x += c.w;
    });
    y += lineHeight;
  });

  doc.save(`${filenamePrefix}.pdf`);
}
