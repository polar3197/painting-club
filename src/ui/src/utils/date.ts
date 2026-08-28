// Server timestamps are naive UTC — tag them so `new Date()` reads them right.
export function parseUtc(s: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z");
}

/** "aug 3, 4:15 pm" this year; "aug 3, 2025" otherwise. */
export function formatWhen(s: string): string {
  const d = parseUtc(s);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleString([], opts).toLowerCase();
}
