"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  updateEnrollmentField,
  updateEnrollmentPaymentAmount,
  updateEnrollmentPaymentFee,
  updatePersonField,
  deleteEnrollment,
} from "./actions";
import { TransferSpotModal } from "./TransferSpotModal";
import type { EnrollmentRow, EventRow } from "@/app/app/events/types";
import { EditableCell } from "@/components/ui/editable-cell";
import { cn } from "@/lib/utils";

type BooleanField =
  | "attended"
  | "details_sent"
  | "confirmed"
  | "contract_signed"
  | "health_doc_signed"
  | "cca_signed"
  | "contacted"
  | "tl_norms_signed"
  | "tl_rules_signed"
  | "finalized"
  | "withdrew";

const METHOD_DB_TO_UI: Record<string, string> = {
  square: "Square",
  afterpay: "Afterpay",
  zelle: "Zelle",
  cash: "Cash",
  tdc: "TDC",
};

const PAYMENT_METHOD_OPTIONS = ["Square", "Afterpay", "Zelle", "Cash", "TDC"];

const ESTADO_OPTIONS = ["BGK"] as const;
const CIUDAD_OPTIONS = ["Miami", "Atlanta"] as const;

const HEADER_CELL_STICKY = "sticky top-0 z-10 bg-muted";

type OptimisticField = BooleanField | "status";
type OptimisticOverrides = Record<string, Partial<Pick<EnrollmentRow, OptimisticField>>>;

function mergeOptimisticRow(
  row: EnrollmentRow,
  overrides: Partial<Pick<EnrollmentRow, OptimisticField>> | undefined
): EnrollmentRow {
  if (!overrides || Object.keys(overrides).length === 0) return row;
  return { ...row, ...overrides };
}

export function EventParticipantsTable({
  event,
  enrollments,
}: {
  event: EventRow;
  enrollments: EnrollmentRow[];
}) {
  const router = useRouter();
  const [transferModalEnrollmentId, setTransferModalEnrollmentId] = useState<string | null>(null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<OptimisticOverrides>({});

  // Clear overrides only after server data has caught up (avoids flicker: marked -> unmarked -> marked)
  useEffect(() => {
    setOptimisticOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const enrollmentId of Object.keys(next)) {
        const override = next[enrollmentId];
        if (!override) continue;
        const serverRow = enrollments.find((r) => r.id === enrollmentId);
        if (!serverRow) continue;
        const allMatch = (Object.keys(override) as (keyof typeof override)[]).every(
          (key) => serverRow[key] === override[key]
        );
        if (allMatch) {
          delete next[enrollmentId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enrollments]);

  const handleBooleanChange = useCallback(
    async (enrollmentId: string, field: BooleanField, valueStr: string) => {
      const value = valueStr === "TRUE";
      setOptimisticOverrides((prev) => ({
        ...prev,
        [enrollmentId]: { ...prev[enrollmentId], [field]: value },
      }));
      const result = await updateEnrollmentField(enrollmentId, field, value);
      if (result.success) {
        router.refresh();
      } else {
        setOptimisticOverrides((prev) => {
          const next = { ...prev };
          const cur = next[enrollmentId];
          if (cur && field in cur) {
            const rest = { ...cur };
            delete rest[field];
            if (Object.keys(rest).length === 0) delete next[enrollmentId];
            else next[enrollmentId] = rest;
          }
          return next;
        });
        alert(result.error);
      }
    },
    [router]
  );

  const handleBlur = useCallback(
    async (
      enrollmentId: string,
      field: "admin_notes" | "angel_name" | "city" | "status",
      value: string
    ) => {
      if (field === "status") {
        setOptimisticOverrides((prev) => ({
          ...prev,
          [enrollmentId]: { ...prev[enrollmentId], status: value },
        }));
      }
      const result = await updateEnrollmentField(enrollmentId, field, value);
      if (result.success) {
        router.refresh();
      } else {
        if (field === "status") {
          setOptimisticOverrides((prev) => {
            const next = { ...prev };
            const cur = next[enrollmentId];
            if (cur && "status" in cur) {
              const rest = { ...cur };
              delete rest.status;
              if (Object.keys(rest).length === 0) delete next[enrollmentId];
              else next[enrollmentId] = rest;
            }
            return next;
          });
          alert(result.error);
        }
      }
    },
    [router]
  );

  const handlePaymentAmountChange = useCallback(
    async (enrollmentId: string, methodUiLabel: string, value: number | null) => {
      const result = await updateEnrollmentPaymentAmount(enrollmentId, methodUiLabel, value);
      if (result.success) router.refresh();
    },
    [router]
  );

  const handlePaymentFeeChange = useCallback(
    async (enrollmentId: string, value: number | null) => {
      const result = await updateEnrollmentPaymentFee(enrollmentId, value);
      if (result.success) router.refresh();
    },
    [router]
  );

  const handleRemove = useCallback(
    async (enrollmentId: string) => {
      if (!confirm("¿Quitar a este participante del evento? La persona seguirá en la base de datos pero dejará de estar inscrita en este evento.")) {
        return;
      }
      const result = await deleteEnrollment(enrollmentId);
      if (result.success) router.refresh();
      else alert(result.error);
    },
    [router]
  );

  const handleBlurPerson = useCallback(
    async (
      personId: string,
      field: "first_name" | "last_name" | "email" | "phone",
      value: string
    ) => {
      const result = await updatePersonField(personId, event.id, field, value);
      if (result.success) router.refresh();
      else alert(result.error);
    },
    [router, event.id]
  );

  return (
    <>
    <TransferSpotModal
      enrollmentId={transferModalEnrollmentId}
      eventId={event.id}
      enrollments={enrollments}
      open={transferModalEnrollmentId !== null}
      onOpenChange={(open) => !open && setTransferModalEnrollmentId(null)}
    />
    <div className="w-full max-w-full min-w-0 overflow-hidden rounded-md border">
      <div className="w-full overflow-auto max-h-[calc(100vh-12rem)]">
        <table className="w-full min-w-[1720px] text-xs lg:text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th
                className={cn(
                  HEADER_CELL_STICKY,
                  "min-w-[120px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3"
                )}
              >
                Nombre
              </th>
              <th
                className={cn(
                  HEADER_CELL_STICKY,
                  "min-w-[120px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3"
                )}
              >
                Apellidos
              </th>
              <th
                className={cn(
                  HEADER_CELL_STICKY,
                  "min-w-[180px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3"
                )}
              >
                Correo
              </th>
              <th
                className={cn(
                  HEADER_CELL_STICKY,
                  "min-w-[120px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3"
                )}
              >
                Teléfono
              </th>
              <th
                className={cn(
                  HEADER_CELL_STICKY,
                  "min-w-[100px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3"
                )}
              >
                Ángel
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[140px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Estado
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[100px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Ciudad
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[110px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Envió Detalles
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[100px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Doc Salud
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[90px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Contrato<br />Firmado
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[80px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                CCA
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[90px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Contactado
              </th>
              {event.program_type === "TL" && (
                <>
                  <th className={cn(HEADER_CELL_STICKY, "min-w-[90px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                    Normas TL
                  </th>
                  <th className={cn(HEADER_CELL_STICKY, "min-w-[90px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                    Reglas TL
                  </th>
                </>
              )}
              <th className={cn(HEADER_CELL_STICKY, "min-w-[90px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Confirmó
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[80px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Asistió
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[80px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Retiró
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[80px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Finalizó
              </th>
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <th key={m} className={cn(HEADER_CELL_STICKY, "min-w-[70px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                  {m}
                </th>
              ))}
              <th className={cn(HEADER_CELL_STICKY, "min-w-[70px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Fee<br />Administrativo
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[320px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Observaciones
              </th>
              <th className={cn(HEADER_CELL_STICKY, "min-w-[140px] px-2 py-1.5 text-center align-middle font-medium lg:px-4 lg:py-3")}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {              enrollments.length === 0 ? (
              <tr>
                <td
                  colSpan={event.program_type === "TL" ? 26 : 24}
                  className="px-2 py-4 text-center text-muted-foreground lg:px-4 lg:py-8"
                >
                  Ningún participante coincide con esta vista.
                </td>
              </tr>
            ) : (
              enrollments.map((row) => {
                const effectiveRow = mergeOptimisticRow(row, optimisticOverrides[row.id]);
                return (
                  <EventParticipantRow
                    key={row.id}
                    row={effectiveRow}
                    event={event}
                    eventCity={event.city}
                    enrollments={enrollments}
                    onBooleanChange={handleBooleanChange}
                    onBlurField={handleBlur}
                    onBlurPersonField={handleBlurPerson}
                    onPaymentAmountChange={handlePaymentAmountChange}
                    onPaymentFeeChange={handlePaymentFeeChange}
                    onRemove={handleRemove}
                    onTransfer={row.replaced_by_enrollment_id ? undefined : () => setTransferModalEnrollmentId(row.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function EventParticipantRow({
  row,
  event,
  eventCity,
  enrollments,
  onBooleanChange,
  onBlurField,
  onBlurPersonField,
  onPaymentAmountChange,
  onPaymentFeeChange,
  onRemove,
  onTransfer,
}: {
  row: EnrollmentRow;
  event: EventRow;
  eventCity: string;
  enrollments: EnrollmentRow[];
  onBooleanChange: (
    id: string,
    field: BooleanField,
    valueStr: string
  ) => void;
  onBlurField: (
    id: string,
    field: "admin_notes" | "angel_name" | "city" | "status",
    value: string
  ) => void;
  onBlurPersonField: (
    personId: string,
    field: "first_name" | "last_name" | "email" | "phone",
    value: string
  ) => void;
  onPaymentAmountChange: (id: string, methodUiLabel: string, value: number | null) => void;
  onPaymentFeeChange: (id: string, value: number | null) => void;
  onRemove: (id: string) => void;
  onTransfer?: () => void;
}) {
  const isTransferrer = Boolean(row.replaced_by_enrollment_id);
  const isRecipient = enrollments.some(
    (e) => e.replaced_by_enrollment_id === row.id
  );
  const transferrer = enrollments.find((e) => e.replaced_by_enrollment_id === row.id);
  const transferFeeDisplay =
    transferrer && transferrer.cantidad != null
      ? Math.round(Number(transferrer.cantidad) * 0.1)
      : null;
  const feeDisplayValue =
    row.payment_fee ?? (isRecipient ? transferFeeDisplay : null);

  const showRed = isTransferrer && row.status === "transferred_out";
  const showBlue = isRecipient && row.status === "cupo_recibido";

  const firstFourCellBg = showRed
    ? "bg-red-100 dark:bg-red-950/95"
    : showBlue
      ? "bg-blue-100 dark:bg-blue-950/95"
      : undefined;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td
        className={cn(
          "px-2 py-1 align-middle text-center lg:px-4 lg:py-2",
          firstFourCellBg
        )}
      >
        <div className="flex justify-center">
          <EditableCell
            value={row.person?.first_name ?? ""}
            onBlur={(v) => onBlurPersonField(row.person_id, "first_name", v)}
            placeholder="Nombre"
          />
        </div>
      </td>
      <td
        className={cn(
          "px-2 py-1 align-middle text-center lg:px-4 lg:py-2",
          firstFourCellBg
        )}
      >
        <div className="flex justify-center">
          <EditableCell
            value={row.person?.last_name ?? ""}
            onBlur={(v) => onBlurPersonField(row.person_id, "last_name", v)}
            placeholder="Apellidos"
          />
        </div>
      </td>
      <td
        className={cn(
          "px-2 py-1 align-middle text-center lg:px-4 lg:py-2",
          firstFourCellBg
        )}
      >
        <div className="flex justify-center">
          <EditableCell
            value={row.person?.email ?? ""}
            onBlur={(v) => onBlurPersonField(row.person_id, "email", v)}
            placeholder="Correo"
          />
        </div>
      </td>
      <td
        className={cn(
          "px-2 py-1 align-middle text-center lg:px-4 lg:py-2",
          firstFourCellBg
        )}
      >
        <div className="flex justify-center">
          <EditableCell
            value={row.person?.phone ?? ""}
            onBlur={(v) => onBlurPersonField(row.person_id, "phone", v)}
            placeholder="Teléfono"
          />
        </div>
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <div className="flex justify-center">
          <EditableCell
            value={row.angel_name ?? ""}
            onBlur={(v) => onBlurField(row.id, "angel_name", v)}
            placeholder="Ángel"
          />
        </div>
      </td>
      <td className="px-2 py-1 align-top text-center lg:px-4 lg:py-2">
        <EstadoCell
          row={row}
          onBlurField={onBlurField}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <CiudadSelectCell
          value={row.city}
          eventCity={eventCity}
          onChange={(v) => onBlurField(row.id, "city", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.details_sent}
          onChange={(v) => onBooleanChange(row.id, "details_sent", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.health_doc_signed ?? false}
          onChange={(v) => onBooleanChange(row.id, "health_doc_signed", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.contract_signed}
          onChange={(v) => onBooleanChange(row.id, "contract_signed", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.cca_signed ?? false}
          onChange={(v) => onBooleanChange(row.id, "cca_signed", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.contacted ?? false}
          onChange={(v) => onBooleanChange(row.id, "contacted", v)}
        />
      </td>
      {event.program_type === "TL" && (
        <>
          <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
            <BooleanCheckboxCell
              value={row.tl_norms_signed ?? false}
              onChange={(v) => onBooleanChange(row.id, "tl_norms_signed", v)}
            />
          </td>
          <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
            <BooleanCheckboxCell
              value={row.tl_rules_signed ?? false}
              onChange={(v) => onBooleanChange(row.id, "tl_rules_signed", v)}
            />
          </td>
        </>
      )}
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.confirmed}
          onChange={(v) => onBooleanChange(row.id, "confirmed", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.attended}
          onChange={(v) => onBooleanChange(row.id, "attended", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.withdrew}
          onChange={(v) => onBooleanChange(row.id, "withdrew", v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <BooleanCheckboxCell
          value={row.finalized}
          onChange={(v) => onBooleanChange(row.id, "finalized", v)}
        />
      </td>
      {PAYMENT_METHOD_OPTIONS.map((methodUi) => (
        <td key={methodUi} className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
          <PaymentAmountCell
            value={row.payments_by_method?.[methodUi.toLowerCase()] ?? null}
            onChange={(v) => onPaymentAmountChange(row.id, methodUi, v)}
          />
        </td>
      ))}
      <td className="px-2 py-1 align-middle text-center lg:px-4 lg:py-2">
        <FeeInputCell
          value={feeDisplayValue}
          methodUi=""
          onChange={(fee) => onPaymentFeeChange(row.id, fee)}
        />
      </td>
      <td className="min-w-[320px] px-2 py-1 align-top text-center lg:px-4 lg:py-2">
        <EditableCell
          value={row.admin_notes ?? ""}
          onBlur={(v) => onBlurField(row.id, "admin_notes", v)}
          placeholder="Notas"
        />
      </td>
      <td className="px-2 py-1 align-middle lg:px-4 lg:py-2">
        <div className="flex justify-center">
          <div className="grid grid-cols-[1fr_auto] gap-1 items-center min-w-[160px] lg:gap-1.5 lg:min-w-[180px]">
            <div className="flex justify-end min-h-7 lg:min-h-8">
              {onTransfer ? (
                <Button type="button" variant="outline" size="sm" className="text-xs lg:text-sm" onClick={onTransfer}>
                  Transferir cupo
                </Button>
              ) : (
                <span className="inline-block w-[100px]" aria-hidden />
              )}
            </div>
            <div className="flex justify-start min-h-7 lg:min-h-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive lg:text-sm"
                onClick={() => onRemove(row.id)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function BooleanCheckboxCell({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (valueStr: string) => void;
}) {
  return (
    <div className="flex justify-center">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked ? "TRUE" : "FALSE")}
        className="h-3.5 w-3.5 shrink-0 rounded border border-gray-400 bg-background accent-gray-600 focus:ring-2 focus:ring-gray-400 focus:ring-offset-0 lg:h-4 lg:w-4"
        aria-label={value ? "Sí" : "No"}
      />
    </div>
  );
}

const PENDING_CONTRACT_TAG = "PENDING_CONTRACT";

function EstadoCell({
  row,
  onBlurField,
}: {
  row: EnrollmentRow;
  onBlurField: (id: string, field: "status", value: string) => void;
}) {
  if (row.status === "transferred_out") {
    return (
      <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
        Cupo transferido
      </span>
    );
  }
  if (row.status === "cupo_recibido") {
    return (
      <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
        Cupo recibido
      </span>
    );
  }
  return (
    <EstadoMultiSelectCell
      value={row.status}
      onChange={(v) => onBlurField(row.id, "status", v)}
    />
  );
}

function EstadoMultiSelectCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value
    ? value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((t) => t && t !== PENDING_CONTRACT_TAG)
    : [];
  const toggle = (tag: string) => {
    const set = new Set(selected);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    const next = Array.from(set).sort().join(",");
    onChange(next || "");
  };

  const displayLabel =
    selected.length > 0
      ? selected.length === 1
        ? selected[0]
        : `${selected[0]} +${selected.length - 1}`
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 min-w-[90px] justify-center gap-1 px-2 text-center font-normal lg:h-8 lg:min-w-[100px]"
        >
          {displayLabel ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {displayLabel}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="flex flex-col gap-1">
          {ESTADO_OPTIONS.map((tag) => (
            <label
              key={tag}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selected.includes(tag)}
                onChange={() => toggle(tag)}
                className="h-4 w-4"
              />
              <span className="text-sm">{tag}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CiudadSelectCell({
  value,
  eventCity,
  onChange,
}: {
  value: string | null;
  eventCity: string;
  onChange: (value: string) => void;
}) {
  const displayValue = value?.trim() || eventCity?.trim() || "";
  const selectValue =
    value && CIUDAD_OPTIONS.includes(value as (typeof CIUDAD_OPTIONS)[number])
      ? value
      : "";

  return (
    <select
      className="h-7 min-w-[80px] rounded border border-input bg-background px-2 py-1 text-center text-sm lg:h-8 lg:min-w-[90px]"
      value={selectValue}
      onChange={(e) => onChange(e.target.value || "")}
    >
      <option value="">{displayValue || "—"}</option>
      {CIUDAD_OPTIONS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function PaymentAmountCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  const handleBlur = () => {
    const trimmed = local.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isNaN(n)) onChange(n);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      className="h-7 w-12 px-2 py-1 text-center text-sm lg:h-8 lg:w-14"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      placeholder="—"
    />
  );
}

function FeeInputCell({
  value,
  methodUi,
  onChange,
}: {
  value: number | null;
  methodUi: string;
  onChange: (fee: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  const handleBlur = () => {
    const trimmed = local.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isNaN(n)) onChange(n);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-7 w-14 px-2 py-1 text-center text-sm lg:h-8 lg:w-16"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      placeholder="—"
    />
  );
}

