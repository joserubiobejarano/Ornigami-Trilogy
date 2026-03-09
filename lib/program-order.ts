/**
 * Canonical display order for program types: PT, LT, TL, OTRO, then any other code alphabetically.
 * Used for Administration (Entrenamientos), new/edit/duplicate event selectors, and event filters.
 */
const CANONICAL_ORDER = ["PT", "LT", "TL", "OTRO"] as const;

const ORDER_MAP: Record<string, number> = Object.fromEntries(
  CANONICAL_ORDER.map((code, i) => [code, i])
);

/** Rank for sorting; unknown codes get 99 so they sort after canonical ones. */
export function programOrderRank(code: string): number {
  const upper = String(code ?? "").trim().toUpperCase();
  if (upper in ORDER_MAP) return ORDER_MAP[upper];
  return 99;
}

/** Compare two program codes for sort: PT < LT < TL < OTRO < others (alphabetical). */
export function compareProgramCodes(a: string, b: string): number {
  const ra = programOrderRank(a);
  const rb = programOrderRank(b);
  if (ra !== rb) return ra - rb;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

/** Sort an array of items by program code (by a `code` or `program_type` field). */
export function sortByProgramOrder<T>(
  items: T[],
  getCode: (item: T) => string
): T[] {
  return [...items].sort((x, y) => compareProgramCodes(getCode(x), getCode(y)));
}
