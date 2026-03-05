import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

const SHEET_NAMES = ["PT", "LT", "TL"] as const;

const PLACEHOLDER_EMAIL_DOMAIN = "@placeholder.local";

/** Normalize header: trim, lowercase, collapse spaces, strip accents */
function normalizeHeader(s: string): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Truthy values for boolean columns */
const BOOLEAN_TRUE = new Set([
  "x",
  "1",
  "si",
  "sí",
  "s",
  "yes",
  "true",
  "verdadero",
  "v",
  "y",
]);

function toBool(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s !== "" && BOOLEAN_TRUE.has(s);
}

function toStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Allowed values for payments.method (lowercase). */
const ALLOWED_PAYMENT_METHODS = new Set<string>([
  "square",
  "afterpay",
  "zelle",
  "cash",
  "tdc",
]);

/** Map: normalized header -> { type, field }. Payment method columns use type 'payment_method'. */
const HEADER_MAP: Record<
  string,
  { type: "person"; field: string } | { type: "enrollment"; field: string } | { type: "payment_amount"; field: "fee" } | { type: "payment_method"; method: string }
> = {
  [normalizeHeader("Observaciones")]: { type: "enrollment", field: "admin_notes" },
  [normalizeHeader("Asistio")]: { type: "enrollment", field: "attended" },
  [normalizeHeader("Asistió")]: { type: "enrollment", field: "attended" },
  [normalizeHeader("envio detalles")]: { type: "enrollment", field: "details_sent" },
  [normalizeHeader("Confirm")]: { type: "enrollment", field: "confirmed" },
  [normalizeHeader("Contrato")]: { type: "enrollment", field: "contract_signed" },
  [normalizeHeader("CCA")]: { type: "enrollment", field: "cca_signed" },
  [normalizeHeader("Doc Salud")]: { type: "enrollment", field: "health_doc_signed" },
  [normalizeHeader("Normas TL")]: { type: "enrollment", field: "tl_norms_signed" },
  [normalizeHeader("Reglas TL")]: { type: "enrollment", field: "tl_rules_signed" },
  [normalizeHeader("Retiró")]: { type: "enrollment", field: "withdrew" },
  [normalizeHeader("No Asistió")]: { type: "enrollment", field: "no_asistio" },
  [normalizeHeader("No Asistio")]: { type: "enrollment", field: "no_asistio" },
  [normalizeHeader("TL enrolado")]: { type: "enrollment", field: "tl_enrolado" },
  [normalizeHeader("Nombre")]: { type: "person", field: "first_name" },
  [normalizeHeader("Apellido")]: { type: "person", field: "last_name" },
  [normalizeHeader("Telefono")]: { type: "person", field: "phone" },
  [normalizeHeader("Teléfono")]: { type: "person", field: "phone" },
  [normalizeHeader("correo")]: { type: "person", field: "email" },
  [normalizeHeader("Angel")]: { type: "enrollment", field: "angel_name" },
  [normalizeHeader("Square")]: { type: "payment_method", method: "square" },
  [normalizeHeader("Afterpay")]: { type: "payment_method", method: "afterpay" },
  [normalizeHeader("Fee")]: { type: "payment_amount", field: "fee" },
  [normalizeHeader("Zelle")]: { type: "payment_method", method: "zelle" },
  [normalizeHeader("Cash")]: { type: "payment_method", method: "cash" },
  [normalizeHeader("TDC")]: { type: "payment_method", method: "tdc" },
};

export type ImportEventDefaults = {
  city: string;
  start_date: string; // ISO
  end_date: string;   // ISO
};

export type ImportResult = {
  peopleCreated: number;
  peopleUpdated: number;
  eventsCreated: number;
  enrollmentsCreated: number;
  enrollmentsUpdated: number;
  paymentsCreated: number;
  errors: Array<{ sheet: string; row: number; message: string }>;
};

type ColumnMap = {
  person: Record<string, number>;
  enrollment: Record<string, number>;
  paymentAmount: number | null;
  paymentMethods: Array<{ method: string; colIndex: number }>;
};

function buildColumnMap(headerRow: unknown[]): ColumnMap {
  const person: Record<string, number> = {};
  const enrollment: Record<string, number> = {};
  let paymentAmount: number | null = null;
  const paymentMethods: Array<{ method: string; colIndex: number }> = [];

  headerRow.forEach((cell, i) => {
    const norm = normalizeHeader(String(cell ?? ""));
    const mapped = HEADER_MAP[norm];
    if (!mapped) return;
    if (mapped.type === "person") person[mapped.field] = i;
    else if (mapped.type === "enrollment") enrollment[mapped.field] = i;
    else if (mapped.type === "payment_amount") paymentAmount = i;
    else if (mapped.type === "payment_method") paymentMethods.push({ method: mapped.method, colIndex: i });
  });

  return { person, enrollment, paymentAmount, paymentMethods };
}

function getCell(row: unknown[], index: number | undefined): unknown {
  if (index === undefined) return undefined;
  return row[index];
}

function placeholderEmail(phone: string): string {
  const normalized = phone.replace(/\D/g, "").slice(-10) || "unknown";
  return `import-${normalized}${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export type RunImportOptions = {
  supabase: SupabaseClient;
  eventDefaults: ImportEventDefaults;
};

export async function runImport(
  buffer: Buffer,
  options: RunImportOptions
): Promise<ImportResult> {
  const { supabase, eventDefaults } = options;
  const result: ImportResult = {
    peopleCreated: 0,
    peopleUpdated: 0,
    eventsCreated: 0,
    enrollmentsCreated: 0,
    enrollmentsUpdated: 0,
    paymentsCreated: 0,
    errors: [],
  };

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetsToProcess = workbook.SheetNames.filter((name) =>
    SHEET_NAMES.includes(name as (typeof SHEET_NAMES)[number])
  );

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    if (rows.length < 2) continue;

    const headerRow = rows[0];
    const columnMap = buildColumnMap(headerRow);
    const dataRows = rows.slice(1);

    const programType = sheetName;
    const code = sheetName;

    let eventId: string;
    const { data: existingEvent } = await supabase
      .from("events")
      .select("id")
      .eq("program_type", programType)
      .eq("code", code)
      .maybeSingle();

    if (existingEvent?.id) {
      eventId = existingEvent.id;
    } else {
      const { data: newEvent, error: eventError } = await supabase
        .from("events")
        .insert({
          program_type: programType,
          code,
          city: eventDefaults.city,
          start_date: eventDefaults.start_date,
          end_date: eventDefaults.end_date,
          active: false,
        })
        .select("id")
        .single();
      if (eventError || !newEvent?.id) {
        result.errors.push({
          sheet: sheetName,
          row: 0,
          message: `Failed to create event: ${eventError?.message ?? "unknown"}`,
        });
        continue;
      }
      eventId = newEvent.id;
      result.eventsCreated += 1;
    }

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const rowNum = r + 2;
      const emailRaw = toStr(getCell(row, columnMap.person["email"]));
      const phoneRaw = toStr(getCell(row, columnMap.person["phone"]));
      const email = emailRaw ? emailRaw.toLowerCase().trim() : "";
      const phone = phoneRaw || "";

      if (!email && !phone) {
        result.errors.push({
          sheet: sheetName,
          row: rowNum,
          message: "Row skipped: no email or phone",
        });
        continue;
      }

      const personEmail = email || placeholderEmail(phone);
      const first_name = toStr(getCell(row, columnMap.person["first_name"])) || null;
      const last_name = toStr(getCell(row, columnMap.person["last_name"])) || null;
      const phoneValue = phone || null;

      let personId: string;
      const { data: existingPerson } = await supabase
        .from("people")
        .select("id")
        .ilike("email", personEmail)
        .maybeSingle();

      if (existingPerson?.id) {
        personId = existingPerson.id;
        await supabase
          .from("people")
          .update({
            first_name: first_name ?? undefined,
            last_name: last_name ?? undefined,
            phone: phoneValue ?? undefined,
          })
          .eq("id", personId);
        result.peopleUpdated += 1;
      } else {
        const { data: inserted, error: insertPersonError } = await supabase
          .from("people")
          .insert({
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            phone: phoneValue,
            email: personEmail,
          })
          .select("id")
          .single();
        if (insertPersonError || !inserted?.id) {
          result.errors.push({
            sheet: sheetName,
            row: rowNum,
            message: `Failed to create person: ${insertPersonError?.message ?? "unknown"}`,
          });
          continue;
        }
        personId = inserted.id;
        result.peopleCreated += 1;
      }

      const enrollmentPayload = {
        attended: toBool(getCell(row, columnMap.enrollment["attended"])),
        details_sent: toBool(getCell(row, columnMap.enrollment["details_sent"])),
        confirmed: toBool(getCell(row, columnMap.enrollment["confirmed"])),
        contract_signed: toBool(getCell(row, columnMap.enrollment["contract_signed"])),
        cca_signed: toBool(getCell(row, columnMap.enrollment["cca_signed"])),
        health_doc_signed: toBool(getCell(row, columnMap.enrollment["health_doc_signed"])),
        tl_norms_signed: toBool(getCell(row, columnMap.enrollment["tl_norms_signed"])),
        tl_rules_signed: toBool(getCell(row, columnMap.enrollment["tl_rules_signed"])),
        withdrew: toBool(getCell(row, columnMap.enrollment["withdrew"])),
        no_asistio: toBool(getCell(row, columnMap.enrollment["no_asistio"])),
        admin_notes: toStr(getCell(row, columnMap.enrollment["admin_notes"])) || null,
        angel_name: toStr(getCell(row, columnMap.enrollment["angel_name"])) || null,
        tl_enrolado: toStr(getCell(row, columnMap.enrollment["tl_enrolado"])) || null,
      };

      const feeAmount = columnMap.paymentAmount != null
        ? toNum(getCell(row, columnMap.paymentAmount))
        : null;

      const { data: existingEnrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("event_id", eventId)
        .eq("person_id", personId)
        .maybeSingle();

      let enrollmentId: string;
      if (existingEnrollment?.id) {
        enrollmentId = existingEnrollment.id;
        await supabase
          .from("enrollments")
          .update({
            ...enrollmentPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", enrollmentId);
        result.enrollmentsUpdated += 1;
      } else {
        const { data: insertedEnroll, error: enrollError } = await supabase
          .from("enrollments")
          .insert({
            event_id: eventId,
            person_id: personId,
            status: "pending_contract",
            ...enrollmentPayload,
          })
          .select("id")
          .single();
        if (enrollError || !insertedEnroll?.id) {
          result.errors.push({
            sheet: sheetName,
            row: rowNum,
            message: `Failed to create enrollment: ${enrollError?.message ?? "unknown"}`,
          });
          continue;
        }
        enrollmentId = insertedEnroll.id;
        result.enrollmentsCreated += 1;
      }

      for (const { method, colIndex } of columnMap.paymentMethods) {
        if (!ALLOWED_PAYMENT_METHODS.has(method)) continue;
        const value = getCell(row, colIndex);
        if (!toBool(value)) continue;

        const { data: existingPayment } = await supabase
          .from("payments")
          .select("id")
          .eq("enrollment_id", enrollmentId)
          .eq("method", method)
          .maybeSingle();
        if (existingPayment?.id) continue;

        const { error: paymentError } = await supabase.from("payments").insert({
          enrollment_id: enrollmentId,
          method,
          fee_amount: feeAmount,
        });
        if (!paymentError) result.paymentsCreated += 1;
      }
    }
  }

  return result;
}
