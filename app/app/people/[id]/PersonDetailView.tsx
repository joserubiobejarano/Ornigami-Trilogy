"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type {
  EnrollmentWithEventAndPayments,
  PersonWithEnrollments,
} from "@/app/app/people/types";
import { programTypeToDisplay } from "@/lib/program-display";
import { formatCurrency } from "@/app/app/reports/report-builder";
import { moveToNextProgram } from "./actions";
import { PROGRAM_ORDER } from "../constants";

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

function formatPaymentDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatEnrollmentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "short",
    });
  } catch {
    return "—";
  }
}

function eventFullTitle(event: EnrollmentWithEventAndPayments["event"]): string {
  if (!event) return "—";
  const program = programTypeToDisplay(event.program_type);
  const parts = [program, event.code, event.city].filter(Boolean);
  return parts.join(" ") || "—";
}

function nextProgramType(current: string): string | null {
  const upper = current?.toUpperCase();
  if (upper === "PT") return "LT";
  if (upper === "LT") return "TL";
  return null;
}

export function PersonDetailView({
  data,
}: {
  data: PersonWithEnrollments;
}) {
  const router = useRouter();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const handleMoveToNext = useCallback(
    async (enrollmentId: string) => {
      setMoveError(null);
      setMovingId(enrollmentId);
      const result = await moveToNextProgram(enrollmentId, data.id);
      setMovingId(null);
      if (result.success) {
        router.refresh();
      } else {
        setMoveError(result.error);
      }
    },
    [data.id, router]
  );

  const enrollmentsByProgram = PROGRAM_ORDER.map((programType) => ({
    programType,
    enrollments: data.enrollments.filter(
      (e) => e.event?.program_type?.toUpperCase() === programType
    ),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 sm:px-0">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/people">← Volver</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participante</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Nombre</Label>
              <p className="text-sm">{data.first_name ?? "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Apellido</Label>
              <p className="text-sm">{data.last_name ?? "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Correo</Label>
              <p className="text-sm">{data.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Teléfono</Label>
              <p className="text-sm">{data.phone ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {moveError && (
        <p className="text-sm text-destructive">{moveError}</p>
      )}

      {enrollmentsByProgram.map(
        ({ enrollments }) =>
          enrollments.length > 0 && (
            <div key={enrollments[0]?.event?.program_type ?? "other"} className="space-y-4">
              {enrollments.map((enrollment) => (
                <EnrollmentCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  onMoveToNext={handleMoveToNext}
                  isMoving={movingId === enrollment.id}
                />
              ))}
            </div>
          )
      )}

      {data.enrollments.length === 0 && (
        <p className="text-muted-foreground">Aún no hay inscripciones.</p>
      )}
    </div>
  );
}

function EnrollmentCard({
  enrollment,
  onMoveToNext,
  isMoving,
}: {
  enrollment: EnrollmentWithEventAndPayments;
  onMoveToNext: (id: string) => void;
  isMoving: boolean;
}) {
  const event = enrollment.event;
  const isActive = event?.active === true;
  const nextType = nextProgramType(event?.program_type ?? "");
  const paymentsText =
    enrollment.payments.length === 0
      ? "—"
      : enrollment.payments
          .map((p) => {
            const method = p.method ?? "—";
            const date = formatPaymentDate(p.created_at);
            const amount =
              p.fee_amount != null ? formatCurrency(p.fee_amount) : "";
            return amount ? `${method} (${date}) ${amount}` : `${method} (${date})`;
          })
          .join(" · ");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            {eventFullTitle(event)}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {event?.start_date && event?.end_date
              ? formatDateRange(event.start_date, event.end_date)
              : "—"}
          </p>
        </div>
        {isActive && (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Activo
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2">
            <Label className="font-normal text-foreground">Confirmó</Label>
            <span className="text-foreground">
              {enrollment.confirmed ? "Sí" : "No"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="font-normal text-foreground">Asistió</Label>
            <span className="text-foreground">
              {enrollment.attended ? "Sí" : "No"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="font-normal text-foreground">Retiró</Label>
            <span className="text-foreground">
              {enrollment.withdrew ? "Sí" : "No"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="font-normal text-foreground">Finalizó</Label>
            <span className="text-foreground">
              {enrollment.finalized ? "Sí" : "No"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-normal text-foreground">Observaciones</span>
          <span className="text-muted-foreground">
            {enrollment.admin_notes?.trim() ?? "—"}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-normal text-foreground">
            Fecha de inscripción
          </span>
          <span className="text-muted-foreground">
            {formatEnrollmentDate(enrollment.created_at)}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-normal text-foreground">Pagos</span>
          <span className="text-muted-foreground">{paymentsText}</span>
        </div>

        {isActive && nextType && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onMoveToNext(enrollment.id)}
            disabled={isMoving}
          >
            {isMoving ? "Moviendo…" : "Mover al siguiente programa"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
