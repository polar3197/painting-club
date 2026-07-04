// Device-local date as YYYY-MM-DD. Built from local components (NOT
// toISOString, which is UTC and rolls to tomorrow during US evenings).
export function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
