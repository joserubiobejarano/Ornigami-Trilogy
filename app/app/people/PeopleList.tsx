"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PersonRow } from "./types";
import type { PeopleCounts, EventFilterOptions } from "./actions";
import { deletePerson } from "./actions";
import { exportPeopleCSV, buildPeopleTablePdf } from "./export-table";

const PAYMENT_UI: Record<string, string> = {
  square: "Square",
  afterpay: "Afterpay",
  zelle: "Zelle",
  cash: "Cash",
  tdc: "TDC",
  sin_pago: "Sin pago",
};

function filterPeople(people: PersonRow[], query: string): PersonRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter((p) => {
    const first = (p.first_name ?? "").toLowerCase();
    const last = (p.last_name ?? "").toLowerCase();
    const email = (p.email ?? "").toLowerCase();
    const phone = (p.phone ?? "").replace(/\D/g, "");
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

function displayName(p: PersonRow): string {
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.join(" ") || p.email || "—";
}

function buildSearchParams(
  current: URLSearchParams,
  updates: {
    city?: string;
    payment?: string;
    entrenamiento?: string;
  }
): string {
  const params = new URLSearchParams(current.toString());
  if (updates.city !== undefined) {
    if (updates.city === "all") params.delete("city");
    else params.set("city", updates.city);
  }
  if (updates.payment !== undefined) {
    if (updates.payment === "all") params.delete("payment");
    else params.set("payment", updates.payment);
  }
  if (updates.entrenamiento !== undefined) {
    if (updates.entrenamiento === "all" || !updates.entrenamiento.trim()) params.delete("entrenamiento");
    else params.set("entrenamiento", updates.entrenamiento);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function PeopleList({
  people,
  counts,
  filterCity,
  filterPayment,
  filterEntrenamiento,
  eventFilterOptions,
  cityOptions,
}: {
  people: PersonRow[];
  counts: PeopleCounts;
  filterCity: string;
  filterPayment: string;
  filterEntrenamiento: string;
  eventFilterOptions: EventFilterOptions;
  /** All cities from catalog (Administración > Ciudades). */
  cityOptions: string[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleDelete = (person: PersonRow) => {
    const name = displayName(person);
    if (!confirm(`¿Eliminar a ${name}? Se eliminará permanentemente del sistema junto con sus inscripciones.`)) {
      return;
    }
    startTransition(async () => {
      const result = await deletePerson(person.id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const filtered = useMemo(
    () => filterPeople(people, searchQuery),
    [people, searchQuery]
  );

  const setFilters = (updates: {
    city?: string;
    payment?: string;
    entrenamiento?: string;
  }) => {
    const next = buildSearchParams(searchParams, {
      city: updates.city ?? filterCity,
      payment: updates.payment ?? filterPayment,
      entrenamiento: updates.entrenamiento ?? filterEntrenamiento,
    });
    router.push(`/app/people${next}`);
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-end gap-3 sm:gap-4 max-w-full">
        <div className="w-full sm:max-w-xs min-w-0 flex-shrink-0">
          <Input
            type="search"
            placeholder="Buscar por nombre, correo o teléfono…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full min-w-0"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 min-w-0">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center gap-2">
            <label htmlFor="filter-city" className="text-sm text-foreground shrink-0">
              Ciudad
            </label>
            <div className="relative inline-block">
              <select
                id="filter-city"
                value={filterCity}
                onChange={(e) => setFilters({ city: e.target.value })}
                className={cn(
                  "border-input h-9 w-full min-w-[6rem] rounded-none border bg-transparent pl-3 pr-8 py-1 text-sm shadow-xs appearance-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                )}
              >
                <option value="all">Todos</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c} ({counts.byCity[c] ?? 0})
                  </option>
                ))}
                <option value="Sin ciudad">Sin ciudad ({counts.byCity["Sin ciudad"] ?? 0})</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 shrink-0 opacity-70"
                aria-hidden
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center gap-2">
            <label htmlFor="filter-payment" className="text-sm text-foreground shrink-0">
              Forma de pago
            </label>
            <div className="relative inline-block">
              <select
                id="filter-payment"
                value={filterPayment}
                onChange={(e) => setFilters({ payment: e.target.value })}
                className={cn(
                  "border-input h-9 w-full min-w-[6rem] rounded-none border bg-transparent pl-3 pr-8 py-1 text-sm shadow-xs appearance-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                )}
              >
                <option value="all">Todos</option>
                {Object.keys(counts.byPaymentMethod).length > 0
                  ? Object.entries(counts.byPaymentMethod).map(([db, n]) => (
                      <option key={db} value={db}>
                        {PAYMENT_UI[db] ?? db} ({n})
                      </option>
                    ))
                  : Object.entries(PAYMENT_UI).map(([db, label]) => (
                      <option key={db} value={db}>
                        {label} (0)
                      </option>
                    ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 shrink-0 opacity-70"
                aria-hidden
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center gap-2">
            <label htmlFor="filter-entrenamiento" className="text-sm text-foreground shrink-0">
              Entrenamiento
            </label>
            <div className="relative inline-block">
              <select
                id="filter-entrenamiento"
                value={filterEntrenamiento}
                onChange={(e) => setFilters({ entrenamiento: e.target.value })}
                className={cn(
                  "border-input h-9 w-full min-w-[6rem] rounded-none border bg-transparent pl-3 pr-8 py-1 text-sm shadow-xs appearance-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                )}
              >
                <option value="all">Todos</option>
                {eventFilterOptions.events.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 shrink-0 opacity-70"
                aria-hidden
              />
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white text-black border-input hover:bg-gray-100 hover:text-black shrink-0"
              >
                Descargar ▾
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-2">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => exportPeopleCSV(filtered, "participantes")}
                  className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => buildPeopleTablePdf(filtered, "participantes")}
                  className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                >
                  PDF
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-black text-white">
              <th className="px-4 py-3 text-left font-medium">Nombre</th>
              <th className="px-4 py-3 text-left font-medium">Correo</th>
              <th className="px-4 py-3 text-left font-medium">Teléfono</th>
              <th className="px-4 py-3 text-left font-medium">Ciudad</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {people.length === 0
                    ? "Aún no hay participantes."
                    : "Ningún resultado coincide con la búsqueda."}
                </td>
              </tr>
            ) : (
              filtered.map((person) => (
                <tr key={person.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{displayName(person)}</td>
                  <td className="px-4 py-3">{person.email}</td>
                  <td className="px-4 py-3">{person.phone ?? "—"}</td>
                  <td className="px-4 py-3">{person.city ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/app/people/${person.id}`}>Abrir</Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={isPending}
                        onClick={() => handleDelete(person)}
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
