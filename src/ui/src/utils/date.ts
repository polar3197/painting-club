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

/** Device-local date as YYYY-MM-DD (not toISOString, which is UTC and rolls
 *  to tomorrow during US evenings). */
export function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const SHORT_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const LONG_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "19:00[:00]" -> "7:00pm" */
export function formatEventTime(timeISO: string): string {
  const [hStr, mStr] = timeISO.split(":");
  let h = Number(hStr);
  const min = mStr ?? "00";
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min}${ampm}`;
}

/** "jul 20 · 7:00pm" from an event's date + optional time. Parses the parts
 *  directly so there's no timezone shift. Year shown only when not current. */
export function formatEventWhen(dateISO: string, timeISO: string | null): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  let out = m >= 1 && m <= 12 && d ? `${SHORT_MONTHS[m - 1]} ${d}` : dateISO;
  if (y && y !== new Date().getFullYear() && out !== dateISO) out += `, ${y}`;
  if (timeISO) out += ` · ${formatEventTime(timeISO)}`;
  return out;
}
