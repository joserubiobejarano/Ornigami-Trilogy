"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteReport, getReportContent } from "./actions";
import type { ReportListItem } from "./actions";
import { programTypeToDisplay } from "@/lib/program-display";
import { buildReportPdf } from "./report-pdf";
import { FileText, Pencil, Trash2 } from "lucide-react";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      dateStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ReportsList({ reports }: { reports: ReportListItem[] }) {
  const router = useRouter();

  const handleDownloadPdf = async (e: React.MouseEvent, item: ReportListItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const content = await getReportContent(item.event_id);
      if (content) {
        buildReportPdf(content);
      } else {
        alert("No se pudo descargar el reporte.");
      }
    } catch {
      alert("No se pudo descargar el reporte.");
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: ReportListItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("¿Eliminar este reporte? Podrás generarlo de nuevo desde el evento.")) {
      return;
    }
    const result = await deleteReport(item.event_id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  if (reports.length === 0) {
    return (
      <div className="rounded-md border py-12 text-center text-muted-foreground">
        Aún no hay reportes. Genera uno desde un evento con el botón «Generar reporte».
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {reports.map((item) => {
        const title = `${programTypeToDisplay(item.program_type)} ${item.code}`;
        const subtitle = [item.city, formatDate(item.end_date)].filter(Boolean).join(" · ");
        return (
          <div
            key={item.id}
            className="flex flex-col rounded-md border-2 bg-card p-3 hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => router.push(`/app/reports/${item.event_id}`)}
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base truncate">{title}</h3>
              {subtitle ? (
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
              ) : null}
            </div>
            <div
              className="flex items-center gap-2 mt-3 pt-2 border-t"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => handleDownloadPdf(e, item)}
                className="shrink-0"
                title="Descargar PDF"
              >
                <FileText className="size-4" />
              </Button>
              <Button variant="outline" size="sm" asChild className="shrink-0" title="Editar">
                <Link href={`/app/reports/${item.event_id}`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => handleDelete(e, item)}
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Eliminar"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
