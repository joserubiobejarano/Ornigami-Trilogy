"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { duplicateEvent, type DuplicateEventResult } from "./actions";
import type { EventRow } from "./types";
import { cn } from "@/lib/utils";
import type { CityRow, ProgramTypeRow } from "@/app/app/administration/actions";

function duplicateEventAction(
  _prev: DuplicateEventResult | null,
  formData: FormData
): Promise<DuplicateEventResult> {
  const sourceEventId = formData.get("sourceEventId") as string;
  if (!sourceEventId) return Promise.resolve({ success: false, error: "Falta el evento de origen." });
  return duplicateEvent(sourceEventId, formData);
}

export function DuplicateEventModal({
  open,
  onOpenChange,
  sourceEvent,
  cities,
  programTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceEvent: EventRow | null;
  cities: CityRow[];
  programTypes: ProgramTypeRow[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(duplicateEventAction, null);

  useEffect(() => {
    if (state?.success && state.newEventId) {
      onOpenChange(false);
      router.refresh();
      router.push(`/app/events/${state.newEventId}`);
    }
  }, [state, onOpenChange, router]);

  if (!sourceEvent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar evento</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Crear un nuevo evento a partir de {sourceEvent.program_type} {sourceEvent.code} ({sourceEvent.city}). Elige qué participantes copiar al nuevo evento.
          </p>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="sourceEventId" value={sourceEvent.id} />
          <div className="space-y-2">
            <Label htmlFor="dup_program_type">Programa del nuevo evento</Label>
            <select
              id="dup_program_type"
              name="program_type"
              defaultValue={sourceEvent.program_type}
              className={cn(
                "border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs md:text-sm",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
              )}
            >
              {programTypes.map((pt) => (
                <option key={pt.id} value={pt.code}>
                  {pt.code} — {pt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dup_code">Número del nuevo evento</Label>
            <Input
              id="dup_code"
              name="code"
              required
              placeholder="43"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dup_city">Ciudad</Label>
            <select
              id="dup_city"
              name="city"
              required
              defaultValue={sourceEvent.city}
              className={cn(
                "border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs md:text-sm",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
              )}
            >
              {cities.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dup_coordinator">Coordinador</Label>
            <Input
              id="dup_coordinator"
              name="coordinator"
              defaultValue={sourceEvent.coordinator ?? ""}
              placeholder="Coordinador"
            />
          </div>
          <div className="space-y-3">
            <Label className="font-medium">Participantes a copiar</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="copy_mode"
                  value="finalized"
                  defaultChecked
                  required
                  className="h-4 w-4 border border-input"
                />
                <span className="text-sm font-normal">
                  Copiar con participantes que finalizaron
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="copy_mode"
                  value="backlog_or_no_asistio"
                  className="h-4 w-4 border border-input"
                />
                <span className="text-sm font-normal">
                  Copiar con Backlogs y los que no asistieron
                </span>
              </label>
            </div>
          </div>
          {state && !state.success && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Duplicando…" : "Duplicar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
