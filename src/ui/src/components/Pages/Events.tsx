import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { list_events, EventOut } from "../../api";
import { swr } from "../../cache";
import { todayLocalISO } from "../../utils/date";
import { MonthCursor, stepMonth } from "../../utils/calendar";
import { eventsByDate, eventMarks } from "../../utils/events";
import MonthCalendar from "../Utils/MonthCalendar";
import EventRow from "../Utils/EventRow";
import "../../styles/events.css";

// Events (sidebar): a square calendar beside the selected day's events.
export default function Events() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [events, setEvents] = useState<EventOut[]>([]);
  const today = todayLocalISO();
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState<MonthCursor>(() => { const [y, m] = today.split("-").map(Number); return { y, m0: m - 1 }; });

  useEffect(() => {
    let cancelled = false;
    swr("events", () => list_events(token), (e) => { if (!cancelled) setEvents(e); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const marks = useMemo(() => eventMarks(byDate), [byDate]);
  const dayEvents = byDate[selected] || [];
  const [sy, sm, sd] = selected.split("-").map(Number);
  const dayLabel = new Date(sy, sm - 1, sd).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <main className="page events-page">
      <div className="events-inner events-inner-wide">
        <div className="events-header">
          <h1 className="events-title">events</h1>
          <div className="events-actions">
            <button className="events-btn" onClick={() => navigate("/events/new")}>+ new event</button>
          </div>
        </div>
        <div className="events-split">
          <div className="events-split-cal">
            <MonthCalendar cursor={cursor} onStep={(d) => setCursor((c) => stepMonth(c, d))} selected={selected} onSelect={setSelected} marks={marks} fill />
          </div>
          <div className="events-split-day">
            <span className="events-day-label">{selected === today ? "today" : dayLabel}</span>
            {dayEvents.length === 0
              ? <span className="events-empty">no events on this day</span>
              : dayEvents.map((e) => <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.id}`)} />)}
          </div>
        </div>
      </div>
    </main>
  );
}
