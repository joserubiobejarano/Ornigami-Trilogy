"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddParticipantModal } from "./AddParticipantModal";
import { EventParticipantsTable } from "./EventParticipantsTable";
import { updateEvent, updateEventStaff, type UpdateEventResult } from "@/app/app/events/actions";
import type { EventWithEnrollments } from "@/app/app/events/types";
import { ensureReportForEvent } from "@/app/app/reports/actions";
import { programTypeToDisplay } from "@/lib/program-display";

function formatDateRange(start: string, end: string) {
  try {
    const s = new Date(start).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    const e = new Date(end).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    return `${s} – ${e}`;
  } catch {
    return `${start} – ${end}`;
  }
}

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

export function EventCrmView({
  data,
}: {
  data: EventWithEnrollments;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") as
    | "backlog"
    | "confirmed"
    | "attended"
    | "finalized"
    | null;

  const [searchQuery, setSearchQuery] = useState("");
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
    () => filterBySearch(data.enrollments, searchQuery),
    [data.enrollments, searchQuery]
  );

  const setView = (v: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("view", v);
    else params.delete("view");
    router.push(`/app/events/${data.id}?${params.toString()}`);
  };

  const isActive = (v: string | null) => view === v || (!view && v === null);

  return (
    <div className="space-y-3 lg:space-y-4">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/events">← Volver a entrenamientos</Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="text-lg font-semibold md:text-xl lg:text-2xl">{eventTitle(data)}</h1>
        <p className="text-muted-foreground">
          {data.start_date && data.end_date
            ? formatDateRange(data.start_date, data.end_date)
            : "—"}
        </p>
      </header>
      <div className="space-y-1">
        <form action={datesFormAction} className="mt-3">
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
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-4 mb-3 lg:gap-6 lg:mb-5">
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <Button type="button" size="sm" onClick={() => setAddModalOpen(true)}>
              Agregar participante
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isActive(null) ? "secondary" : "outline"}
              onClick={() => setView(null)}
            >
              Todos
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "backlog" ? "secondary" : "outline"}
              onClick={() => setView("backlog")}
            >
              Backlog
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "confirmed" ? "secondary" : "outline"}
              onClick={() => setView("confirmed")}
            >
              Confirmados
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "attended" ? "secondary" : "outline"}
              onClick={() => setView("attended")}
            >
              Asistieron
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "finalized" ? "secondary" : "outline"}
              onClick={() => setView("finalized")}
            >
              Finalizaron
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-3 md:flex-row md:flex-nowrap md:items-end md:gap-2 md:overflow-x-auto md:min-w-0 lg:gap-3">
          <div className="w-full min-w-0 md:flex-1 md:max-w-md">
            <Input
              type="search"
              placeholder="Buscar por nombre, correo o teléfono…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 min-w-0 w-full lg:h-9"
            />
          </div>
          <input type="hidden" name="coordinator" value={coordinator} />
          <input type="hidden" name="entrenadores" value={entrenadores} />
          <input type="hidden" name="capitan_mentores" value={capitanMentores} />
          <input type="hidden" name="mentores" value={mentores} />
          <div className="flex overflow-x-auto gap-2 shrink-0 items-end md:gap-2 lg:gap-3">
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Label htmlFor="event-coordinator" className="text-sm text-foreground whitespace-nowrap">
                Coordinador
              </Label>
              <Input
                id="event-coordinator"
                value={coordinator}
                onChange={(e) => setCoordinator(e.target.value)}
                onBlur={() => saveStaffField("coordinator", coordinator)}
                placeholder="Nombres"
                className="h-8 min-w-[90px] text-sm lg:h-9 lg:min-w-[140px] !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Label htmlFor="event-entrenadores" className="text-sm text-foreground whitespace-nowrap">
                Entrenadores
              </Label>
              <Input
                id="event-entrenadores"
                value={entrenadores}
                onChange={(e) => setEntrenadores(e.target.value)}
                onBlur={() => saveStaffField("entrenadores", entrenadores)}
                placeholder="Nombres"
                className="h-8 min-w-[90px] text-sm lg:h-9 lg:min-w-[140px] !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Label htmlFor="event-capitan_mentores" className="text-sm text-foreground whitespace-nowrap">
                Capitán mentores
              </Label>
              <Input
                id="event-capitan_mentores"
                value={capitanMentores}
                onChange={(e) => setCapitanMentores(e.target.value)}
                onBlur={() => saveStaffField("capitan_mentores", capitanMentores)}
                placeholder="Nombres"
                className="h-8 min-w-[90px] text-sm lg:h-9 lg:min-w-[140px] !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Label htmlFor="event-mentores" className="text-sm text-foreground whitespace-nowrap">
                Mentores
              </Label>
              <Input
                id="event-mentores"
                value={mentores}
                onChange={(e) => setMentores(e.target.value)}
                onBlur={() => saveStaffField("mentores", mentores)}
                placeholder="Nombres"
                className="h-8 min-w-[90px] text-sm lg:h-9 lg:min-w-[140px] !bg-transparent border-transparent dark:!bg-transparent focus-visible:!bg-transparent focus-visible:dark:!bg-transparent placeholder-shown:bg-background placeholder-shown:border placeholder-shown:border-input [&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:shadow-[inset_0_0_0_9999px_var(--background)]"
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
