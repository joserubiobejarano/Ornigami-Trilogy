import type { EventRow, EnrollmentRow } from "@/app/app/events/types";
import { programTypeToDisplay } from "@/lib/program-display";

const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: "square", label: "Square" },
  { key: "afterpay", label: "Afterpay" },
  { key: "zelle", label: "Zelle" },
  { key: "cash", label: "Cash" },
  { key: "tdc", label: "TDC" },
];

/** Enrollment is counted in payment sums only if not BGK (all other participants included). */
function eligibleForPayment(e: EnrollmentRow): boolean {
  return !hasBGKStatus(e.status);
}

export type ReportContent = {
  title: string;
  startDate: string;
  endDate: string;
  coordinator: string;
  entrenadores: string;
  mentores: string;
  capitanMentores: string;
  participantesInscritos: number;
  participantesIniciaron: number;
  participantesNoAsistieron: number;
  participantesRetiraron: number;
  participantesCulminaron: number;
  cuposTransferidos: number;
  cuposRecibidos: number;
  backlogs: number;
  entroladosProposito: number;
  entroladosConexion: number;
  /** Payment sums by method (eligible: non-BGK only). */
  paymentLines: { method: string; count: number; sum: number }[];
  feeAdministrativoSum: number;
  feeAdministrativoCount: number;
  pagosAsistieronSum: number;
  total: number;
  notes: string;
  /** Sum by method for participants with tl_enrolado === "Proposito". */
  propositoByMethod: { method: string; sum: number }[];
  totalProposito: number;
  /** Sum by method for participants with tl_enrolado === "Conexión". */
  conexionByMethod: { method: string; sum: number }[];
  totalConexion: number;
};

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function hasBGKStatus(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  const tags = status.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return tags.includes("BGK");
}

/** Sum of all payment methods + fee for one enrollment. */
function enrollmentTotalPayment(e: EnrollmentRow): number {
  let sum = 0;
  const methods = e.payments_by_method ?? {};
  for (const key of Object.keys(methods)) {
    const amount = methods[key];
    if (amount != null && Number(amount) > 0) sum += Number(amount);
  }
  const fee = e.payment_fee;
  if (fee != null && Number(fee) > 0) sum += Number(fee);
  return sum;
}

export function buildReportContent(
  event: EventRow,
  enrollments: EnrollmentRow[],
  notes: string
): ReportContent {
  const title = `${programTypeToDisplay(event.program_type)} ${event.code}`;
  const participantesInscritos = enrollments.length;
  const attendedCount = enrollments.filter((e) => e.attended).length;
  const finalizedCount = enrollments.filter((e) => e.finalized).length;
  const participantesNoAsistieron = enrollments.filter((e) => e.no_asistio).length;
  const participantesRetiraron = enrollments.filter((e) => e.withdrew).length;
  const cuposTransferidos = enrollments.filter((e) => e.replaced_by_enrollment_id != null).length;
  const recipientIds = new Set(enrollments.filter((e) => e.replaced_by_enrollment_id != null).map((e) => e.replaced_by_enrollment_id!));
  const cuposRecibidos = enrollments.filter((e) => recipientIds.has(e.id)).length;
  const backlogs = enrollments.filter((e) => hasBGKStatus(e.status)).length;
  const entroladosProposito = enrollments.filter((e) => e.tl_enrolado === "Proposito").length;
  const entroladosConexion = enrollments.filter((e) => e.tl_enrolado === "Conexión").length;

  const eligible = enrollments.filter(eligibleForPayment);
  const paymentLines: { method: string; count: number; sum: number }[] = [];
  let total = 0;

  for (const { key, label } of PAYMENT_METHODS) {
    let count = 0;
    let sum = 0;
    for (const e of eligible) {
      const amount = e.payments_by_method?.[key];
      if (amount != null && Number(amount) > 0) {
        count += 1;
        sum += Number(amount);
      }
    }
    total += sum;
    paymentLines.push({ method: label, count, sum });
  }

  let feeAdministrativoSum = 0;
  let feeAdministrativoCount = 0;
  for (const e of eligible) {
    const fee = e.payment_fee;
    if (fee != null && Number(fee) > 0) {
      feeAdministrativoSum += Number(fee);
      feeAdministrativoCount += 1;
    }
  }
  total += feeAdministrativoSum;

  let pagosAsistieronSum = 0;
  for (const e of eligible) {
    pagosAsistieronSum += enrollmentTotalPayment(e);
  }

  const propositoByMethod: { method: string; sum: number }[] = [];
  const conexionByMethod: { method: string; sum: number }[] = [];
  let totalProposito = 0;
  let totalConexion = 0;
  for (const { key, label } of PAYMENT_METHODS) {
    let propSum = 0;
    let connSum = 0;
    for (const e of enrollments) {
      const amount = e.payments_by_method?.[key];
      const num = amount != null ? Number(amount) : 0;
      if (num <= 0) continue;
      if (e.tl_enrolado === "Proposito") propSum += num;
      if (e.tl_enrolado === "Conexión") connSum += num;
    }
    propositoByMethod.push({ method: label, sum: propSum });
    conexionByMethod.push({ method: label, sum: connSum });
    totalProposito += propSum;
    totalConexion += connSum;
  }

  return {
    title,
    startDate: formatEventDate(event.start_date),
    endDate: formatEventDate(event.end_date),
    coordinator: event.coordinator?.trim() ?? "—",
    entrenadores: event.entrenadores?.trim() ?? "—",
    mentores: event.mentores?.trim() ?? "—",
    capitanMentores: event.capitan_mentores?.trim() ?? "—",
    participantesInscritos,
    participantesIniciaron: attendedCount,
    participantesNoAsistieron,
    participantesRetiraron,
    participantesCulminaron: finalizedCount,
    cuposTransferidos,
    cuposRecibidos,
    backlogs,
    entroladosProposito,
    entroladosConexion,
    paymentLines,
    feeAdministrativoSum,
    feeAdministrativoCount,
    pagosAsistieronSum,
    total,
    notes: notes?.trim() ?? "",
    propositoByMethod,
    totalProposito,
    conexionByMethod,
    totalConexion,
  };
}

/** Plain text version of the report for download. */
export function formatReportAsText(content: ReportContent): string {
  const lines: string[] = [
    `Informe Cierre de ${content.title}`,
    "",
    "Fechas",
    `Empezó: ${content.startDate}`,
    `Finalizó: ${content.endDate}`,
    "",
    "Responsables",
    `Coordinador: ${content.coordinator}`,
    `Entrenadores: ${content.entrenadores}`,
    `Mentores: ${content.mentores}`,
    `Capitán mentores: ${content.capitanMentores}`,
    "",
    "Participantes",
    `Participantes inscritos: ${content.participantesInscritos}`,
    `Participantes que iniciaron: ${content.participantesIniciaron}`,
    `Participantes que no asistieron: ${content.participantesNoAsistieron}`,
    `Participantes que se retiraron: ${content.participantesRetiraron}`,
    `Participantes que culminaron: ${content.participantesCulminaron}`,
    `Cupos transferidos: ${content.cuposTransferidos}`,
    `Cupos recibidos: ${content.cuposRecibidos}`,
    `Backlogs: ${content.backlogs}`,
    `Entrolados Proposito: ${content.entroladosProposito}`,
  ];
  for (const { method, sum } of content.propositoByMethod.filter((m) => m.sum > 0)) {
    lines.push(`Proposito ${method}: ${formatCurrency(sum)}`);
  }
  if (content.totalProposito > 0) {
    lines.push(`Total Proposito: ${formatCurrency(content.totalProposito)}`);
  }
  const hasConexion = content.entroladosConexion > 0 || content.totalConexion > 0 || content.conexionByMethod.some((m) => m.sum > 0);
  if (hasConexion) {
    lines.push(`Entrolados Conexión: ${content.entroladosConexion}`);
    for (const { method, sum } of content.conexionByMethod.filter((m) => m.sum > 0)) {
      lines.push(`Conexión ${method}: ${formatCurrency(sum)}`);
    }
    if (content.totalConexion > 0) {
      lines.push(`Total Conexión: ${formatCurrency(content.totalConexion)}`);
    }
  }
  lines.push("");
  lines.push("Pagos");

  for (const { method, count, sum } of content.paymentLines) {
    if (count > 0 || sum > 0) {
      lines.push(
        `Pagos ${method}: ${count} participantes - ${formatCurrency(sum)}`
      );
    }
  }

  if (content.feeAdministrativoCount > 0 || content.feeAdministrativoSum > 0) {
    lines.push(
      `Fee Administrativo: ${content.feeAdministrativoCount} participantes - ${formatCurrency(content.feeAdministrativoSum)}`
    );
  }
  lines.push(`Pagos de Asistieron: ${formatCurrency(content.pagosAsistieronSum)}`);
  lines.push(`Total = ${formatCurrency(content.total)}`);
  lines.push("");
  lines.push("Notas");
  lines.push(content.notes || "(Sin notas)");

  return lines.join("\n");
}
