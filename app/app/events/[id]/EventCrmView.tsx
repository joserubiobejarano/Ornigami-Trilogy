"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AddParticipantModal } from "./AddParticipantModal";
import { EventParticipantsTable } from "./EventParticipantsTable";
import {
  exportParticipantsCSV,
  buildParticipantsTablePdf,
} from "./export-table";
import { updateEvent, updateEventStaff, type UpdateEventResult } from "@/app/app/events/actions";
import type { EventWithEnrollments } from "@/app/app/events/types";
import { ensureReportForEvent } from "@/app/app/reports/actions";
import { programTypeToDisplay } from "@/lib/program-display";

function eventTitle(event: EventWithEnrollments) {
  const parts = [
    programTypeToDisplay(event.program_type),
    event.code,
    event.city,
  ].filter(Boolean);
  return parts.join(" ") || "Evento";
}

function toLocalDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return "";
  }
}

function updateEventDatesAction(
  _prev: UpdateEventResult | null,
  formData: FormData
): Promise<UpdateEventResult> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return Promise.resolve({ success: false, error: "Falta el evento." });
  return updateEvent(eventId, formData);
}

type StatusFilterOption = "todos" | "backlock" | "asistieron" | "finalizaron";

function filterBySearch(
  enrollments: EventWithEnrollments["enrollments"],
  query: string
) {
  const q = query.trim().toLowerCase();
  if (!q) return enrollments;
  return enrollments.filter((e) => {
    const first = (e.person?.first_name ?? "").toLowerCase();
    const last = (e.person?.last_name ?? "").toLowerCase();
    const email = (e.person?.email ?? "").toLowerCase();
    const phone = (e.person?.phone ?? "").replace(/\D/g, "");
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

function filterEnrollmentsByStatus(
  enrollments: EventWithEnrollments["enrollments"],
  filter: StatusFilterOption
) {
  if (filter === "todos") return enrollments;
  if (filter === "backlock") {
    return enrollments.filter((e) => {
      const tags = (e.status ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      return tags.includes("BGK");
    });
  }
  if (filter === "asistieron") return enrollments.filter((e) => e.attended);
  if (filter === "finalizaron") return enrollments.filter((e) => e.finalized);
  return enrollments;
}

export function EventCrmView({
  data,
}: {
  data: EventWithEnrollments;
}) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("todos");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [generateReportPending, setGenerateReportPending] = useState(false);
  const [datesState, datesFormAction, isDatesPending] = useActionState(updateEventDatesAction, null);
  const didRefreshForSuccess = useRef(false);

  const [coordinator, setCoordinator] = useState(data.coordinator ?? "");
  const [entrenadores, setEntrenadores] = useState(data.entrenadores ?? "");
  const [capitanMentores, setCapitanMentores] = useState(data.capitan_mentores ?? "");
  const [mentores, setMentores] = useState(data.mentores ?? "");
  const staffSavingRef = useRef(false);

  useEffect(() => {
    setCoordinator(data.coordinator ?? "");
    setEntrenadores(data.entrenadores ?? "");
    setCapitanMentores(data.capitan_mentores ?? "");
    setMentores(data.mentores ?? "");
  }, [data.coordinator, data.entrenadores, data.capitan_mentores, data.mentores]);

  const saveStaffField = useCallback(
    async (field: "coordinator" | "entrenadores" | "capitan_mentores" | "mentores", value: string) => {
      if (staffSavingRef.current) return;
      staffSavingRef.current = true;
      try {
        const result = await updateEventStaff(data.id, { [field]: value || null });
        if (result.success) router.refresh();
        else alert(result.error);
      } finally {
        staffSavingRef.current = false;
      }
    },
    [data.id, router]
  );

  useEffect(() => {
    if (datesState?.success && !didRefreshForSuccess.current) {
      didRefreshForSuccess.current = true;
      router.refresh();
    }
    if (!datesState?.success) {
      didRefreshForSuccess.current = false;
    }
  }, [datesState, router]);

  const filteredEnrollments = useMemo(
    () =>
      filterEnrollmentsByStatus(
        filterBySearch(data.enrollments, searchQuery),
        statusFilter
      ),
    [data.enrollments, searchQuery, statusFilter]
  );

  return (
    <div className="space-y-3 lg:space-y-4">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/events">← Volver a entrenamientos</Link>
        </Button>
      </div>

      <header className="space-y-1 -mt-1">
        <h1 className="text-lg font-semibold md:text-xl lg:text-2xl">{eventTitle(data)}</h1>
      </header>
      <div className="space-y-1">
        <form action={datesFormAction} className="mt-1">
          <input type="hidden" name="eventId" value={data.id} />
          <input type="hidden" name="program_type" value={data.program_type} />
          <input type="hidden" name="code" value={data.code} />
          <input type="hidden" name="city" value={data.city} />
          <div className="min-w-0 mb-4 lg:mb-6">
            <div className="flex flex-wrap items-end gap-2 lg:gap-3">
            <div className="space-y-1">
              <Label htmlFor="event-start_date" className="text-xs text-muted-foreground">
                Inicio
              </Label>
              <Input
                id="event-start_date"
                name="start_date"
                type="date"
                defaultValue={toLocalDate(data.start_date)}
                className="h-8 lg:h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-end_date" className="text-xs text-muted-foreground">
                Fin
              </Label>
              <Input
                id="event-end_date"
                name="end_date"
                type="date"
                defaultValue={toLocalDate(data.end_date)}
                className="h-8 lg:h-9"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="bg-white text-black border-input hover:bg-gray-100 hover:text-black"
              disabled={isDatesPending}
            >
              {isDatesPending ? "Guardando…" : "Guardar fechas"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-black text-white hover:bg-black/90"
              disabled={generateReportPending}
              onClick={async () => {
                setGenerateReportPending(true);
                try {
                  const result = await ensureReportForEvent(data.id);
                  if (result.success) {
                    router.push(`/app/reports/${result.eventId}`);
                  } else {
                    alert(result.error);
                  }
                } finally {
                  setGenerateReportPending(false);
                }
              }}
            >
              {generateReportPending ? "Generando…" : "Generar reporte"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/form/e/${data.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Formulario
              </a>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="bg-white text-black border-input hover:bg-gray-100 hover:text-black">
                  Filtrar{statusFilter !== "todos" ? `: ${statusFilter === "backlock" ? "Backlock" : statusFilter === "asistieron" ? "Asistieron" : "Finalizaron"}` : ""} ▾
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-2">
                <div className="flex flex-col gap-0.5">
                  {(
                    [
                      { value: "todos" as const, label: "Todos" },
                      { value: "backlock" as const, label: "Backlock" },
                      { value: "asistieron" as const, label: "Asistieron" },
                      { value: "finalizaron" as const, label: "Finalizaron" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusFilter(value)}
                      className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="bg-white text-black border-input hover:bg-gray-100 hover:text-black">
                  Descargar ▾
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-40 p-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      exportParticipantsCSV(filteredEnrollments, data.code ?? "evento");
                    }}
                    className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      buildParticipantsTablePdf(filteredEnrollments, data);
                    }}
                    className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                  >
                    PDF
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-3 lg:gap-2 lg:mb-5">
          <Button type="button" size="sm" onClick={() => setAddModalOpen(true)}>
            Agregar participante
          </Button>
          <Input
            type="search"
            placeholder="Buscar por nombre, correo o teléfono…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 min-w-[160px] flex-1 max-w-sm lg:h-9"
          />
          <input type="hidden" name="coordinator" value={coordinator} />
          <input type="hidden" name="entrenadores" value={entrenadores} />
          <input type="hidden" name="capitan_mentores" value={capitanMentores} />
          <input type="hidden" name="mentores" value={mentores} />
          <div className="flex flex-wrap items-center justify-start gap-1 overflow-x-auto shrink-0 lg:gap-1.5">
            <div className="flex items-center gap-1 shrink-0">
              <Label htmlFor="event-coordinator" className="text-sm text-foreground whitespace-nowrap">
                Coordinador
              </Label>
              <Input
                id="event-coordinator"
                value={coordinator}
                onChange={(e) => setCoordinator(e.target.value)}
                onBlur={() => saveStaffField("coordinator", coordinator)}
                placeholder="Nombres"
                className="h-7 min-w-[72px] w-28 text-sm lg:h-8 lg:min-w-[80px] lg:w-32 !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Label htmlFor="event-entrenadores" className="text-sm text-foreground whitespace-nowrap">
                Entrenadores
              </Label>
              <Input
                id="event-entrenadores"
                value={entrenadores}
                onChange={(e) => setEntrenadores(e.target.value)}
                onBlur={() => saveStaffField("entrenadores", entrenadores)}
                placeholder="Nombres"
                className="h-7 min-w-[72px] w-28 text-sm lg:h-8 lg:min-w-[80px] lg:w-32 !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Label htmlFor="event-mentores" className="text-sm text-foreground whitespace-nowrap">
                Mentores
              </Label>
              <Input
                id="event-mentores"
                value={mentores}
                onChange={(e) => setMentores(e.target.value)}
                onBlur={() => saveStaffField("mentores", mentores)}
                placeholder="Nombres"
                className="h-7 min-w-[72px] w-28 text-sm lg:h-8 lg:min-w-[80px] lg:w-32 !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Label htmlFor="event-capitan_mentores" className="text-sm text-foreground whitespace-nowrap">
                Capitán mentores
              </Label>
              <Input
                id="event-capitan_mentores"
                value={capitanMentores}
                onChange={(e) => setCapitanMentores(e.target.value)}
                onBlur={() => saveStaffField("capitan_mentores", capitanMentores)}
                placeholder="Nombres"
                className="h-7 min-w-[72px] w-28 text-sm lg:h-8 lg:min-w-[80px] lg:w-32 !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
          </div>
        </div>
        {datesState && !datesState.success && (
          <p className="mt-2 text-sm text-destructive">{datesState.error}</p>
        )}
        </form>
      </div>

      <div className="min-w-0 w-full overflow-hidden">
        <EventParticipantsTable
          event={data}
          enrollments={filteredEnrollments}
        />
      </div>

      <AddParticipantModal
        eventId={data.id}
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
      />
    </div>
  );
}
