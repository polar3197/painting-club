// Device-local date as YYYY-MM-DD. Built from local components (NOT
// toISOString, which is UTC and rolls to tomorrow during US evenings).
export function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Device-local tomorrow as YYYY-MM-DD. Adding a day via setDate handles
// month/year rollover and DST for us.
export function tomorrowLocalISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Server timestamps are naive UTC (no zone suffix) — tag them as UTC so
// new Date() doesn't misread them as local time. (ConversationThread has its own
// copy of this; worth collapsing into this one when that file is next touched.)
export function parseUtc(s: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Lowercase "jul 20 · 7:00pm" from an event's date (YYYY-MM-DD) + optional time
// (HH:MM[:SS]). Parses the parts directly so there's no timezone shift.
export function formatEventWhen(dateISO: string, timeISO: string | null): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  let out = '';
  if (m >= 1 && m <= 12 && d) {
    out = `${MONTHS[m - 1]} ${d}`;
    // Only show the year when it isn't the current one.
    const nowY = new Date().getFullYear();
    if (y && y !== nowY) out += `, ${y}`;
  } else {
    out = dateISO;
  }
  if (timeISO) out += ` · ${formatEventTime(timeISO)}`;
  return out;
}

// "19:00[:00]" -> "7:00pm".
export function formatEventTime(timeISO: string): string {
  const [hStr, mStr] = timeISO.split(':');
  let h = Number(hStr);
  const min = mStr ?? '00';
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min}${ampm}`;
}
