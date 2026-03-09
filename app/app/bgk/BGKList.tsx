"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BGKRow } from "./actions";
import { deletePerson } from "@/app/app/people/actions";
import { exportBGKCSV, buildBGKTablePdf } from "./export-table";

function displayName(row: BGKRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.join(" ") || row.email || "—";
}

function filterRows(rows: BGKRow[], query: string): BGKRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const first = (r.firstName ?? "").toLowerCase();
    const last = (r.lastName ?? "").toLowerCase();
    const email = (r.email ?? "").toLowerCase();
    const phone = (r.phone ?? "").replace(/\D/g, "");
    const qNorm = q.replace(/\D/g, "");
    return (
      first.includes(q) ||
      last.includes(q) ||
      `${first} ${last}`.trim().includes(q) ||
      `${last} ${first}`.trim().includes(q) ||
      email.includes(q) ||
      (qNorm.length >= 2 && phone.includes(qNorm))
    );
  });
}

export function BGKList({ rows }: { rows: BGKRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => filterRows(rows, searchQuery),
    [rows, searchQuery]
  );

  const handleDelete = (row: BGKRow) => {
    const name = displayName(row);
    if (
      !confirm(
        `¿Eliminar a ${name}? Se eliminará permanentemente del sistema junto con sus inscripciones.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deletePerson(row.personId);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-md min-w-[200px] flex-1">
          <Input
            type="search"
            placeholder="Buscar por nombre, correo o teléfono…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white text-black border-input hover:bg-gray-100 hover:text-black"
            >
              Descargar ▾
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-40 p-2">
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => exportBGKCSV(filtered, "backlogs")}
                className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => buildBGKTablePdf(filtered)}
                className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
              >
                PDF
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-black text-white">
              <th className="px-4 py-3 text-left font-medium">Nombre</th>
              <th className="px-4 py-3 text-left font-medium">Correo</th>
              <th className="px-4 py-3 text-left font-medium">Teléfono</th>
              <th className="px-4 py-3 text-left font-medium">Ciudad</th>
              <th className="px-4 py-3 text-left font-medium">Entrenamiento</th>
              <th className="px-4 py-3 text-center font-medium">
                Fecha Inscripción
              </th>
              <th className="px-4 py-3 text-center font-medium">
                Días restantes
              </th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "No hay participantes con estado BGK."
                    : "Ningún resultado coincide con la búsqueda."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.enrollmentId} className="border-b last:border-0">
                  <td className="px-4 py-3">{displayName(row)}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.phone ?? "—"}</td>
                  <td className="px-4 py-3">{row.city ?? "—"}</td>
                  <td className="px-4 py-3">{row.entrenamientoLabel}</td>
                  <td className="px-4 py-3 text-center">
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleDateString(undefined, {
                          dateStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.daysRemaining === null
                      ? "—"
                      : String(row.daysRemaining)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={isPending}
                        onClick={() => handleDelete(row)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
