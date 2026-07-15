// Device-local date as YYYY-MM-DD. Built from local components (NOT
// toISOString, which is UTC and rolls to tomorrow during US evenings).
export function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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
