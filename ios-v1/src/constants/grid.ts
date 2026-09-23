// Cards per row grow ~square with the result count, capped at 4 — a big
// gallery stays 4-up, and a narrowed search slims to fewer, larger cards
// (a single result renders as the full-width feed card).
export function columnsFor(n: number): number {
  return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n)))));
}
