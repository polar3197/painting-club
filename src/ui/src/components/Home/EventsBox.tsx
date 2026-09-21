import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { list_events, EventOut } from "../../api";
import { swr } from "../../cache";
import { todayLocalISO } from "../../utils/date";
import { MonthCursor, stepMonth } from "../../utils/calendar";
import { eventsByDate, eventMarks } from "../../utils/events";
import MonthCalendar from "../Utils/MonthCalendar";
import EventRow from "../Utils/EventRow";

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toLowerCase();
};

// The events page (iOS Events twin): the month calendar, then every upcoming
// event in the member's calendar sectioned by date. Picking a day jumps the
// list to it. The tab bar names the page, so there's no heading — just "+".
export default function EventsBox() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [events, setEvents] = useState<EventOut[]>([]);
  const today = todayLocalISO();
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState<MonthCursor>(() => { const [y, m] = today.split("-").map(Number); return { y, m0: m - 1 }; });
  const sections = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    swr("events", () => list_events(token), (e) => { if (!cancelled) setEvents(e); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const marks = useMemo(() => eventMarks(byDate), [byDate]);
  const upcoming = useMemo(() => Object.keys(byDate).filter((d) => d >= today).sort(), [byDate, today]);

  const pick = (d: string) => {
    setSelected(d);
    sections.current[d]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="events-page">
      <div className="events-page-head">
        <button className="add-btn" onClick={() => navigate("/events/new")}>+</button>
      </div>
      <div className="events-page-cal">
        <MonthCalendar cursor={cursor} onStep={(d) => setCursor((c) => stepMonth(c, d))} selected={selected} onSelect={pick} marks={marks} />
      </div>
      <div className="events-page-list">
        {upcoming.length === 0 ? (
          <span className="events-page-empty">no upcoming events</span>
        ) : (
          upcoming.map((d) => (
            <div key={d} ref={(el) => { sections.current[d] = el; }} className="events-page-day">
              <div className={`events-page-date${d === selected ? " on" : ""}`}>{d === today ? "today" : dayLabel(d)}</div>
              {byDate[d].map((e) => <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.id}`)} />)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
