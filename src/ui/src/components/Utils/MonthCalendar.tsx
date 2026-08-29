import { useMemo } from "react";
import { LONG_MONTHS, todayLocalISO } from "../../utils/date";
import { MonthCursor, ymd } from "../../utils/calendar";
import "../../styles/utils/month-calendar.css";

const WEEKDAYS = ["s", "m", "t", "w", "t", "f", "s"];

// A month grid. `marks` maps YYYY-MM-DD -> accent color for days that have
// events (the first event's color, or a default). Shared by the Events page
// and the Home events square (compact: no month nav, smaller cells).
export default function MonthCalendar({ cursor, onStep, selected, onSelect, marks, compact = false, fill = false }: {
  cursor: MonthCursor;
  onStep?: (delta: number) => void;
  selected?: string | null;
  onSelect?: (iso: string) => void;
  marks: Record<string, string>;
  compact?: boolean;
  // Stretch the week rows to fill the container's height (Home's square box).
  fill?: boolean;
}) {
  const today = todayLocalISO();
  const cells = useMemo(() => {
    const firstDow = new Date(cursor.y, cursor.m0, 1).getDay();
    const days = new Date(cursor.y, cursor.m0 + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  return (
    <div className={`mcal ${compact ? "mcal-compact" : ""} ${fill ? "mcal-fill" : ""}`}>
      <div className="mcal-nav">
        {onStep ? <button className="mcal-arrow" onClick={() => onStep(-1)} aria-label="previous month">‹</button> : <span />}
        <span className="mcal-month">{LONG_MONTHS[cursor.m0]} {cursor.y}</span>
        {onStep ? <button className="mcal-arrow" onClick={() => onStep(1)} aria-label="next month">›</button> : <span />}
      </div>
      <div className="mcal-grid">
        {WEEKDAYS.map((w, i) => <span key={`w${i}`} className="mcal-weekday">{w}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} className="mcal-cell" />;
          const iso = ymd(cursor.y, cursor.m0, d);
          const mark = marks[iso];
          const isToday = iso === today;
          const isSel = iso === selected;
          const cls = ["mcal-day", isSel && "sel", isToday && !isSel && "today", mark && "marked"].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              className="mcal-cell"
              onClick={onSelect ? () => onSelect(iso) : undefined}
              tabIndex={onSelect ? 0 : -1}
            >
              <span className={cls} style={mark && !isSel ? { boxShadow: `inset 0 -3px 0 ${mark}` } : undefined}>
                {d}
                {mark && <span className="mcal-dot" style={{ backgroundColor: isSel ? "white" : mark }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
