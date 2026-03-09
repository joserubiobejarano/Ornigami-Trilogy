export type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string;
  city: string | null;
  created_at?: string | null;
};

export type PaymentRow = {
  id: string;
  enrollment_id: string;
  method: string | null;
  fee_amount: number | null;
  promo_note: string | null;
  payer_name: string | null;
  created_at: string;
};

export type EventSummary = {
  id: string;
  program_type: string;
  code: string;
  city: string;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
};

export type EnrollmentWithEventAndPayments = {
  id: string;
  event_id: string;
  person_id: string;
  status: string;
  attended: boolean;
  details_sent: boolean;
  confirmed: boolean;
  contract_signed: boolean;
  cca_signed: boolean;
  withdrew: boolean;
  finalized: boolean;
  admin_notes: string | null;
  angel_name: string | null;
  health_doc_signed: boolean | null;
  tl_norms_signed: boolean | null;
  tl_rules_signed: boolean | null;
  created_at?: string;
  event: EventSummary;
  payments: PaymentRow[];
};

export type PersonWithEnrollments = PersonRow & {
  enrollments: EnrollmentWithEventAndPayments[];
};
