"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateReportNotes, deleteReport } from "../actions";
import type { ReportContent } from "../report-builder";
import { buildReportPdf } from "../report-pdf";
import { FileText, Pencil, Trash2 } from "lucide-react";

type Props = {
  eventId: string;
  initialContent: ReportContent;
};

export function ReportViewClient({ eventId, initialContent }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialContent.notes);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      const result = await updateReportNotes(eventId, notes);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este reporte? Podrás generarlo de nuevo desde el evento.")) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteReport(eventId);
      if (result.success) {
        router.push("/app/reports");
      } else {
        alert(result.error);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadPdf = () => {
    buildReportPdf({ ...initialContent, notes });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Notas</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Añade notas específicas del evento…"
          className="min-h-[120px]"
        />
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={saving}
          onClick={handleSaveNotes}
        >
          {saving ? "Guardando…" : "Guardar notas"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownloadPdf}
          className="gap-2"
        >
          <FileText className="size-4" />
          Descargar PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          asChild
          className="gap-2"
        >
          <a href={`/app/events/${eventId}`}>
            <Pencil className="size-4" />
            Editar evento
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
          {deleting ? "Eliminando…" : "Eliminar reporte"}
        </Button>
      </div>
    </div>
  );
}
