export type AuditChange = {
  field: string;
  old_value: unknown;
  new_value: unknown;
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  attended: "Asistió",
  details_sent: "Envió detalles",
  contract_signed: "Contrato",
  cca_signed: "CCA",
  health_doc_signed: "Doc. Salud",
  tl_norms_signed: "Normas TL",
  tl_rules_signed: "Reglas TL",
  withdrew: "Retiró",
  no_asistio: "No Asistió",
  tl_enrolado: "TL enrolado",
  status: "Estado",
  admin_notes: "Observaciones",
  angel_name: "Ángel",
  city: "Ciudad",
  cantidad: "Cantidad",
  method: "Forma de pago",
  fee_amount: "Fee",
  first_name: "Nombre",
  last_name: "Apellido",
  email: "Correo",
  phone: "Teléfono",
};

export function getAuditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABELS[field] ?? field;
}

export function formatAuditChange(change: AuditChange): string {
  const label = getAuditFieldLabel(change.field);
  const oldStr = change.old_value === null || change.old_value === undefined ? "—" : String(change.old_value);
  const newStr = change.new_value === null || change.new_value === undefined ? "—" : String(change.new_value);
  if (change.old_value === true || change.old_value === false) {
    const oldVal = change.old_value ? "sí" : "no";
    const newVal = change.new_value ? "sí" : "no";
    return `${label}: ${oldVal} → ${newVal}`;
  }
  return `${label}: ${oldStr} → ${newStr}`;
}
