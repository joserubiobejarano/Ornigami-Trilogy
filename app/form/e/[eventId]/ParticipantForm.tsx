"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitParticipantForm, type SubmitParticipantFormResult } from "./actions";

const PAYMENT_OPTIONS = ["Square", "Afterpay", "Zelle", "Cash", "TDC"] as const;

function submitAction(
  _prev: SubmitParticipantFormResult | null,
  formData: FormData
): Promise<SubmitParticipantFormResult> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return Promise.resolve({ success: false, error: "Falta el evento." });

  const payments: { method: string; amount: number | null }[] = [];

  const method1 = String(formData.get("form_de_pago") ?? "").trim();
  const amount1Str = String(formData.get("cantidad_pagada") ?? "").trim();
  const amount1 =
    amount1Str && !Number.isNaN(Number(amount1Str)) ? Number(amount1Str) : null;
  if (method1 && PAYMENT_OPTIONS.includes(method1 as (typeof PAYMENT_OPTIONS)[number])) {
    payments.push({ method: method1, amount: amount1 });
  }

  const method2 = String(formData.get("form_de_pago_2") ?? "").trim();
  const amount2Str = String(formData.get("cantidad_pagada_2") ?? "").trim();
  const amount2 =
    amount2Str && !Number.isNaN(Number(amount2Str)) ? Number(amount2Str) : null;
  if (method2 && PAYMENT_OPTIONS.includes(method2 as (typeof PAYMENT_OPTIONS)[number])) {
    payments.push({ method: method2, amount: amount2 });
  }

  return submitParticipantForm(eventId, {
    first_name: String(formData.get("first_name") ?? "").trim() || undefined,
    last_name: String(formData.get("last_name") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim(),
    angel_name: String(formData.get("angel_name") ?? "").trim() || undefined,
    payments,
  });
}

export function ParticipantForm({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [state, formAction, isPending] = useActionState(submitAction, null);
  const [showSecondPayment, setShowSecondPayment] = useState(false);

  useEffect(() => {
    if (state?.success) {
      // Optional: scroll or show success message only (no redirect)
    }
  }, [state]);

  if (state?.success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950/30">
        <p className="font-medium text-green-800 dark:text-green-400">
          Registro recibido
        </p>
        <p className="mt-1 text-sm text-green-700 dark:text-green-500">
          Te hemos registrado para {eventTitle}. Nos pondremos en contacto contigo.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6 rounded-lg border p-6">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="space-y-2">
        <Label htmlFor="form-first_name">Nombre</Label>
        <Input id="form-first_name" name="first_name" placeholder="Nombre" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-last_name">Apellido</Label>
        <Input id="form-last_name" name="last_name" placeholder="Apellido" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-email">Correo (obligatorio)</Label>
        <Input
          id="form-email"
          name="email"
          type="email"
          required
          placeholder="correo@ejemplo.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-phone">Teléfono</Label>
        <Input id="form-phone" name="phone" placeholder="Teléfono" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-angel_name">Persona que te invitó</Label>
        <Input id="form-angel_name" name="angel_name" placeholder="Nombre de la persona" />
      </div>
      <div className="space-y-2">
        <Label>Terminos & Condiciones</Label>
        <p className="text-sm text-muted-foreground">
          <a
            href="https://eform.pandadoc.com/?eform=e766c120-b193-4d1c-aaf8-c7768e551e27"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Firmar los terminos y condiciones
          </a>
        </p>
      </div>
      <div className="space-y-2">
        <Label>Link de Pago</Label>
        <p className="text-sm text-muted-foreground space-y-1">
          <a
            href="https://checkout.square.site/merchant/MLA199Y065F3C/checkout/L6C4D3DJEWPNJ4OHLTYPUKPU?src=sheet"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Usa este enlace para pagos con Square, Afterpay &amp; Tarjeta de crédito
          </a>
          <br />
          Pagos con Zelle a info@somostrilogy.com
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-form_de_pago">Forma de Pago</Label>
        <select
          id="form-form_de_pago"
          name="form_de_pago"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {PAYMENT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-cantidad_pagada">Cantidad pagada</Label>
        <Input
          id="form-cantidad_pagada"
          name="cantidad_pagada"
          type="number"
          min={0}
          step="0.01"
          placeholder="Cantidad pagada"
        />
      </div>
      {showSecondPayment && (
        <>
          <div className="space-y-2">
            <Label htmlFor="form-form_de_pago_2">Segunda forma de pago</Label>
            <select
              id="form-form_de_pago_2"
              name="form_de_pago_2"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PAYMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-cantidad_pagada_2">Cantidad pagada (segunda)</Label>
            <Input
              id="form-cantidad_pagada_2"
              name="cantidad_pagada_2"
              type="number"
              min={0}
              step="0.01"
              placeholder="Cantidad pagada"
            />
          </div>
        </>
      )}
      {!showSecondPayment && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setShowSecondPayment(true)}
        >
          Añadir otra forma de pago
        </Button>
      )}
      {state && !state.success && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Enviando…" : "Enviar registro"}
      </Button>
    </form>
  );
}
