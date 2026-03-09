export type EventRow = {
  id: string;
  program_type: string;
  code: string;
  city: string;
  coordinator?: string | null;
  entrenadores?: string | null;
  capitan_mentores?: string | null;
  mentores?: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at?: string;
  scheduled_deletion_at?: string | null;
};

export type ViewFilter =
  | "backlog"
  | "confirmed"
  | "attended"
  | "finalized"
  | null;

export type EnrollmentRow = {
  id: string;
  event_id: string;
  person_id: string;
  status: string;
  attended: boolean;
  details_sent: boolean;
  confirmed: boolean;
  contract_signed: boolean;
  cca_signed: boolean;
  contacted: boolean;
  admin_notes: string | null;
  angel_name: string | null;
  city: string | null;
  health_doc_signed: boolean | null;
  tl_norms_signed: boolean | null;
  tl_rules_signed: boolean | null;
  finalized: boolean;
  withdrew: boolean;
  no_asistio: boolean;
  tl_enrolado: string | null;
  created_at?: string;
  person: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string;
    created_at?: string | null;
  };
  /** @deprecated Use payments_by_method and payment_fee for spreadsheet UI */
  last_payment: { id: string; method: string | null; fee_amount: number | null } | null;
  /** Amount paid per method (method key in DB form: square, afterpay, zelle, cash, tdc) */
  payments_by_method: Record<string, number | null>;
  /** Single fee for this enrollment (from payment row with method=null or first row) */
  payment_fee: number | null;
  cantidad: number | null;
  replaced_by_enrollment_id: string | null;
};

export type EventWithEnrollments = EventRow & {
  enrollments: EnrollmentRow[];
};
