/** @deprecated Use city options from catalog (listCities) instead. Kept for backward compatibility. */
export const CIUDAD_OPTIONS = ["Miami", "Atlanta"] as const;
export const PAYMENT_METHODS_DB = ["square", "afterpay", "zelle", "cash", "tdc"] as const;

/** Inscription validity in days from first appearance (person created_at). */
export const INSCRIPTION_VALID_DAYS = 100;

/** Order for grouping enrollments by program type on person detail. */
export const PROGRAM_ORDER = ["PT", "LT", "TL"] as const;
