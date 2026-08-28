import { EventOut } from "../api";

export const DEFAULT_EVENT_COLOR = "rgb(227, 0, 34)";

/** Group events by day, each day's list sorted by time. */
export function eventsByDate(events: EventOut[]): Record<string, EventOut[]> {
  const map: Record<string, EventOut[]> = {};
  for (const e of events) (map[e.event_date] ||= []).push(e);
  for (const k of Object.keys(map)) map[k].sort((a, b) => (a.event_time || "").localeCompare(b.event_time || ""));
  return map;
}

/** YYYY-MM-DD -> accent color for days with events (first event's color). */
export function eventMarks(byDate: Record<string, EventOut[]>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [d, list] of Object.entries(byDate)) m[d] = list[0].color || DEFAULT_EVENT_COLOR;
  return m;
}
