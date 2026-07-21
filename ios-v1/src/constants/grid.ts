// Grid display mode for the search tab: gallery is the dense multi-column
// grid, feed is one full-width piece per row with caption + comments.
export type GridMode = 'gallery' | 'feed';

// Cards per row grow ~square with the result count, capped at 4 — a big
// gallery stays 4-up, and a narrowed search slims to fewer, larger cards.
export function columnsFor(n: number): number {
  return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n)))));
}
