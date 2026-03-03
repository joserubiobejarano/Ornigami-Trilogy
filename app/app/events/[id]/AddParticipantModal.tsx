"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import {
  addParticipant,
  addExistingParticipantToEvent,
  searchPeopleNotInEvent,
  type AddParticipantResult,
  type PersonOption,
} from "./actions";

function addParticipantAction(
  _prev: AddParticipantResult | null,
  formData: FormData
): Promise<AddParticipantResult> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return Promise.resolve({ success: false, error: "Falta el evento." });
  return addParticipant(eventId, {
    first_name: String(formData.get("first_name") ?? "").trim() || undefined,
    last_name: String(formData.get("last_name") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim(),
    angel_name: String(formData.get("angel_name") ?? "").trim() || undefined,
  });
}

export function AddParticipantModal({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"choice" | "existing" | "new">("choice");
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [state, formAction, isPending] = useActionState(
    addParticipantAction,
    null
  );
  const [existingAddState, setExistingAddState] = useState<AddParticipantResult | null>(null);
  const [existingPending, setExistingPending] = useState(false);
  const didHandleSuccess = useRef(false);

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep("choice");
      setSearchQuery("");
      setExistingAddState(null);
    }
    onOpenChange(open);
  };

  useEffect(() => {
    if (!open) return;
    setStep("choice");
    setSearchQuery("");
    setExistingAddState(null);
  }, [open]);

  useEffect(() => {
    if (state?.success && !didHandleSuccess.current) {
      didHandleSuccess.current = true;
      handleClose(false);
      router.refresh();
    }
    if (!state?.success) {
      didHandleSuccess.current = false;
    }
  }, [state, onOpenChange, router]);

  useEffect(() => {
    if (existingAddState?.success && !didHandleSuccess.current) {
      didHandleSuccess.current = true;
      handleClose(false);
      router.refresh();
    }
    if (!existingAddState?.success) {
      didHandleSuccess.current = false;
    }
  }, [existingAddState, router]);

  const debouncedSearch = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (step !== "existing" || !eventId) return;

    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setPeople([]);
      setPeopleLoading(false);
      if (debouncedSearch.current) {
        clearTimeout(debouncedSearch.current);
        debouncedSearch.current = null;
      }
      return;
    }

    const runSearch = () => {
      setPeopleLoading(true);
      searchPeopleNotInEvent(eventId, searchQuery)
        .then((data) => {
          setPeople(data);
        })
        .finally(() => {
          setPeopleLoading(false);
        });
    };

    if (debouncedSearch.current) {
      clearTimeout(debouncedSearch.current);
    }

    debouncedSearch.current = setTimeout(runSearch, 300);

    return () => {
      if (debouncedSearch.current) {
        clearTimeout(debouncedSearch.current);
        debouncedSearch.current = null;
      }
    };
  }, [step, eventId, searchQuery]);

  const handleSelectExisting = async (personId: string) => {
    setExistingPending(true);
    setExistingAddState(null);
    const result = await addExistingParticipantToEvent(eventId, personId);
    setExistingAddState(result);
    setExistingPending(false);
  };

  const currentError =
    state?.success === false
      ? state.error
      : existingAddState?.success === false
        ? existingAddState.error
        : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar participante</DialogTitle>
        </DialogHeader>

        {step === "choice" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              ¿Cómo deseas agregar al participante?
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-4"
              onClick={() => setStep("existing")}
            >
              Participante existente
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-4"
              onClick={() => setStep("new")}
            >
              Nuevo participante
            </Button>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "existing" && (
          <div className="space-y-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep("choice")}
            >
              ← Volver
            </Button>
            <div className="space-y-2">
              <Label>Buscar participante</Label>
              <Input
                placeholder="Nombre, apellido o correo…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {peopleLoading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : searchQuery.trim() === "" ? (
              <p className="text-sm text-muted-foreground">
                Escribe nombre, apellido o correo para buscar.
              </p>
            ) : people.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún participante coincide con tu búsqueda.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={() => handleSelectExisting(p.id)}
                      disabled={existingPending}
                    >
                      <span className="font-medium">
                        {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                      </span>
                      <span className="text-muted-foreground ml-2">{p.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {currentError && (
              <p className="text-sm text-destructive">{currentError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "new" && (
          <form action={formAction} className="space-y-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep("choice")}
            >
              ← Volver
            </Button>
            <input type="hidden" name="eventId" value={eventId} />
            <div className="space-y-2">
              <Label htmlFor="add-first_name">Nombre</Label>
              <Input id="add-first_name" name="first_name" placeholder="Nombre" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-last_name">Apellido</Label>
              <Input id="add-last_name" name="last_name" placeholder="Apellido" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-phone">Teléfono</Label>
              <Input id="add-phone" name="phone" placeholder="Teléfono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Correo (obligatorio)</Label>
              <Input
                id="add-email"
                name="email"
                type="email"
                required
                placeholder="Correo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-angel_name">Ángel</Label>
              <Input id="add-angel_name" name="angel_name" placeholder="Ángel" />
            </div>
            {currentError && (
              <p className="text-sm text-destructive">{currentError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Agregando…" : "Agregar participante"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
